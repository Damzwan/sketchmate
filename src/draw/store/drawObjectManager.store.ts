// src/draw/store/drawObjectManager.store.ts
//
// THIN SHELL over RenderCore. This store keeps the plumbing the rest of the app
// depends on — the quadtree / object map, z-index map, loading depth, blocked-
// user purge, and the public query API — and delegates ALL rendering decisions
// to RenderCore (committed tiles + world overview + live layer).
//
// What used to live here and is now GONE (RenderCore makes it unnecessary):
//   additive patching, the additive burst/overheat/giant-object machinery,
//   subtractive-erase tile patching, the modify-storm / remoteOverlay / big-
//   object branching, deferred-during-gesture queues, coarse-bake scheduling,
//   directional pan prefetch, and every invalidate* variant. Each existed only
//   to work around in-place tile mutation; with rebuild-only tiles they don't.
//
// In-flight objects (your stroke, a collaborator's stroke, a drag) ride the
// LIVE layer and are handed to committed once their tiles are fresh. Everything
// else is: update the index → markDirty(region) → RenderCore rebuilds + frames.

import { defineStore } from "pinia";
import { Canvas, FabricObject } from "fabric";
import { FabricEvent } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import {
  fabricObjectToEntry,
  getViewportRect,
  InfiniteQuadtreeManager,
  QuadtreeEntry,
} from "@/draw/utils/QuadTree";
import { isMobile } from "@/helper/general.helper";
import { createYielder } from "@/draw/helpers/yielding.helper";
import { isolatedTileRenderer } from "@/draw/helpers/drawTileRenderer.helper";
import { useFriendStore } from "@/store/friend.store";
import { rerenderActiveObjectControls } from "@/draw/helpers/render.helper";
import * as localTransform from "@/draw/transform/transformController";
import { RenderCore, type Surface } from "@/draw/renderCore";
import type { WorldRect } from "@/draw/committedLayer";

const IS_MOBILE = isMobile();
const HW = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW <= 4;

