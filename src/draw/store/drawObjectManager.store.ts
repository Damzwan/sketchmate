import { defineStore } from 'pinia'
import { Canvas, FabricObject } from 'fabric'
import { FabricEvent, ObjectType } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import {
  fabricObjectToEntry,
  getViewportRect,
  InfiniteQuadtreeManager,
  QuadtreeEntry,
  Rect
} from '@/draw/utils/QuadTree'
import { useGestureStore } from '@/draw/store/tools/gesture.store'
import { yieldToMain } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined = undefined

  // ─── Object Registry ──────────────────────────────────────────────────────
  // Fast O(1) lookup by ID for all objects on the canvas.
  let objectMap = new Map<string, FabricObject>()

  // ─── Spatial Index ────────────────────────────────────────────────────────
  // The quadtree powers viewport culling: only objects intersecting the current
  // viewport are rendered. entryMap holds references to each object's quadtree
  // entry so we can update or remove them in O(log n).
  const quadtree = new InfiniteQuadtreeManager<FabricObject>()
  const entryMap = new Map<string, QuadtreeEntry<FabricObject>>()

  // Tracks which object IDs were visible in the last render pass, so we can
  // diff against the next pass and toggle .visible only on changed objects.
  let lastVisible = new Set<string>()
  let visibilityScheduled = false

  // ─── Render Pipeline State ────────────────────────────────────────────────
  //
  // There are two render paths that must never write to the stable canvas
  // simultaneously:
  //
  //   1. renderCanvasChunked — a full viewport re-render, chunked across
  //      multiple frames to avoid blocking the main thread. Triggered after
  //      gestures (pan/zoom) end, or after a large batch of changes.
  //
  //   2. invalidateRegion (via triggerBatch) — a surgical patch that redraws
  //      only the dirty bounding box on the stable canvas. Triggered by
  //      individual object mutations (add, modify, remove, style change…).
  //
  // The three flags below coordinate safe handoff between these two paths:

  // Set while renderCanvasChunked holds exclusive write access to the stable
  // canvas. triggerBatch will not call invalidateRegion while this is true;
  // it defers via pendingBatchAfterRender instead.
  let isChunkedRenderRunning = false

  // Set when triggerBatch wanted to flush but isChunkedRenderRunning was true.
  // renderCanvasChunked checks this in its finally block and calls
  // flushPendingBatch() to drain whatever accumulated while it was running.
  let pendingBatchAfterRender = false

  // Set by onGestureEnd() to signal that a full re-render is imminent (the
  // 150ms debounce in endGesture). triggerBatch microtasks that fire in this
  // window must NOT call invalidateRegion — the stable canvas still holds the
  // pre-gesture viewport transform, so any patch would be drawn at the wrong
  // position. Instead they leave their objects in dirtyObjects/dirtyRects and
  // return. The flag is cleared once renderCanvasChunked actually commits,
  // after which flushPendingBatch() replays anything that accumulated.
  let pendingFullRerender = false

  let zIndexMap = new Map<FabricObject, number>()
  let isZIndexDirty = true


  // ─── Canvas Event Handlers ────────────────────────────────────────────────
  // Every mutation that changes what the canvas looks like funnels through
  // scheduleInvalidation / scheduleRectInvalidation, which batch-coalesce
  // multiple synchronous mutations into a single invalidateRegion call.
  const events: FabricEvent[] = [
    {
      on: 'object:added',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.set(obj.id, obj)
        addToQuadTree(obj)
        scheduleInvalidation(obj)

        if (!isZIndexDirty) {
          const allObjects = c!.getObjects()
          if (allObjects[allObjects.length - 1].id === obj.id) {
            zIndexMap.set(obj, allObjects.length - 1)
          } else {
            invalidateZIndex()
          }
        }
      }
    },
    {
      on: 'object:removed',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        scheduleInvalidation(obj)
        objectMap.delete(obj.id)
        removeFromQuadTree(obj)
        invalidateZIndex()
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const transform = e.transform

        // Keep the quadtree in sync with the object's new position.
        if (obj.type == ObjectType.selection) {
          c!.getActiveObjects().forEach(o => updateQuadTree(o))
        } else {
          updateQuadTree(obj)
        }

        if (transform?.original) {
          // The object moved: we need to repaint both where it was (old rect)
          // and where it is now (current position). We calculate the old rect
          // without cloning by briefly reverting the transform math, sampling
          // the bounding box, then restoring — O(1), no heap allocation.
          const currentState = {
            left: obj.left, top: obj.top,
            scaleX: obj.scaleX, scaleY: obj.scaleY,
            skewX: obj.skewX, skewY: obj.skewY,
            angle: obj.angle,
            flipX: obj.flipX, flipY: obj.flipY,
            originX: obj.originX, originY: obj.originY
          }

          obj.set(transform.original)
          obj.setCoords()
          // @ts-ignore
          const oldBound = obj.getBoundingRect(true, true)
          const oldRect = new Rect(oldBound.left, oldBound.top, oldBound.width, oldBound.height)

          obj.set(currentState)
          obj.setCoords()

          scheduleRectInvalidation(oldRect)
          scheduleInvalidation(obj)
        } else {
          // Style / text change: only the current bounding box is dirty.
          scheduleInvalidation(obj)
        }
      }
    },
    {
      // Wipes the entire stable canvas and requests a full Fabric re-render.
      on: 'fullErase',
      handler: () => {
        const physWidth = c!.getElement().width
        const physHeight = c!.getElement().height
        const stableCanvas = getStableCanvas(physWidth, physHeight)
        const stableCtx = stableCanvas.getContext('2d')!

        stableCtx.save()
        stableCtx.setTransform(1, 0, 0, 1, 0, 0)
        stableCtx.clearRect(0, 0, physWidth, physHeight)
        if (c!.backgroundColor) {
          stableCtx.fillStyle = c!.backgroundColor as string
          stableCtx.fillRect(0, 0, physWidth, physHeight)
        }
        stableCtx.restore()
        c!.requestRenderAll()
      }
    },
    // All of the following just funnel their target(s) into scheduleInvalidation.
    {
      on: 'textStyleChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'objectStyleChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'imgFilterChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'flip',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'layer:changed', // You already have this perfect event!
      handler: (e: any) => {
        scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
        invalidateZIndex()
      }
    },
    {
      on: 'erasing:end',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.detail.targets) ? e.detail.targets : [e.detail.targets])
    },
    {
      // Background color change requires a full stable canvas repaint since
      // every pixel's background is affected, then a visibility refresh.
      on: 'backgroundColorChanged',
      handler: (e: any) => {
        const physWidth = c!.getElement().width
        const physHeight = c!.getElement().height
        const stableCanvas = getStableCanvas(physWidth, physHeight)
        const stableCtx = stableCanvas.getContext('2d')! as any

        stableCtx.save()
        stableCtx.setTransform(1, 0, 0, 1, 0, 0)
        stableCtx.clearRect(0, 0, physWidth, physHeight)
        if (e.color) {
          stableCtx.fillStyle = e.color
          stableCtx.fillRect(0, 0, physWidth, physHeight)
        }
        stableCtx.restore()
        updateVisibility()
      }
    },
    {
      on: 'invalidateCanvas',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      // Used by undo/redo: provides the old rect explicitly so we don't have
      // to reverse-engineer it from transform history.
      on: 'render:patchModifiedObject',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const oldRect = e.oldRect as Rect
        if (!obj || !oldRect) return
        updateQuadTree(obj)
        scheduleRectInvalidation(oldRect)
        scheduleInvalidation(obj)
      }
    }
  ]


  // ─── Public Accessors ─────────────────────────────────────────────────────

  function getObjectById(id: string): FabricObject | undefined {
    return objectMap.get(id)
  }

  function getObjectsById(ids: string[]): FabricObject[] {
    return ids.map(id => getObjectById(id)).filter(obj => !!obj)
  }


  // ─── Initialisation ───────────────────────────────────────────────────────

  function init(canvas: Canvas) {
    c = canvas
    addStartingCanvasObjects()
    const { addPermanentEvents } = useDrawEventManager()
    addPermanentEvents(events)
  }

  function addStartingCanvasObjects() {
    const authStore = useAuthStore()
    const blockedIds = authStore.user?.blocked_users || []

    // Reset indices
    objectMap = new Map<string, FabricObject>()
    lastVisible = new Set<string>()
    quadtree.clear()

    const allObjects = c!.getObjects()

    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i]
      const creatorId = obj.userId

      if (blockedIds.includes(creatorId)) {
        c?.remove(obj)
        continue
      }

      if (obj.id) {
        objectMap.set(obj.id, obj)
        addToQuadTree(obj)
      }
    }
  }


  // ─── Visibility & Full Re-render ──────────────────────────────────────────

  // Queries the quadtree for the current viewport, diffs against lastVisible
  // to toggle .visible flags, then kicks off a chunked render of all visible
  // objects. This is the "heavy" path — only called after gestures or large
  // batch changes, never for individual object mutations.
  function updateVisibility(runSync = true): void {
    const execute = () => {
      visibilityScheduled = false
      const viewport = getViewportRect(c!)
      const visible = quadtree.query(viewport)

      const nextVisible = new Set<string>()

      // Loop 1: Handle objects entering the viewport
      for (const e of visible) {
        const obj = objectMap.get(e.id);
        if (!obj) {
          const entry = entryMap.get(e.id);
          if (entry) quadtree.remove(entry);
          continue;
        }

        nextVisible.add(e.id);
        if (!lastVisible.has(e.id)) {
          obj.visible = true;
        }
      }

      for (const id of lastVisible) {
        if (!nextVisible.has(id)) {
          const obj = objectMap.get(id);
          if (obj) obj.visible = false;
        }
      }

      lastVisible = nextVisible

      const visibleObjects = getObjectsById(Array.from(nextVisible))
      const currentZIndexMap = getZIndexMap()

      visibleObjects.sort((a, b) => {
        const zA = currentZIndexMap.get(a) ?? 0
        const zB = currentZIndexMap.get(b) ?? 0
        return zA - zB
      })

      renderCanvasChunked(c!, visibleObjects)
    }

    if (!runSync) {
      execute()
    } else {
      // Deduplicate: if a visibility update is already queued for the next
      // animation frame, don't queue another one.
      if (visibilityScheduled) return
      visibilityScheduled = true
      requestAnimationFrame(execute)
    }
  }


  // ─── Offscreen Canvas Buffers ─────────────────────────────────────────────
  //
  // Two offscreen buffers keep the render pipeline non-destructive:
  //
  //   workingCanvas — renderCanvasChunked draws into this scratch buffer
  //                   frame-by-frame. The main screen is never touched until
  //                   the full render is complete.
  //
  //   stableCanvas  — the last fully-committed frame. commitToMainScreen blits
  //                   this to the DOM canvas. invalidateRegion also patches
  //                   directly into this buffer for surgical updates.

  let currentRenderId = 0
  let stableOffscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  let workingOffscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null

  function getStableCanvas(width: number, height: number) {
    if (!stableOffscreenCanvas) {
      stableOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas')
    }
    if (stableOffscreenCanvas.width !== width || stableOffscreenCanvas.height !== height) {
      stableOffscreenCanvas.width = width
      stableOffscreenCanvas.height = height
    }
    return stableOffscreenCanvas
  }

  function getWorkingCanvas(width: number, height: number) {
    if (!workingOffscreenCanvas) {
      workingOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas')
    }
    if (workingOffscreenCanvas.width !== width || workingOffscreenCanvas.height !== height) {
      workingOffscreenCanvas.width = width
      workingOffscreenCanvas.height = height
    }
    return workingOffscreenCanvas
  }


  // ─── Chunked Full Render ───────────────────────────────────────────────────
  //
  // Renders all visible objects into the working canvas in 8ms time-sliced
  // chunks, yielding between chunks so the main thread stays responsive.
  // Once complete, atomically copies the working canvas into the stable canvas
  // and blits to the DOM.
  //
  // Abort conditions (stale renderId or gesture started mid-render) cleanly
  // exit without touching the stable canvas, leaving the last good frame
  // intact on screen.
  async function renderCanvasChunked(canvas: Canvas, objects: FabricObject[]) {
    const renderId = ++currentRenderId
    const gestureStore = useGestureStore()

    // Yield immediately so that any synchronous state changes (e.g. the gesture
    // flag being cleared by onGestureEnd) have settled before we proceed.
    await yieldToMain()

    if (renderId !== currentRenderId || gestureStore.isGesturing) {
      // A newer render was requested, or a gesture started — abort immediately.
      // Clear the cooldown flag so triggerBatch can operate normally again
      // once things settle.
      pendingFullRerender = false
      isChunkedRenderRunning = false
      flushPendingBatch()
      return
    }

    // From this point we own the stable canvas. Block triggerBatch from
    // calling invalidateRegion until we commit (see finally block).
    pendingFullRerender = false
    isChunkedRenderRunning = true

    canvas.fire('render:pipeline:start' as any)
    try {
      const physWidth = canvas.getElement().width
      const physHeight = canvas.getElement().height
      const workingCanvas = getWorkingCanvas(physWidth, physHeight)
      const workingCtx = workingCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
      const targetVpt = [...canvas.viewportTransform!] as number[]
      const frozenBg = canvas.backgroundColor
      const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)

      // Paint background into the working canvas.
      workingCtx.clearRect(0, 0, workingCanvas.width, workingCanvas.height)
      if (frozenBg) {
        workingCtx.fillStyle = frozenBg as string
        workingCtx.fillRect(0, 0, workingCanvas.width, workingCanvas.height)
      }

      // Apply the viewport transform once; all object renders inherit it.
      workingCtx.save()
      workingCtx.setTransform(1, 0, 0, 1, 0, 0)
      workingCtx.scale(dpr, dpr)
      workingCtx.transform(
        targetVpt[0], targetVpt[1],
        targetVpt[2], targetVpt[3],
        targetVpt[4], targetVpt[5]
      )

      let i = 0
      const TIME_BUDGET_MS = 8

      while (i < objects.length) {
        // Check for abort between chunks — a gesture may have started, or a
        // newer updateVisibility call may have superseded this render.
        if (renderId !== currentRenderId || gestureStore.isGesturing) {
          workingCtx.restore()
          pendingFullRerender = false
          isChunkedRenderRunning = false
          flushPendingBatch()
          return
        }

        const frameStartTime = performance.now()
        while (i < objects.length && (performance.now() - frameStartTime) < TIME_BUDGET_MS) {
          objects[i].render(workingCtx as CanvasRenderingContext2D)
          i++
        }

        if (i < objects.length) await yieldToMain()
      }

      workingCtx.restore()
      // @ts-ignore
      if (!canvas.skipControlsDrawing) canvas.drawControls(workingCtx as CanvasRenderingContext2D)

      // Final abort check before committing — we don't want to overwrite the
      // stable canvas if a gesture snuck in during the last chunk.
      if (renderId === currentRenderId && !gestureStore.isGesturing) {
        gestureStore.setRenderedVpt(targetVpt)

        // Atomic commit: copy working → stable, then blit stable → DOM.
        const stableCanvas = getStableCanvas(physWidth, physHeight)
        const stableCtx = stableCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
        stableCtx.clearRect(0, 0, stableCanvas.width, stableCanvas.height)
        stableCtx.drawImage(workingCanvas as CanvasImageSource, 0, 0)

        commitToMainScreen(canvas)
      }
      canvas.fire('render:pipeline:end' as any)
    } finally {
      // Always release the lock, even on exception. Then replay any surgical
      // patches that were deferred while we held the stable canvas.
      isChunkedRenderRunning = false
      flushPendingBatch()
    }
  }


  // ─── Surgical Patch Pipeline ──────────────────────────────────────────────
  //
  // For individual object mutations we avoid a full re-render by painting only
  // the union bounding box of all dirty objects directly onto the stable canvas,
  // then blitting to the DOM. This is the "fast path" for live edits.

  const dirtyObjects = new Set<FabricObject>()
  const dirtyRects = new Set<Rect>()   // Raw rects for undo/redo old positions
  let isBatchScheduled = false

  // Adds an object (or array of objects) to the dirty set and schedules a
  // microtask to flush them. Multiple synchronous calls coalesce into one flush.
  function scheduleInvalidation(target: FabricObject | FabricObject[]) {
    const objects = Array.isArray(target) ? target : [target]
    objects.forEach(o => dirtyObjects.add(o))
    triggerBatch()
  }

  // Same as scheduleInvalidation but for a raw Rect (used when we know the old
  // bounding box of a moved object but no longer have the FabricObject at that
  // position).
  function scheduleRectInvalidation(rect: Rect) {
    dirtyRects.add(rect)
    triggerBatch()
  }

  // Schedules a single microtask to flush all currently dirty objects/rects.
  // Guards against running while a chunked render or post-gesture cooldown is
  // active — in those cases it marks pendingBatchAfterRender and returns,
  // letting the chunked render's finally block replay the flush.
  function triggerBatch() {

    if (isBatchScheduled) return
    isBatchScheduled = true

    queueMicrotask(() => {
      isBatchScheduled = false
      const gestureStore = useGestureStore()

      // During a gesture the viewport transform changes every frame. Any patch
      // we drew would immediately be at the wrong position. Just accumulate.
      if (gestureStore.isGesturing) return

      // A full re-render is imminent (post-gesture cooldown). The stable canvas
      // still holds the old viewport transform — don't patch it. Accumulate and
      // let renderCanvasChunked's finally block flush after it commits.
      if (pendingFullRerender) return

      // The stable canvas is being rewritten by renderCanvasChunked. Mark the
      // pending flag so its finally block replays our flush once it's done.
      if (isChunkedRenderRunning) {
        pendingBatchAfterRender = true
        return
      }


      flushDirtyBatch()
    })
  }

  // Drains dirtyObjects and dirtyRects into a single invalidateRegion call.
  // Falls back to a full updateVisibility if the batch is too large (> 50
  // items) — at that scale a full re-render is cheaper than a giant union rect.
  function flushDirtyBatch(force: boolean = false) {
    if (dirtyObjects.size === 0 && dirtyRects.size === 0) return

    const gestureStore = useGestureStore()

    if (!force && gestureStore.isGesturing) return

    if (force && (isChunkedRenderRunning || pendingFullRerender)) {
      pendingBatchAfterRender = true
      return
    }

    const batchObjects = Array.from(dirtyObjects)
    const batchRects = Array.from(dirtyRects)
    dirtyObjects.clear()
    dirtyRects.clear()

    if (batchObjects.length + batchRects.length > 50) {
      updateVisibility(false)
      return
    }

    invalidateRegion(c!, batchObjects, batchRects)
    commitToMainScreen(c!)
  }

  // Called from renderCanvasChunked's finally block. Replays any batch that
  // was deferred while the chunked render held the stable canvas.
  function flushPendingBatch() {
    if (!pendingBatchAfterRender) return
    pendingBatchAfterRender = false
    flushDirtyBatch()
  }


  // ─── Quadtree Helpers ─────────────────────────────────────────────────────

  function addToQuadTree(obj: FabricObject) {
    const entry = fabricObjectToEntry(obj)
    entryMap.set(obj.id, entry)
    quadtree.insert(entry)
  }

  function removeFromQuadTree(obj: FabricObject): void {
    const entry = entryMap.get(obj.id)
    if (entry) {
      quadtree.remove(entry)
      entryMap.delete(obj.id)
    }
  }

  function updateQuadTree(obj: FabricObject): void {
    const entry = entryMap.get(obj.id)
    if (!entry) return
    const b = obj.getBoundingRect()
    entry.bounds.x = b.left
    entry.bounds.y = b.top
    entry.bounds.w = b.width
    entry.bounds.h = b.height
    quadtree.update(entry)
  }

  function getVisibleObjects(): FabricObject[] {
    const viewport = getViewportRect(c!)
    return quadtree.query(viewport)
      .map(item => objectMap.get(item.id))
      .filter(i => !!i)
  }

  function query(rect: Rect): FabricObject[] {
    return quadtree.query(rect)
      .map(item => objectMap.get(item.id))
      .filter(i => !!i)
  }


  // ─── Object Caching Heuristic ─────────────────────────────────────────────
  //
  // During interaction (pan/zoom) we disable Fabric's per-object raster cache
  // to avoid expensive cache invalidations on every frame. Once the interaction
  // settles we selectively re-enable it for complex paths where the cache pays
  // for itself in render time.

  const RASTERIZE_THRESHOLD = 70

  function setVisibleObjectsState(mode: 'interaction' | 'static') {
    getVisibleObjects().forEach((obj: any) => {
      // Images and text manage their own caching — don't interfere.
      if (obj.type === 'image' || obj.type === 'i-text' || obj.type === 'textbox') return

      // Pattern strokes can't be cached.
      if (!!(obj as any)?.stroke?.source) {
        obj.objectCaching = false
        return
      }

      if (obj.path || (obj?.compressedTrace && obj.compressedTrace?.length)) {
        const isComplex = obj?.compressedTrace
          ? obj.compressedTrace.length > RASTERIZE_THRESHOLD
          : obj.path.length > RASTERIZE_THRESHOLD

        if (mode === 'interaction') {
          obj.objectCaching = false
        } else {
          obj.objectCaching = isComplex
          obj.dirty = isComplex
        }
      }
    })
  }


  // ─── Viewport Intersection Tests ──────────────────────────────────────────

  function isObjectInViewport(canvas: Canvas, obj: FabricObject): boolean {
    const vpt = getViewportRect(canvas)
    // @ts-ignore
    const b = obj.getBoundingRect(true, true)
    return !(
      b.left > vpt.x + vpt.w ||
      b.left + b.width < vpt.x ||
      b.top > vpt.y + vpt.h ||
      b.top + b.height < vpt.y
    )
  }

  function isRectInViewport(canvas: Canvas, r: Rect): boolean {
    const vpt = getViewportRect(canvas)
    return !(
      r.x > vpt.x + vpt.w ||
      r.x + r.w < vpt.x ||
      r.y > vpt.y + vpt.h ||
      r.y + r.h < vpt.y
    )
  }


  // ─── Surgical Region Invalidation ─────────────────────────────────────────
  //
  // Repaints the union bounding box of all dirty objects and rects directly
  // onto the stable canvas. Only objects that intersect the dirty region are
  // re-rendered, sorted by Fabric's Z-order to preserve layer correctness.
  function invalidateRegion(canvas: Canvas, objects: FabricObject[], rects: Rect[] = []) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let anyVisible = false

    for (const r of rects) {
      if (!isRectInViewport(canvas, r)) continue
      anyVisible = true
      minX = Math.min(minX, r.x)
      maxX = Math.max(maxX, r.x + r.w)
      minY = Math.min(minY, r.y)
      maxY = Math.max(maxY, r.y + r.h)
    }

    for (const obj of objects) {
      updateQuadTree(obj)
      if (!isObjectInViewport(canvas, obj)) continue
      anyVisible = true
      // @ts-ignore
      const b = obj.getBoundingRect(true, true)
      minX = Math.min(minX, b.left)
      maxX = Math.max(maxX, b.left + b.width)
      minY = Math.min(minY, b.top)
      maxY = Math.max(maxY, b.top + b.height)
    }

    if (!anyVisible) return

    // Generous padding absorbs thick strokes and shadow blur that extend
    // beyond the geometric bounding box.
    const padding = 20
    const x = minX - padding
    const y = minY - padding
    const w = (maxX - minX) + padding * 2
    const h = (maxY - minY) + padding * 2

    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height
    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const stableCtx = stableCanvas.getContext('2d')!
    const gestureStore = useGestureStore()
    const vpt = gestureStore.renderedVpt

    const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)

    stableCtx.save()
    stableCtx.setTransform(1, 0, 0, 1, 0, 0)
    stableCtx.scale(dpr, dpr)
    stableCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])

    // Punch the dirty rect: clear it and refill with the background color so
    // we're painting onto a clean slate before re-rendering neighbors.
    stableCtx.clearRect(x, y, w, h)
    if (canvas.backgroundColor) {
      stableCtx.fillStyle = canvas.backgroundColor as string
      stableCtx.fillRect(x, y, w, h)
    }

    // Clip to the dirty rect so neighboring objects can't bleed outside it.
    const scale = vpt[0]
    const clipSlop = 2 / scale  // 2 physical pixels, back-projected to world space

    stableCtx.beginPath()
    stableCtx.rect(x - clipSlop, y - clipSlop, w + clipSlop * 2, h + clipSlop * 2)
    stableCtx.clip()

    // Query the quadtree for all objects that overlap the dirty rect, sort by
    // Fabric Z-order, and redraw. This ensures overlapping objects composite
    // correctly without re-rendering the whole canvas.
    const neighbors = query(new Rect(x, y, w, h))
    const currentZIndexMap = getZIndexMap()
    neighbors.sort((a, b) => {
      const zA = currentZIndexMap.get(a) ?? 0
      const zB = currentZIndexMap.get(b) ?? 0
      return zA - zB
    })

    for (const neighbor of neighbors) {
      if (neighbor.visible !== false) {
        neighbor.render(stableCtx as CanvasRenderingContext2D)
      }
    }

    stableCtx.restore()
  }


  // ─── DOM Blit ─────────────────────────────────────────────────────────────
  //
  // Copies the stable canvas to the visible DOM canvas and draws any active
  // selection handles on top. This is the only function that writes to the
  // DOM canvas (outside of fastBlit during gestures).
  function commitToMainScreen(canvas: Canvas) {
    const gestureStore = useGestureStore()
    if (gestureStore.isGesturing) return  // fastBlit owns the screen during gestures
    if (pendingFullRerender) return


    const mainCtx = canvas.getContext()
    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height
    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)

    mainCtx.save()
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.scale(dpr, dpr)
    mainCtx.clearRect(0, 0, physWidth, physHeight)
    // 9-argument form maps physical pixels correctly on Retina displays.
    mainCtx.drawImage(
      stableCanvas as CanvasImageSource,
      0, 0, physWidth, physHeight,
      0, 0, canvas.width!, canvas.height!
    )
    mainCtx.restore()

    // @ts-ignore
    if (!canvas.skipControlsDrawing) canvas.drawControls(mainCtx)

    canvas.fire('after:render', { ctx: mainCtx })
  }


  // ─── Gesture Coordination ─────────────────────────────────────────────────
  //
  // Called synchronously by endGesture() immediately after isGesturing is set
  // to false. Sets pendingFullRerender to block triggerBatch microtasks from
  // calling invalidateRegion while the stable canvas still holds the pre-gesture
  // viewport transform. The block is lifted once renderCanvasChunked commits
  // its first post-gesture frame.
  function onGestureEnd() {
    pendingFullRerender = true
    isBatchScheduled = false
    if (!isChunkedRenderRunning) {
      pendingBatchAfterRender = false
    }
  }

  function onGestureStart() {
    // Cancel any pending full re-render that was queued from a previous gesture.
    // Without this, the visibilityTimeout's updateVisibility() can fire mid-gesture
    // and commit a chunked render with a stale viewport into the stable canvas.
    pendingFullRerender = false
    pendingBatchAfterRender = false
    // Do NOT clear dirtyObjects/dirtyRects — accumulate them for after the gesture.
  }

  function invalidateZIndex() {
    isZIndexDirty = true
  }

  function getZIndexMap() {
    if (isZIndexDirty) {
      zIndexMap.clear()
      const canvasObjects = c!.getObjects()
      for (let i = 0; i < canvasObjects.length; i++) {
        zIndexMap.set(canvasObjects[i], i)
      }
      isZIndexDirty = false
    }
    return zIndexMap
  }


  function purgeBlockedObjects() {
    const { user } = useAuthStore()
    const blockedIds = user?.blocked_users || []

    if (blockedIds.length === 0) return

    const objectsToRemove: FabricObject[] = []

    // 1. Identify all objects in the map belonging to blocked users
    objectMap.forEach((obj) => {
      const creatorId = obj.userId
      if (blockedIds.includes(creatorId)) {
        objectsToRemove.push(obj)
      }
    })

    if (objectsToRemove.length === 0) return

    objectsToRemove.forEach(obj => {
      if (obj.id) {
        objectMap.delete(obj.id)
        removeFromQuadTree(obj)
      }
      c?.remove(obj)
    })

    updateVisibility(true)
  }


  return {
    init,
    getObjectsById,
    getObjectById,
    updateVisibility,
    updateQuadTree,
    getVisibleObjects,
    setVisibleObjectsState,
    query,
    getStableCanvas,
    onGestureEnd,
    flushDirtyBatch,
    onGestureStart,
    purgeBlockedObjects,
    getZIndexMap
  }
})