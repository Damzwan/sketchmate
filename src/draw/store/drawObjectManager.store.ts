import { defineStore } from 'pinia'
import { Canvas, FabricObject } from 'fabric'
import { FabricEvent } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import {
  fabricObjectToEntry,
  getViewportRect,
  InfiniteQuadtreeManager,
  QuadtreeEntry
} from '@/draw/utils/QuadTree'
import { isMobile } from '@/helper/general.helper'
import { createYielder } from '@/draw/helpers/yielding.helper'
import { isolatedTileRenderer } from '@/draw/helpers/drawTileRenderer.helper'
import { useFriendStore } from '@/store/friend.store'
import { rerenderActiveObjectControls } from '@/draw/helpers/render.helper'
import * as localTransform from '@/draw/transform/transformController'
import { RenderCore, type Surface } from '@/draw/renderCore'
import type { WorldRect } from '@/draw/committedLayer'
import {
  bakeryBakeTile,
  bakeryClear,
  bakeryMarkDirty,
  bakeryRemove,
  initTileBakery
} from '@/draw/services/tileBakery.service'

const IS_MOBILE = isMobile()
const HW = (navigator as any).hardwareConcurrency || 4
const IS_LOW_END = IS_MOBILE && HW <= 4

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined
  let core: RenderCore<FabricObject> | null = null

  const objectMap = new Map<string, FabricObject>()
  const quadtree = new InfiniteQuadtreeManager<FabricObject>()
  const entryMap = new Map<string, QuadtreeEntry<FabricObject>>()

  const zIndexMap = new Map<FabricObject, number>()
  let isZIndexDirty = true

  let loadingDepth = 0
  const isLoading = () => loadingDepth > 0

  // ── batch mode ─────────────────────────────────────────────────────────
  let batchDepth = 0
  let batchRects: WorldRect[] = []
  const isBatching = () => batchDepth > 0

  function beginBatch() {
    batchDepth++
  }

  function endBatch() {
    batchDepth = Math.max(0, batchDepth - 1)
    if (batchDepth !== 0) return
    const rects = batchRects
    batchRects = []
    if (isLoading() || !core || rects.length === 0) return
    // Batched changes (remote sync, undo/redo) may have altered objects that
    // are currently selected — the drag-layer bitmap can't be trusted anymore.
    localTransform.invalidateCache()
    core.setContentBounds(computeContentBounds())
    core.invalidateRegions(rects)
  }

  /** Returns true if the region was absorbed by the batch (skip per-event core). */
  function noteRegion(rect: WorldRect | null | undefined): boolean {
    if (!isBatching()) return false
    if (rect) batchRects.push(rect)
    return true
  }

  // ── spatial index handed to the renderer (z-sorted query) ────────────────
  const spatialIndex = {
    query: (rect: WorldRect): FabricObject[] => {
      getZIndexMap() // ensure __z stamps are current
      const entries = quadtree.query(rect)
      const objs: FabricObject[] = []
      for (let i = 0; i < entries.length; i++) {
        const o = objectMap.get(entries[i].id)
        if (o) objs.push(o)
      }
      return objs.sort((a, b) => ((a as any).__z ?? 0) - ((b as any).__z ?? 0))
    }
  }

  // ── geometry / index helpers ─────────────────────────────────────────────
  function boundsSig(obj: FabricObject): string {
    const a = obj as any
    const g = obj.group as any // <-- Check for parent group (ActiveSelection)

    let sig =
      `${a.left},${a.top},${a.scaleX},${a.scaleY},${a.angle},` +
      `${a.skewX},${a.skewY},${a.flipX},${a.flipY},` +
      `${a.width},${a.height},${a.strokeWidth},` +
      `${a.text !== undefined ? a.text.length : 0}`

    if (g) {
      sig += `|g:${g.left},${g.top},${g.scaleX},${g.scaleY},${g.angle}`
    }
    return sig
  }

  function cachedBounds(obj: FabricObject): WorldRect {
    const a = obj as any
    const sig = boundsSig(obj)

    if (a.__brSig === sig && a.__br) return a.__br as WorldRect

    // @ts-ignore
    const b = obj.getBoundingRect(true, true)
    const r: WorldRect = { x: b.left, y: b.top, w: b.width, h: b.height }
    a.__brSig = sig
    a.__br = r
    return r
  }

  function objectBounds(obj: FabricObject): WorldRect {
    return cachedBounds(obj)
  }

  /**
   * Where the object USED to be — its cached footprint, but only while that
   * cache still predates the object's current geometry. Null once the cache is
   * current (nothing actually moved) or was never built.
   *
   * Style edits reach us already applied, so unlike `collectOldRect` there is no
   * `transform.original` to rewind to. The bounds cache is the only surviving
   * record of the old footprint, and it IS still intact at that point because
   * nothing has re-measured the object yet.
   */
  function staleBounds(obj: FabricObject): WorldRect | null {
    const a = obj as any
    if (!a.__br) return null
    return a.__brSig === boundsSig(obj) ? null : { ...(a.__br as WorldRect) }
  }

  function unionRect(a: WorldRect, b: WorldRect): WorldRect {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h)
    return { x, y, w: x2 - x, h: y2 - y }
  }

  function getZIndexMap(): Map<FabricObject, number> {
    if (isZIndexDirty) {
      zIndexMap.clear()
      const objs = c!.getObjects()
      for (let i = 0; i < objs.length; i++) {
        zIndexMap.set(objs[i], i);
        (objs[i] as any).__z = i
      }
      isZIndexDirty = false
    }
    return zIndexMap
  }

  function invalidateZIndex() {
    isZIndexDirty = true
  }

  function markZIndexDirty() {
    isZIndexDirty = true
  } // for history layer helpers

  function addToQuadTree(obj: FabricObject) {
    const e = fabricObjectToEntry(obj)
    entryMap.set(obj.id, e)
    quadtree.insert(e)
  }

  function removeFromQuadTree(obj: FabricObject) {
    const e = entryMap.get(obj.id)
    if (e) {
      quadtree.remove(e)
      entryMap.delete(obj.id)
    }
  }

  function updateQuadTree(obj: FabricObject) {
    // Geometry changed ⇒ the worker mirror must resync too. This catches every
    // path that moves an object without firing a fabric event (e.g. a drag
    // committed by transformController when a gesture interrupts it).
    bakeryMarkDirty(obj)
    const e = entryMap.get(obj.id)
    if (!e) return
    const b = cachedBounds(obj)
    e.bounds.x = b.x
    e.bounds.y = b.y
    e.bounds.w = b.w
    e.bounds.h = b.h
    quadtree.update(e)
  }

  /**
   * Fast-path index update for a PURE TRANSLATION (drag commit): the world
   * bounds of every object in the selection shift by exactly (dx, dy), so we
   * shift the entry and the bounds cache instead of recomputing the full
   * transform chain per object. Falls back to the exact recompute when no
   * cache exists yet.
   */
  function offsetQuadTree(obj: FabricObject, dx: number, dy: number) {
    bakeryMarkDirty(obj) // translation commit still moves the mirrored copy
    const e = entryMap.get(obj.id)
    if (!e) return
    const a = obj as any
    if (!a.__br) {
      updateQuadTree(obj)
      return
    }
    const br = a.__br as WorldRect
    a.__br = { x: br.x + dx, y: br.y + dy, w: br.w, h: br.h }
    a.__brSig = boundsSig(obj)
    e.bounds.x += dx
    e.bounds.y += dy
    quadtree.update(e)
  }

  function computeContentBounds(): WorldRect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const obj of objectMap.values()) {
      const b = objectBounds(obj)
      if (!isFinite(b.x) || b.w <= 0 || b.h <= 0) continue
      x0 = Math.min(x0, b.x)
      y0 = Math.min(y0, b.y)
      x1 = Math.max(x1, b.x + b.w)
      y1 = Math.max(y1, b.y + b.h)
    }
    if (!isFinite(x0)) return null
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  /**
   * Pre-move bounding rect, so the object's OLD footprint gets rebuilt. Resets
   * the object to its original transform, measures, then restores. Uses
   * cachedBounds — the temporary set() changes the signature, so it recomputes
   * the old bounds and self-heals on restore.
   */
  function collectOldRect(o: FabricObject, transform: any): WorldRect | null {
    const oldText = (o as any)._textBeforeEdit
    const isTextChanged = oldText !== undefined && oldText !== (o as any).text
    if (!transform?.original && !isTextChanged) return null
    const cur = {
      left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY,
      skewX: o.skewX, skewY: o.skewY, angle: o.angle, flipX: o.flipX,
      flipY: o.flipY, originX: o.originX, originY: o.originY, text: (o as any).text
    }
    try {
      if (transform?.original) o.set(transform.original)
      if (isTextChanged && oldText.length > (o as any).text.length) o.set({ text: oldText })
      o.setCoords()
      const b = cachedBounds(o)
      const snapshot = { ...b } // copy — cache entry will be overwritten on restore
      o.set(cur)
      o.setCoords()
      return snapshot
    } catch {
      o.set(cur)
      o.setCoords()
      return null
    }
  }

  // ── renderers handed to the core ─────────────────────────────────────────
  function renderLive(ctx: CanvasRenderingContext2D, obj: FabricObject) {
    const a = obj as any
    const needsCanvas = !!a.clipPath || !!a.shadow
    const prevCanvas = a.canvas
    const prevCaching = a.objectCaching
    const prevDirty = a.dirty

    if (!needsCanvas) a.canvas = null
    a.objectCaching = false
    a.dirty = true

    // --- NEW: Scale shadow for the live layer based on viewport zoom ---
    const vpt = c!.viewportTransform!
    const originalBlur = a.shadow?.blur
    if (a.shadow) {
      a.shadow.blur = originalBlur * vpt[0]
    }
    // ------------------------------------------------------------------

    try {
      obj.render(ctx)
    } catch { /* ignore */
    } finally {
      if (!needsCanvas) a.canvas = prevCanvas
      a.objectCaching = prevCaching
      a.dirty = prevDirty

      // --- NEW: Restore original shadow ---
      if (a.shadow) a.shadow.blur = originalBlur
      // ------------------------------------
    }
  }

  // ── fabric events → core lifecycle ───────────────────────────────────────
  function onObjectAdded(obj: FabricObject) {
    if (!obj.id) return
    objectMap.set(obj.id, obj)
    if (isLoading()) return // bulk loads reseed the bakery in rebuildIndexFromCanvas
    bakeryMarkDirty(obj)
    addToQuadTree(obj)
    isZIndexDirty = true
    if (noteRegion(objectBounds(obj))) return
    const arr = c!.getObjects()
    const topmost = arr.length > 0 && arr[arr.length - 1] === obj
    core?.onObjectAdded(obj, topmost)
  }

  function onObjectRemoved(obj: FabricObject) {
    if (!obj.id) return
    const oldRect = objectBounds(obj)
    objectMap.delete(obj.id)
    bakeryRemove(obj.id)
    removeFromQuadTree(obj)
    invalidateZIndex()
    if (isLoading()) return
    if (noteRegion(oldRect)) return
    core?.onObjectRemoved(obj, oldRect)
  }

  function onObjectModified(e: any) {
    const obj = e.target as FabricObject
    if (!obj.id || !core) return
    // Local drag is owned by transformController (it renders its own layer).
    if (localTransform.ownsTarget(obj)) {
      updateQuadTree(obj)
      return
    }

    const oldRect = collectOldRect(obj, e.transform)
    updateQuadTree(obj)
    if (isLoading()) return
    if (isBatching()) {
      const cur = objectBounds(obj)
      noteRegion(oldRect ? unionRect(cur, oldRect) : cur)
      return
    }
    core.onObjectChangedCoalesced(obj, oldRect ?? undefined)
  }

  function handleStyleChange(e: any) {
    if (isLoading() || !core) return
    // The transform controller's selection bitmap may show these objects.
    localTransform.invalidateCache()
    const list = (Array.isArray(e.target) ? e.target : [e.target]) as FabricObject[]
    const rects: WorldRect[] = []
    let firstObj: FabricObject | null = null
    let firstOldRect: WorldRect | undefined
    for (const obj of list) {
      if (!obj?.id) continue
      // Grab the pre-mutation footprint BEFORE updateQuadTree re-measures and
      // overwrites the cache. A style change can SHRINK an object — swapping to
      // a narrower font, mainly — and invalidating only the new (smaller) rect
      // is purely additive, so the pixels it vacated stay baked into the tiles
      // as leftover specks.
      const oldRect = staleBounds(obj)
      updateQuadTree(obj)
      const cur = objectBounds(obj)
      if (!firstObj) {
        firstObj = obj
        firstOldRect = oldRect ?? undefined
      }
      rects.push(oldRect ? unionRect(cur, oldRect) : cur)
    }
    if (!firstObj) return
    if (isBatching()) {
      for (const r of rects) noteRegion(r)
      return
    }
    // Single object keeps the precise per-object path; multi-object collapses
    // into ONE merged invalidation instead of N overview patches + N bakes.
    if (rects.length === 1) core.onObjectChanged(firstObj, firstOldRect)
    else core.invalidateRegions(rects)
  }

  const events: FabricEvent[] = [
    { on: 'object:added', handler: (e: any) => onObjectAdded(e.target) },
    { on: 'object:removed', handler: (e: any) => onObjectRemoved(e.target) },
    { on: 'object:modified', handler: (e: any) => onObjectModified(e) },
    {
      on: 'fullErase',
      handler: () => {
        bakeryClear()
        core?.reset()
        core?.requestFrame()
      }
    },
    {
      on: 'backgroundColorChanged',
      handler: () => core?.requestFrame()
    },
    {
      on: 'invalidateCanvas',
      handler: (e: any) => handleStyleChange(e)
    },
    {
      on: 'render:patchModifiedObject',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const o = e.oldRect
        if (!obj || !o || !core) return
        localTransform.invalidateCache()
        updateQuadTree(obj)
        if (isLoading()) return
        const oldRect: WorldRect = {
          x: o.x ?? o.left, y: o.y ?? o.top, w: o.w ?? o.width, h: o.h ?? o.height
        }
        if (isBatching()) {
          noteRegion(unionRect(objectBounds(obj), oldRect))
          return
        }
        core.onObjectChanged(obj, oldRect)
      }
    },
    { on: 'textStyleChanged', handler: (e: any) => handleStyleChange(e) },
    { on: 'objectStyleChanged', handler: (e: any) => handleStyleChange(e) },
    { on: 'imgFilterChanged', handler: (e: any) => handleStyleChange(e) },
    { on: 'flip', handler: (e: any) => handleStyleChange(e) },
    {
      on: 'layer:changed',
      handler: (e: any) => {
        isZIndexDirty = true
        handleStyleChange(e)
      }
    },
    {
      on: 'erasing:end',
      handler: (e: any) => {
        if (isLoading() || !core) return
        const d = e.detail ?? {}
        const path = d.path as FabricObject | undefined
        const rect = d.dirtyRect as WorldRect | undefined
        localTransform.invalidateCache() // selected pixels may have changed
        // targets now carry the new eraser clipPath — mirror must resync them
        for (const t of (d.targets ?? []) as FabricObject[]) {
          if (t?.id) bakeryMarkDirty(t)
        }
        if (isBatching()) {
          if (rect) noteRegion(rect)
          return
        }
        // Tile-stamp fast path only for a plain full erase: selective (lobby)
        // erasing must re-render from objects, inverted "un-erase" adds pixels.
        const canStamp =
          !d.selective &&
          (path as any)?.globalCompositeOperation === 'destination-out'
        if (path && rect) core.onErase(path, rect, canStamp)
        else if (rect) core.markDirty(rect)
      }
    }
  ]

  // ── init / lifecycle ─────────────────────────────────────────────────────
  function init(canvas: Canvas) {
    c = canvas
    initTileBakery() // warm the worker so the first bake doesn't pay spawn+parse

    const surface: Surface = {
      getContext: () => c!.getContext(),
      getSize: () => ({ w: c!.getElement().width, h: c!.getElement().height }),
      getVpt: () => c!.viewportTransform!,
      getDpr: () => window.devicePixelRatio || 1,
      getBackground: () => c!.backgroundColor as string
    }

    core = new RenderCore<FabricObject>(
      spatialIndex,
      isolatedTileRenderer,
      renderLive,
      surface,
      () => createYielder({ budgetMs: IS_LOW_END ? 4 : 8 }) as any,
      {
        memoryBudgetMB: IS_LOW_END ? 96 : 256,
        overviewPx: IS_LOW_END ? 1024 : 2048,
        overviewTier: 2,
        liveMax: IS_LOW_END ? 32 : 64,
        afterComposite: () => {
          if (c) rerenderActiveObjectControls(c)
        },
        tileSize: IS_LOW_END ? 256 : 512,
        poolMax: IS_LOW_END ? 6 : 16,
        maxRenderScale: IS_LOW_END ? 1.5 : 2,
        overviewPatchMax: IS_LOW_END ? 80 : 200,
        remoteBaker: bakeryBakeTile
      }
    )

    rebuildIndexFromCanvas()
    core.setContentBounds(computeContentBounds())
    core.markAllDirty()
    core.warmOverview()
    useDrawEventManager().addPermanentEvents(events)
    core.requestFrame()
  }

  function rebuildIndexFromCanvas() {
    const { isBlocked } = useFriendStore()
    objectMap.clear()
    entryMap.clear()
    quadtree.clear()
    bakeryClear()
    isZIndexDirty = true
    const objs = c!.getObjects()
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i]
      if (isBlocked(obj.userId)) {
        c?.remove(obj)
        continue
      }
      if (obj.id) {
        objectMap.set(obj.id, obj)
        addToQuadTree(obj)
        bakeryMarkDirty(obj) // reseed lazily — serialized only when a bake needs it
      }
    }
  }

  // ── gesture / frame ──────────────────────────────────────────────────────
  function renderMain() {
    core?.requestFrame()
  }

  function renderViewport() {
    core?.requestFrame()
  }

  function onGestureStart() {
    if (!c || !core) return
    if (localTransform.isActive()) localTransform.commit(c)
    core.setGesturing(true)
  }

  function onGestureEnd() {
    core?.setGesturing(false)
  }

  function setErasing(on: boolean) {
    core?.setErasing(on)
  }

  function dropRegion(rect: WorldRect) {
    localTransform.invalidateCache() // e.g. erase undo changed selected pixels
    core?.dropRegion(rect)
  }

  /** Bounded-sync drop for the transform controller's drag seams and history
   *  invalidations. By default does NOT invalidate the transform cache — the
   *  selection itself is unchanged by a move, and nuking the cache here would
   *  force a full re-bake on every re-grab. Callers whose change DOES alter
   *  selected pixels (erase undo/redo) pass `invalidateSelectionCache`. */
  function dropRegionLight(rect: WorldRect, invalidateSelectionCache = false) {
    if (invalidateSelectionCache) localTransform.invalidateCache()
    core?.dropRegionLight(rect, IS_LOW_END ? 4 : 8)
  }

  /**
   * History redo of a plain (destination-out) erase: punch the stroke into
   * the fresh tiles and the overview — pixel-exact, O(touched tiles), zero
   * object re-rendering — instead of dropping the region and sync-rebuilding
   * it from objects. The caller has already applied the clip mutations, so
   * any tile the stamp couldn't cover goes stale and rebakes to the same
   * state.
   */
  function eraseStampCommit(path: FabricObject, rect: WorldRect) {
    if (!core) return
    localTransform.invalidateCache() // selected pixels changed
    core.onErase(path, rect, true)
  }

  /** Stamp the drag-layer bitmap into tiles on transform commit. */
  function stampRegionBitmap(
    rect: WorldRect,
    bmp: ImageBitmap,
    m: [number, number, number, number, number, number]
  ): boolean {
    return core ? core.stampRegionBitmap(rect, bmp, m) : false
  }

  function recordPanDelta(_dx: number, _dy: number) { /* directional prefetch retired */
  }

  // ── loading ──────────────────────────────────────────────────────────────
  function beginLoading() {
    if (loadingDepth === 0) core?.setLoading(true)
    loadingDepth++
  }

  function endLoading() {
    loadingDepth = Math.max(0, loadingDepth - 1)
    if (loadingDepth !== 0) return
    core?.setLoading(false)
    rebuildIndexFromCanvas()
    core?.setContentBounds(computeContentBounds())
    core?.markAllDirty()
    core?.warmOverview()
    core?.requestFrame()
  }

  // ── blocked users ────────────────────────────────────────────────────────
  function purgeBlockedObjects() {
    const { isBlocked } = useFriendStore()
    const toRemove: FabricObject[] = []
    objectMap.forEach((o) => {
      if (isBlocked(o.userId)) toRemove.push(o)
    })
    if (!toRemove.length) return
    // c.remove() fires object:removed → onObjectRemoved does index + core work;
    // doing it manually here as well double-invalidated every region. Batch so
    // N removals collapse into one invalidateRegions pass.
    beginBatch()
    try {
      for (const obj of toRemove) c?.remove(obj)
    } finally {
      endBatch()
    }
    invalidateZIndex()
  }

  // ── public query API ─────────────────────────────────────────────────────
  function query(rect: WorldRect): FabricObject[] {
    return quadtree.query(rect).map((e) => objectMap.get(e.id)).filter(Boolean) as FabricObject[]
  }

  function getVisibleObjects(): FabricObject[] {
    return quadtree.query(getViewportRect(c!)).map((e) => objectMap.get(e.id)).filter(Boolean) as FabricObject[]
  }

  function getObjectById(id: string) {
    return objectMap.get(id)
  }

  function getObjectsById(ids: string[]): FabricObject[] {
    return ids.map((id) => objectMap.get(id)).filter(Boolean) as FabricObject[]
  }

  // ── reset / rebuild ──────────────────────────────────────────────────────
  function resetTileCache() {
    core?.reset()
    core?.setContentBounds(computeContentBounds())
    core?.warmOverview()
    core?.requestFrame()
  }

  /** Await a full overview (base-layer) build. Called during the load reveal so
   *  the first painted frame after a room join already has content — no white
   *  flash. Paints stay suppressed by the core's loading gate until endLoading. */
  async function warmOverviewBlocking() {
    await core?.warmOverviewBlocking()
  }

  function rebuildSpatialIndex() {
    if (!c || !core) return
    rebuildIndexFromCanvas()
    core.reset()
    core.setContentBounds(computeContentBounds())
    core.warmOverview()
    core.requestFrame()
  }

  // ── compatibility shims for external callers ─────────────────────────────
  function scheduleRectPatch(rect: WorldRect) {
    core?.markDirty(rect)
  }

  function scheduleObjectPatch(obj: FabricObject) {
    core?.markDirty(objectBounds(obj))
  }

  function flushPatchesNow(_force = false) {
    core?.requestFrame()
  }

  function isRegionBaked(rect: WorldRect): boolean {
    return core ? core.isRegionBaked(rect) : true
  }

  function patchRectSync(rect: WorldRect) {
    if (!core || !c) return
    if (noteRegion(rect)) return // batched → one invalidate at endBatch
    const vpt = c.viewportTransform!
    const tier = core.pickActiveTier(vpt[0])
    core.markDirtyAndRebuildSync(rect, tier)
  }

  function getZoomLimits() {
    return core ? { min: core.minZoom, max: core.maxZoom } : { min: 0.03125, max: 32 }
  }

  function clearAllObjects() {
    if (!c || !core) return
    objectMap.clear()
    entryMap.clear()
    quadtree.clear()
    bakeryClear()
    zIndexMap.clear()
    isZIndexDirty = true
    core.reset()
    core.setContentBounds(null)
    core.requestFrame()
  }

  return {
    init,
    renderMain,
    renderViewport,
    onGestureStart,
    onGestureEnd,
    recordPanDelta,
    purgeBlockedObjects,
    query,
    getZIndexMap,
    updateQuadTree,
    offsetQuadTree,
    getObjectBounds: objectBounds,
    getStaleObjectBounds: staleBounds,
    getVisibleObjects,
    getObjectById,
    getObjectsById,
    beginLoading,
    endLoading,
    isLoading,
    resetTileCache,
    warmOverviewBlocking,
    rebuildSpatialIndex,
    scheduleRectPatch,
    scheduleObjectPatch,
    flushPatchesNow,
    isRegionBaked,
    setErasing,
    dropRegion,
    dropRegionLight,
    eraseStampCommit,
    stampRegionBitmap,
    patchRectSync,
    beginBatch,
    endBatch,
    isBatching,
    markZIndexDirty,
    getZoomLimits,
    getContentBounds: computeContentBounds,
    clearAllObjects
  }
})