export const useDrawObjectManager = defineStore("drawObjectManager", () => {
  let c: Canvas | undefined;
  let core: RenderCore<FabricObject> | null = null;

  const objectMap = new Map<string, FabricObject>();
  const quadtree = new InfiniteQuadtreeManager<FabricObject>();
  const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

  const zIndexMap = new Map<FabricObject, number>();
  let isZIndexDirty = true;

  let loadingDepth = 0;
  const isLoading = () => loadingDepth > 0;

  // ── spatial index handed to the renderer (z-sorted query) ────────────────
  const spatialIndex = {
    query: (rect: WorldRect): FabricObject[] => {
      const objs = quadtree
        .query(rect)
        .map((e) => objectMap.get(e.id))
        .filter(Boolean) as FabricObject[];
      const z = getZIndexMap();
      return objs.sort((a, b) => (z.get(a) ?? 0) - (z.get(b) ?? 0));
    },
  };

  // ── geometry / index helpers ─────────────────────────────────────────────
  function objectBounds(obj: FabricObject): WorldRect {
    // @ts-ignore
    const b = obj.getBoundingRect(true, true);
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  function getZIndexMap(): Map<FabricObject, number> {
    if (isZIndexDirty) {
      zIndexMap.clear();
      c!.getObjects().forEach((o, i) => zIndexMap.set(o, i));
      isZIndexDirty = false;
    }
    return zIndexMap;
  }
  function invalidateZIndex() { isZIndexDirty = true; }

  function addToQuadTree(obj: FabricObject) {
    const e = fabricObjectToEntry(obj);
    entryMap.set(obj.id, e);
    quadtree.insert(e);
  }
  function removeFromQuadTree(obj: FabricObject) {
    const e = entryMap.get(obj.id);
    if (e) { quadtree.remove(e); entryMap.delete(obj.id); }
  }
  function updateQuadTree(obj: FabricObject) {
    const e = entryMap.get(obj.id);
    if (!e) return;
    // @ts-ignore
    const b = obj.getBoundingRect(true, true);
    e.bounds.x = b.left; e.bounds.y = b.top; e.bounds.w = b.width; e.bounds.h = b.height;
    quadtree.update(e);
  }

  function computeContentBounds(): WorldRect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const obj of objectMap.values()) {
      const b = objectBounds(obj);
      if (!isFinite(b.x) || b.w <= 0 || b.h <= 0) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (!isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Pre-move bounding rect, so the object's OLD footprint gets rebuilt. Resets
   * the object to its original transform, measures, then restores. Best-effort.
   */
  function collectOldRect(o: FabricObject, transform: any): WorldRect | null {
    const oldText = (o as any)._textBeforeEdit;
    const isTextChanged = oldText !== undefined && oldText !== (o as any).text;
    if (!transform?.original && !isTextChanged) return null;
    const cur = {
      left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY,
      skewX: o.skewX, skewY: o.skewY, angle: o.angle, flipX: o.flipX,
      flipY: o.flipY, originX: o.originX, originY: o.originY, text: (o as any).text,
    };
    try {
      if (transform?.original) o.set(transform.original);
      if (isTextChanged && oldText.length > (o as any).text.length) o.set({ text: oldText });
      o.setCoords();
      const b = objectBounds(o);
      o.set(cur); o.setCoords();
      return b;
    } catch {
      o.set(cur); o.setCoords();
      return null;
    }
  }

  // ── renderers handed to the core ─────────────────────────────────────────
  // Live items render in WORLD space (the live layer already applied vpt/gco).
  function renderLive(ctx: CanvasRenderingContext2D, obj: FabricObject) {
    const prev = (obj as any).canvas;
    // @ts-ignore
    obj.canvas = null; obj.objectCaching = false; obj.dirty = true;
    try { obj.render(ctx); } catch { /* ignore */ }
      // @ts-ignore
    finally { obj.canvas = prev; }
  }

  // ── fabric events → core lifecycle ───────────────────────────────────────
  function onObjectAdded(obj: FabricObject) {
    if (!obj.id) return;
    objectMap.set(obj.id, obj);
    if (isLoading()) return;          // index rebuilt wholesale at endLoading
    addToQuadTree(obj);
    isZIndexDirty = true;
    core?.onObjectAdded(obj);
  }

  function onObjectRemoved(obj: FabricObject) {
    if (!obj.id) return;
    const oldRect = objectBounds(obj);
    objectMap.delete(obj.id);
    removeFromQuadTree(obj);
    invalidateZIndex();
    if (!isLoading()) core?.onObjectRemoved(obj, oldRect);
  }

  function onObjectModified(e: any) {
    const obj = e.target as FabricObject;
    if (!obj.id || !core) return;
    // Local drag is owned by transformController (it renders its own layer).
    if (localTransform.ownsTarget(obj)) {
      updateQuadTree(obj);
      return;
    }

    const oldRect = collectOldRect(obj, e.transform);
    updateQuadTree(obj);
    if (isLoading()) return;
    core.liveAdd(obj, "normal");        // smooth while a remote drag streams in
    core.onObjectChanged(obj, oldRect); // committed catches up; live demotes when ready
  }

  function handleStyleChange(e: any) {
    if (isLoading() || !core) return;
    const list = (Array.isArray(e.target) ? e.target : [e.target]) as FabricObject[];
    for (const obj of list) {
      if (!obj?.id) continue;
      updateQuadTree(obj);
      core.onObjectChanged(obj);
    }
  }

  const events: FabricEvent[] = [
    { on: "object:added", handler: (e: any) => onObjectAdded(e.target) },
    { on: "object:removed", handler: (e: any) => onObjectRemoved(e.target) },
    { on: "object:modified", handler: (e: any) => onObjectModified(e) },
    {
      on: "fullErase",
      handler: () => { core?.reset(); core?.requestFrame(); },
    },
    {
      on: "backgroundColorChanged",
      handler: () => core?.requestFrame(),
    },
    {
      on: "invalidateCanvas",
      handler: (e: any) => {
        if (isLoading() || !core) return;
        const targets = Array.isArray(e.target) ? e.target : [e.target];
        for (const obj of targets as FabricObject[]) {
          if (!obj?.id) continue;
          updateQuadTree(obj);
          core.onObjectChanged(obj);
        }
      },
    },
    {
      on: "render:patchModifiedObject",
      handler: (e: any) => {
        const obj = e.target as FabricObject;
        const o = e.oldRect;
        if (!obj || !o || !core) return;
        updateQuadTree(obj);
        if (isLoading()) return;
        core.onObjectChanged(obj, {
          x: o.x ?? o.left, y: o.y ?? o.top, w: o.w ?? o.width, h: o.h ?? o.height,
        });
      },
    },
    { on: "textStyleChanged", handler: (e: any) => handleStyleChange(e) },
    { on: "objectStyleChanged", handler: (e: any) => handleStyleChange(e) },
    { on: "imgFilterChanged", handler: (e: any) => handleStyleChange(e) },
    { on: "flip", handler: (e: any) => handleStyleChange(e) },
    {
      on: "layer:changed",
      handler: (e: any) => { isZIndexDirty = true; handleStyleChange(e); },
    },
    {
      on: "erasing:end",
      handler: (e: any) => {
        if (isLoading() || !core) return;
        const d = e.detail ?? {};
        const path = d.path as FabricObject | undefined;
        const rect = d.dirtyRect as WorldRect | undefined;

        if (path && rect) core.onErase(path, rect);
        else if (rect) core.markDirty(rect);
      },
    },
  ];

  // ── init / lifecycle ─────────────────────────────────────────────────────
  function init(canvas: Canvas) {
    c = canvas;

    const surface: Surface = {
      getContext: () => c!.getContext(),
      getSize: () => ({ w: c!.getElement().width, h: c!.getElement().height }),
      getVpt: () => c!.viewportTransform!,
      getDpr: () => window.devicePixelRatio || 1,
      getBackground: () => c!.backgroundColor as string,
    };

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
        afterComposite: () => { if (c) rerenderActiveObjectControls(c); },
      },
    );

    rebuildIndexFromCanvas();
    core.setContentBounds(computeContentBounds());
    core.markAllDirty();
    core.warmOverview();
    useDrawEventManager().addPermanentEvents(events);
    core.requestFrame();
  }

  function rebuildIndexFromCanvas() {
    const { isBlocked } = useFriendStore();
    objectMap.clear();
    entryMap.clear();
    quadtree.clear();
    isZIndexDirty = true;
    const objs = c!.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i];
      if (isBlocked(obj.userId)) { c?.remove(obj); continue; }
      if (obj.id) { objectMap.set(obj.id, obj); addToQuadTree(obj); }
    }
  }

  // ── gesture / frame ──────────────────────────────────────────────────────
  function renderMain() { core?.requestFrame(); }
  function renderViewport() { core?.requestFrame(); }

  function onGestureStart() {
    if (!c || !core) return;
    if (localTransform.isActive()) localTransform.commit(c);
    core.setGesturing(true);
  }
  function onGestureEnd() { core?.setGesturing(false); }

  // Erase: suspend compositing while the brush owns the canvas, resume on end.
  function setErasing(on: boolean) { core?.setErasing(on); }

  // Destructively drop a region's tiles (no stale-exact ghost). Used by the
  // drag controller for the OLD footprint of a moved selection.
  function dropRegion(rect: WorldRect) { core?.dropRegion(rect); }

  function recordPanDelta(_dx: number, _dy: number) { /* directional prefetch retired */ }

  // ── loading ──────────────────────────────────────────────────────────────
  function beginLoading() {
    if (loadingDepth === 0) core?.setLoading(true);
    loadingDepth++;
  }
  function endLoading() {
    loadingDepth = Math.max(0, loadingDepth - 1);
    if (loadingDepth !== 0) return;
    core?.setLoading(false);
    // Objects added during the bulk load only touched objectMap; rebuild the
    // index wholesale and refresh the committed state.
    rebuildIndexFromCanvas();
    core?.setContentBounds(computeContentBounds());
    core?.markAllDirty();
    core?.warmOverview();
    core?.requestFrame();
  }

  // ── blocked users ────────────────────────────────────────────────────────
  function purgeBlockedObjects() {
    const { isBlocked } = useFriendStore();
    const toRemove: FabricObject[] = [];
    objectMap.forEach((o) => { if (isBlocked(o.userId)) toRemove.push(o); });
    if (!toRemove.length) return;
    for (const obj of toRemove) {
      if (obj.id) {
        const oldRect = objectBounds(obj);
        objectMap.delete(obj.id);
        removeFromQuadTree(obj);
        core?.onObjectRemoved(obj, oldRect);
      }
      c?.remove(obj);
    }
    invalidateZIndex();
  }

  // ── public query API (unchanged behaviour) ───────────────────────────────
  function query(rect: WorldRect): FabricObject[] {
    return quadtree.query(rect).map((e) => objectMap.get(e.id)).filter(Boolean) as FabricObject[];
  }
  function getVisibleObjects(): FabricObject[] {
    return quadtree.query(getViewportRect(c!)).map((e) => objectMap.get(e.id)).filter(Boolean) as FabricObject[];
  }
  function getObjectById(id: string) { return objectMap.get(id); }
  function getObjectsById(ids: string[]): FabricObject[] {
    return ids.map((id) => objectMap.get(id)).filter(Boolean) as FabricObject[];
  }

  // ── reset / rebuild ──────────────────────────────────────────────────────
  function resetTileCache() {
    core?.reset();
    core?.setContentBounds(computeContentBounds());
    core?.warmOverview();
    core?.requestFrame();
  }
  function rebuildSpatialIndex() {
    if (!c || !core) return;
    rebuildIndexFromCanvas();
    core.reset();
    core.setContentBounds(computeContentBounds());
    core.warmOverview();
    core.requestFrame();
  }

  // ── compatibility shims for external callers ─────────────────────────────
  // Other modules still call these; they now just mark a region dirty.
  function scheduleRectPatch(rect: WorldRect) { core?.markDirty(rect); }
  function scheduleObjectPatch(obj: FabricObject) { core?.markDirty(objectBounds(obj)); }
  // There is no synchronous patch flush any more (no in-place patching); the
  // committed state is eventually-consistent. For pixel-exact EXPORTS, render
  // the fabric canvas directly rather than relying on tiles.
  function flushPatchesNow(_force = false) { core?.requestFrame(); }

  // Used by transformController to hide its GPU drag layer only AFTER the new
  // position has actually baked — no fixed-rAF guess, no empty-gap flash.
  function isRegionBaked(rect: WorldRect): boolean {
    return core ? core.isRegionBaked(rect) : true;
  }

  function patchRectSync(rect: WorldRect) {
    if (!core || !c) return;
    const vpt = c.viewportTransform!;
    const tier = core.pickActiveTier(vpt[0]);
    core.markDirtyAndRebuildSync(rect, tier);
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
    getVisibleObjects,
    getObjectById,
    getObjectsById,
    beginLoading,
    endLoading,
    isLoading,
    resetTileCache,
    rebuildSpatialIndex,
    scheduleRectPatch,
    scheduleObjectPatch,
    flushPatchesNow,
    isRegionBaked,
    setErasing,
    dropRegion,
    patchRectSync
  };
});