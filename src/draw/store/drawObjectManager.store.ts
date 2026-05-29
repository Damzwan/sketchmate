// src/draw/store/drawObjectManager.store.ts
//
// Bug fixes in this revision:
//   1. ADD-THEN-ZOOM visibility: every add gen-bumps the object's bbox at
//      ALL tiers + patches the active tier AND one tier finer (if cached)
//      AND coarser tiers. Plus fallbackTierRadius widened to 3 in tilecache
//      options.
//   2. RAPID-ADD FLASHING: renderMain coalesced via rAF. Tile cache also
//      defers bitmap-close to next microtask (deferBitmapClose option).
//   3. ZOOM-THEN-PAN empty tiles: viewport padding is now zoom-adaptive
//      (more padding at higher zoom). Pan direction is recorded and fed
//      to bakeMissing for directional prefetch. Gesture-start only aborts
//      bakes when zoom actually changed (pure pan keeps them alive).

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
import { useGestureStore } from "@/draw/store/tools/gesture.store";
import { isMobile } from "@/helper/general.helper";
import { TileCache, WorldRect } from "@/draw/tilecache";
import { createYielder } from "@/draw/helpers/yielding.helper";
import { isolatedTileRenderer } from "@/draw/helpers/drawTileRenderer.helper";
import { useFriendStore } from "@/store/friend.store";
import { rerenderActiveObjectControls } from "@/draw/helpers/render.helper";
import * as remoteOverlay from "@/draw/remoteTransformOverlay";
import * as localTransform from "@/draw/transform/transformController";

const IS_MOBILE = isMobile();
const HW_CONCURRENCY = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW_CONCURRENCY <= 4;

const SYNC_PATCH_TILE_BUDGET = IS_LOW_END ? 12 : IS_MOBILE ? 20 : 40;
const CLUSTER_WASTE_THRESHOLD = 2.0;

const ADDITIVE_BURST_THRESHOLD = 5;
const ADDITIVE_BURST_WINDOW_MS = 200;
const ADDITIVE_BATCH_DELAY_MS = 24;
const ADDITIVE_BATCH_DELAY_MAX_MS = 80;

const TILE_REBAKE_BUDGET_PER_SEC = 8;
const TILE_REBAKE_COOLDOWN_MS = 1000 / TILE_REBAKE_BUDGET_PER_SEC;

const MODIFY_STORM_THRESHOLD = 8;
const MODIFY_STORM_WINDOW_MS = 500;
const BIG_OBJECT_TILE_THRESHOLD = 9;

const PATCH_RATE_WINDOW = 100;
const PATCH_RATE_MAX = 8;

export const useDrawObjectManager = defineStore("drawObjectManager", () => {
	let c: Canvas | undefined = undefined;

	const objectMap = new Map<string, FabricObject>();
	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

	const zIndexMap = new Map<FabricObject, number>();
	let isZIndexDirty = true;

	let primaryBakeController: AbortController | null = null;
	let prefetchBakeController: AbortController | null = null;
	let pendingBakeTimeout: any = null;

	let coarseBakedBounds: WorldRect | null = null;
	let coarseExtendScheduled: any = null;

	const deferredDuringGesture: Array<{ kind: "obj" | "rect"; payload: any }> =
		[];

	// FIX 2 — coalesced render
	let renderScheduled = false;
	let renderForceBakeRequested = false;

	// FIX 3 — directional prefetch state
	let lastPanDx = 0;
	let lastPanDy = 0;
	let lastGestureZoom = 1;

	const additiveQueue: FabricObject[] = [];
	let additiveFlushTimer: any = null;
	let additiveLastFlush = 0;
	const additiveTimestamps: number[] = [];
	const tileLastPatched = new Map<string, number>();

	const pendingModifies = new Map<
		string,
		{ obj: FabricObject; oldRect: WorldRect | null; ts: number }
	>();
	let modifyFlushRafId: number | null = null;
	let recentModifyObjectIds: Array<{ id: string; ts: number }> = [];
	let inModifyStorm = false;

	let loadingDepth = 0;
	function isLoading() {
		return loadingDepth > 0;
	}
	function beginLoading() {
		loadingDepth++;
	}
	function endLoading() {
		loadingDepth = Math.max(0, loadingDepth - 1);
		if (loadingDepth === 0) {
			dirtyObjects.clear();
			dirtyOldRects.length = 0;
			patchScheduled = false;
			additiveQueue.length = 0;
			pendingModifies.clear();
		}
	}

	const primaryYielder = createYielder({
		budgetMs: IS_LOW_END ? 4 : IS_MOBILE ? 6 : 8,
	});
	const prefetchYielder = createYielder({
		budgetMs: IS_LOW_END ? 2 : IS_MOBILE ? 3 : 4,
	});

	const spatialIndex = {
		query: (rect: WorldRect): FabricObject[] => {
			const entries = quadtree.query(rect);
			const objects = entries
				.map((e) => objectMap.get(e.id))
				.filter(Boolean) as FabricObject[];
			const zMap = getZIndexMap();
			return objects.sort((a, b) => (zMap.get(a) ?? 0) - (zMap.get(b) ?? 0));
		},
	};

	const tileCache = new TileCache<FabricObject>(
		spatialIndex,
		isolatedTileRenderer,
		{
			tileSize: 512,
			memoryBudgetMB: IS_LOW_END ? 96 : 512,
			viewportPaddingTiles: IS_LOW_END ? 0.5 : 1.0, // FIX 3
			tierSwitchThreshold: 0.9,
			fallbackTierRadius: 3, // FIX 1 — wider fallback search
			overscanPx: 2,
			zoomTiers: [0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32],
			additivePatchBudget: 16,
			deferBitmapClose: true, // FIX 2
		},
	);

	interface Cluster {
		rect: WorldRect;
		objects: FabricObject[];
	}

	const dirtyObjects = new Set<FabricObject>();
	const dirtyOldRects: WorldRect[] = [];
	let patchScheduled = false;

	function scheduleObjectPatch(obj: FabricObject) {
		dirtyObjects.add(obj);
		schedulePatch();
	}
	function scheduleObjectsPatch(objs: FabricObject[]) {
		for (const o of objs) dirtyObjects.add(o);
		schedulePatch();
	}
	function scheduleRectPatch(rect: WorldRect) {
		dirtyOldRects.push(rect);
		schedulePatch();
	}
	function schedulePatch() {
		if (isLoading()) return;
		if (patchScheduled) return;
		patchScheduled = true;
		queueMicrotask(() => {
			patchScheduled = false;
			flushDirtyPatches();
		});
	}

	let recentPatchTimes: number[] = [];

	function flushPatchesNow(force = false) {
		patchScheduled = false;
		flushDirtyPatches(force);
	}

	function flushDirtyPatches(force = false) {
		if (!c) return;
		if (isLoading()) return;
		if (dirtyObjects.size === 0 && dirtyOldRects.length === 0) return;

		const now = performance.now();
		recentPatchTimes = recentPatchTimes.filter(
			(t) => now - t < PATCH_RATE_WINDOW,
		);
		if (!force && recentPatchTimes.length >= PATCH_RATE_MAX) {
			// ← !force
			for (const obj of dirtyObjects) tileCache.invalidateObject(obj);
			for (const r of dirtyOldRects) tileCache.invalidateRect(r);
			dirtyObjects.clear();
			dirtyOldRects.length = 0;
			scheduleBake();
			return;
		}
		recentPatchTimes.push(now);

		const gs = useGestureStore();
		if (gs.isGesturing && !force) {
			for (const obj of dirtyObjects)
				deferredDuringGesture.push({ kind: "obj", payload: obj });
			for (const r of dirtyOldRects)
				deferredDuringGesture.push({ kind: "rect", payload: r });
			dirtyObjects.clear();
			dirtyOldRects.length = 0;
			return;
		}

		if (localTransform.isActive()) {
			// Local transform is in flight — defer expensive object re-bakes
			// to the async path. BUT: rect patches must still run sync,
			// because they're needed to clear the dragged object's original
			// position (set by markMoved → opacity=0 + scheduleRectPatch).
			// Without this, the object stays visible in the tile cache while
			// the overlay draws on top → double-render.
			for (const obj of dirtyObjects) tileCache.invalidateObject(obj);
			dirtyObjects.clear();

			if (dirtyOldRects.length > 0) {
				const localRects = dirtyOldRects.slice();
				dirtyOldRects.length = 0;
				const zoom = c.viewportTransform![0];
				const activeTier = tileCache.pickTierForZoom(zoom);
				// Filter to in-viewport only; off-viewport just gen-bump.
				const viewport = getViewportRectPadded(c);
				const inViewRects: WorldRect[] = [];
				for (const r of localRects) {
					if (rectsIntersect(r, viewport)) inViewRects.push(r);
					else tileCache.invalidateRect(r);
				}
				if (inViewRects.length > 0) {
					tileCache.patchTilesSync(inViewRects, [activeTier]);
					// Also patch coarser tiers that already have tiles
					const coarser: number[] = [];
					for (let t = activeTier - 1; t >= Math.max(0, activeTier - 2); t--) {
						coarser.push(t);
					}
					if (coarser.length > 0) {
						tileCache.patchExistingTilesSync(inViewRects, coarser);
					}
					requestRenderMain();
				}
			}
			scheduleBake();
			return;
		}

		const objs = Array.from(dirtyObjects);
		const oldRects = dirtyOldRects.slice();
		dirtyObjects.clear();
		dirtyOldRects.length = 0;

		const v = getViewportRectPadded(c);
		const inViewObjs: FabricObject[] = [];
		const offViewObjs: FabricObject[] = [];
		for (const o of objs) {
			const b = objectBounds(o);
			if (rectsIntersect(b, v)) inViewObjs.push(o);
			else offViewObjs.push(o);
		}
		for (const o of offViewObjs) tileCache.invalidateObject(o);

		const inViewRects: WorldRect[] = [];
		const offViewRects: WorldRect[] = [];
		for (const r of oldRects) {
			if (rectsIntersect(r, v)) inViewRects.push(r);
			else offViewRects.push(r);
		}
		for (const r of offViewRects) tileCache.invalidateRect(r);

		const candidates: Cluster[] = [];
		for (const obj of inViewObjs) {
			const b = objectBounds(obj);
			if (!isFinite(b.x) || !isFinite(b.y) || b.w <= 0 || b.h <= 0) continue;
			candidates.push({ rect: b, objects: [obj] });
		}
		for (const r of inViewRects) {
			if (!isFinite(r.x) || !isFinite(r.y) || r.w <= 0 || r.h <= 0) continue;
			candidates.push({ rect: r, objects: [] });
		}

		if (candidates.length === 0) {
			scheduleBake();
			return;
		}

		const clusters = clusterCandidates(candidates);
		for (const cl of clusters) tileCache.invalidateRect(cl.rect);

		const zoom = c.viewportTransform![0];
		const activeTier = tileCache.pickTierForZoom(zoom);

		const rects = clusters.map((cl) => cl.rect);
		const estimatedTiles = estimatePatchTileCount(rects, activeTier);
		let rectsToPatch = rects;
		if (estimatedTiles > SYNC_PATCH_TILE_BUDGET) {
			rectsToPatch = pickPriorityRects(
				clusters,
				SYNC_PATCH_TILE_BUDGET,
				activeTier,
			);
		}
		tileCache.patchTilesSync(rectsToPatch, [activeTier]);

		const coarserTiers: number[] = [];
		for (let t = activeTier - 1; t >= Math.max(0, activeTier - 2); t--)
			coarserTiers.push(t);
		if (coarserTiers.length > 0)
			tileCache.patchExistingTilesSync(rects, coarserTiers);

		requestRenderMain();
		scheduleBake();
		for (const obj of inViewObjs) maybeExtendCoarse(obj);
	}

	function estimatePatchTileCount(rects: WorldRect[], tier: number): number {
		const scale = tileCache.ZOOM_TIERS[tier];
		const tileWorldSize = 512 / scale;
		let total = 0;
		for (const r of rects) {
			const cols =
				Math.floor((r.x + r.w) / tileWorldSize) -
				Math.floor(r.x / tileWorldSize) +
				1;
			const rows =
				Math.floor((r.y + r.h) / tileWorldSize) -
				Math.floor(r.y / tileWorldSize) +
				1;
			total += cols * rows;
		}
		return total;
	}

	function pickPriorityRects(
		clusters: Cluster[],
		budget: number,
		tier: number,
	): WorldRect[] {
		if (!c) return clusters.map((cl) => cl.rect);
		const v = getViewportRect(c);
		const cx = v.x + v.w / 2;
		const cy = v.y + v.h / 2;
		const scored = clusters.map((cl) => {
			const ccx = cl.rect.x + cl.rect.w / 2;
			const ccy = cl.rect.y + cl.rect.h / 2;
			return {
				cl,
				dist: (ccx - cx) ** 2 + (ccy - cy) ** 2,
				tilesEst: estimatePatchTileCount([cl.rect], tier),
			};
		});
		scored.sort((a, b) => a.dist - b.dist);
		const picked: WorldRect[] = [];
		let used = 0;
		for (const s of scored) {
			if (used + s.tilesEst > budget && picked.length > 0) break;
			picked.push(s.cl.rect);
			used += s.tilesEst;
		}
		return picked;
	}

	function clusterCandidates(candidates: Cluster[]): Cluster[] {
		if (candidates.length <= 1) return candidates;
		const result = candidates.slice();
		let merged = true;
		const MAX_PASSES = 64;
		let passes = 0;
		while (merged && result.length > 1 && passes++ < MAX_PASSES) {
			merged = false;
			outer: for (let i = 0; i < result.length; i++) {
				for (let j = i + 1; j < result.length; j++) {
					const a = result[i],
						b = result[j];
					const u = unionRect(a.rect, b.rect);
					if (
						u.w * u.h <=
						(a.rect.w * a.rect.h + b.rect.w * b.rect.h) *
							CLUSTER_WASTE_THRESHOLD
					) {
						result[i] = { rect: u, objects: a.objects.concat(b.objects) };
						result.splice(j, 1);
						merged = true;
						break outer;
					}
				}
			}
		}
		return result;
	}

	function getZIndexMap(): Map<FabricObject, number> {
		if (isZIndexDirty) {
			zIndexMap.clear();
			c!.getObjects().forEach((o, i) => zIndexMap.set(o, i));
			isZIndexDirty = false;
		}
		return zIndexMap;
	}
	function invalidateZIndex() {
		isZIndexDirty = true;
	}

	function objectBounds(obj: FabricObject): WorldRect {
		// @ts-ignore
		const b = obj.getBoundingRect(true, true);
		return { x: b.left, y: b.top, w: b.width, h: b.height };
	}
	function rectContains(outer: WorldRect, inner: WorldRect): boolean {
		return (
			inner.x >= outer.x &&
			inner.y >= outer.y &&
			inner.x + inner.w <= outer.x + outer.w &&
			inner.y + inner.h <= outer.y + outer.h
		);
	}
	function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
		return (
			a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
		);
	}
	function unionRect(a: WorldRect, b: WorldRect): WorldRect {
		const x = Math.min(a.x, b.x),
			y = Math.min(a.y, b.y);
		const x2 = Math.max(a.x + a.w, b.x + b.w),
			y2 = Math.max(a.y + a.h, b.y + b.h);
		return { x, y, w: x2 - x, h: y2 - y };
	}

	// FIX 3 — adaptive padding based on zoom
	function getViewportRectPadded(canvas: Canvas): WorldRect {
		const v = getViewportRect(canvas);
		const zoom = canvas.viewportTransform![0];
		const padFactor = Math.min(1.0, 0.5 + Math.log2(Math.max(zoom, 1)) * 0.15);
		const padX = v.w * padFactor,
			padY = v.h * padFactor;
		return {
			x: v.x - padX,
			y: v.y - padY,
			w: v.w + 2 * padX,
			h: v.h + 2 * padY,
		};
	}

	function maybeExtendCoarse(obj: FabricObject) {
		if (!c) return;
		const ob = objectBounds(obj);
		if (!isFinite(ob.x) || !isFinite(ob.y) || ob.w <= 0 || ob.h <= 0) return;
		if (coarseBakedBounds && rectContains(coarseBakedBounds, ob)) return;
		coarseBakedBounds = coarseBakedBounds
			? unionRect(coarseBakedBounds, ob)
			: { ...ob };
		if (coarseExtendScheduled) return;
		coarseExtendScheduled = setTimeout(() => {
			coarseExtendScheduled = null;
			runCoarseBake();
		}, 200);
	}

	function runCoarseBake() {
		if (!c || !coarseBakedBounds) return;
		if (isLoading()) return;
		const gs = useGestureStore();
		if (gs.isGesturing || localTransform.isActive()) {
			coarseExtendScheduled = setTimeout(() => {
				coarseExtendScheduled = null;
				runCoarseBake();
			}, 200);
			return;
		}
		prefetchBakeController?.abort();
		const ctrl = new AbortController();
		prefetchBakeController = ctrl;
		const bounds = { ...coarseBakedBounds };
		tileCache
			.bakeRect(bounds, 0, prefetchYielder, ctrl.signal)
			.then(() => {
				if (prefetchBakeController === ctrl) prefetchBakeController = null;
			})
			.catch(() => {
				if (prefetchBakeController === ctrl) prefetchBakeController = null;
			});
	}

	function onObjectAdded(obj: FabricObject) {
		if (!obj.id) return;
		if (isLoading()) {
			objectMap.set(obj.id, obj);
			return;
		}
		objectMap.set(obj.id, obj);
		addToQuadTree(obj);
		isZIndexDirty = true;

		if (c) {
			const v = getViewportRectPadded(c);
			const b = objectBounds(obj);

			// 1. Off-viewport check
			if (!rectsIntersect(b, v)) {
				// Off-viewport — gen-bump all tiers so they rebake when scrolled
				// to, then let the async bake pipeline catch up.
				tileCache.invalidateObject(obj);
				scheduleBake();
				return;
			}

			// 2. Z-Order validation for Additive Patching
			const canvasObjects = c.getObjects();
			// Check if the newly added object is the very last item in the array (top-most)
			const isTopMost =
				canvasObjects.length > 0 &&
				canvasObjects[canvasObjects.length - 1] === obj;

			if (!isTopMost) {
				// If the object was inserted behind existing strokes (e.g., background bucket fill),
				// we CANNOT "additively" paint it. Drawing it onto the existing cached bitmap
				// would paint it over the higher z-index objects.
				// Instead, we invalidate the affected area to force a full z-sorted rebake.
				scheduleObjectPatch(obj);
				return;
			}
		}

		// In-viewport and at the top: safe to use the additive fast-path.
		// The additive flush will:
		//   - composite onto fresh tiles at active + neighbor tiers (no flash)
		//   - gen-bump only tiers we DON'T patch, so they rebake on first
		//     use (e.g., user zooms to a far tier later)
		additiveQueue.push(obj);
		additiveTimestamps.push(performance.now());
		scheduleAdditiveFlush();
	}

	function scheduleAdditiveFlush() {
		if (additiveFlushTimer !== null) return;
		if (isLoading()) return;
		const now = performance.now();
		const cutoff = now - ADDITIVE_BURST_WINDOW_MS;
		while (additiveTimestamps.length && additiveTimestamps[0] < cutoff)
			additiveTimestamps.shift();
		const isBurst = additiveTimestamps.length >= ADDITIVE_BURST_THRESHOLD;
		if (!isBurst) {
			additiveFlushTimer = -1;
			queueMicrotask(() => {
				additiveFlushTimer = null;
				flushAdditiveQueue();
			});
			return;
		}
		const sinceLast = now - additiveLastFlush;
		const delay = Math.max(
			0,
			Math.min(
				ADDITIVE_BATCH_DELAY_MS,
				ADDITIVE_BATCH_DELAY_MAX_MS - sinceLast,
			),
		);
		additiveFlushTimer = setTimeout(() => {
			additiveFlushTimer = null;
			flushAdditiveQueue();
		}, delay);
	}

	function flushAdditiveQueue() {
		if (!c || additiveQueue.length === 0) return;
		if (isLoading()) {
			additiveQueue.length = 0;
			return;
		}
		const gs = useGestureStore();
		if (gs.isGesturing) {
			for (const obj of additiveQueue)
				deferredDuringGesture.push({ kind: "obj", payload: obj });
			additiveQueue.length = 0;
			return;
		}
		if (localTransform.isActive()) {
			additiveFlushTimer = setTimeout(() => {
				additiveFlushTimer = null;
				flushAdditiveQueue();
			}, 32);
			return;
		}

		additiveLastFlush = performance.now();
		const objects = additiveQueue.slice();
		additiveQueue.length = 0;

		const zMap = getZIndexMap();
		objects.sort((a, b) => (zMap.get(a) ?? 0) - (zMap.get(b) ?? 0));

		const zoom = c.viewportTransform![0];
		const activeTier = tileCache.pickTierForZoom(zoom);

		// FIX 1 — active tier + 2 coarser + 1 finer. The finer tier matters
		// because if the user is about to zoom in, the cached finer tile
		// should already have the new content. patchTilesAdditiveBatch
		// skips tiers that don't have tiles yet, so this is safe and free.
		const tiers: number[] = [activeTier];
		for (let t = activeTier - 1; t >= Math.max(0, activeTier - 2); t--)
			tiers.push(t);
		if (activeTier + 1 < tileCache.ZOOM_TIERS.length)
			tiers.push(activeTier + 1);

		const cooledObjects: FabricObject[] = [];
		const overheatedRects: WorldRect[] = [];
		const now = performance.now();

		for (const obj of objects) {
			const b = objectBounds(obj);
			if (!isFinite(b.x) || b.w <= 0 || b.h <= 0) continue;
			const range = tileRangeForObject(b, activeTier);
			let anyOverheated = false;
			for (let ty = range.ty0; ty <= range.ty1 && !anyOverheated; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					const key = `${activeTier}:${tx}:${ty}`;
					const last = tileLastPatched.get(key) ?? 0;
					if (now - last < TILE_REBAKE_COOLDOWN_MS) {
						anyOverheated = true;
						break;
					}
				}
			}
			if (anyOverheated) overheatedRects.push(b);
			else cooledObjects.push(obj);
		}

		for (const obj of cooledObjects) {
			const b = objectBounds(obj);
			const range = tileRangeForObject(b, activeTier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					tileLastPatched.set(`${activeTier}:${tx}:${ty}`, now);
				}
			}
		}

		// GIANT-OBJECT GUARD — for objects whose bbox spans more than the
		// sync tile budget at the active tier, we should NOT additively patch
		// every covered tile. Doing so would block the main thread (each
		// transferToImageBitmap is ~1-3ms × N tiles). Instead:
		//   - patch only the tiles inside the actual viewport (not padded)
		//   - gen-bump the rest so async bake picks them up later
		// This keeps a giant stroke smooth at the cost of some delay before
		// off-viewport edges are visible.
		const visibleRect = c ? getViewportRect(c) : null;
		const giantPatchCutoff = Math.floor(SYNC_PATCH_TILE_BUDGET * 0.75);
		const objectsToFullPatch: FabricObject[] = [];
		const giantObjects: FabricObject[] = [];
		for (const obj of cooledObjects) {
			const b = objectBounds(obj);
			const range = tileRangeForObject(b, activeTier);
			const tilesCovered =
				(range.tx1 - range.tx0 + 1) * (range.ty1 - range.ty0 + 1);
			if (tilesCovered > giantPatchCutoff && visibleRect) {
				giantObjects.push(obj);
			} else {
				objectsToFullPatch.push(obj);
			}
		}

		if (objectsToFullPatch.length > 0) {
			tileCache.patchTilesAdditiveBatch(objectsToFullPatch, tiers);
		}

		// For giant objects, only patch the tiles overlapping the actual
		// (unpadded) viewport. We use a special restricted-rect version.
		if (giantObjects.length > 0 && visibleRect) {
			tileCache.patchTilesAdditiveBatchRestricted(
				giantObjects,
				tiers,
				visibleRect,
			);
			// Gen-bump the rest of each giant object's footprint so async
			// bake fills in off-viewport tiles when needed.
			for (const obj of giantObjects) {
				const patchedTierSet = new Set(tiers);
				// Bump all tiers for the object EXCEPT the ones we patched
				// AT the visible-rect portion (which is now fresh).
				tileCache.invalidateObjectExcept(obj, patchedTierSet);
				// Also gen-bump the OFF-viewport portion at the patched tiers
				// so when user pans to it, those tiles rebake correctly.
				tileCache.invalidateRectExceptInside(
					objectBounds(obj),
					visibleRect,
					Array.from(patchedTierSet),
				);
			}
		}

		if (overheatedRects.length > 0)
			for (const r of overheatedRects) tileCache.invalidateRect(r);

		// Gen-bump tiers we did NOT patch (only for normal-size objects;
		// giant objects were already handled above).
		const patchedTiers = new Set(tiers);
		for (const obj of objectsToFullPatch) {
			tileCache.invalidateObjectExcept(obj, patchedTiers);
		}

		for (const obj of objects) maybeExtendCoarse(obj);

		requestRenderMain(); // FIX 2 — coalesced
		scheduleBake();

		if (tileLastPatched.size > 2000) {
			const cutoffMs = now - TILE_REBAKE_COOLDOWN_MS * 4;
			for (const [k, t] of tileLastPatched)
				if (t < cutoffMs) tileLastPatched.delete(k);
		}
	}

	function tileRangeForObject(b: WorldRect, tier: number) {
		const scale = tileCache.ZOOM_TIERS[tier];
		const tileWorldSize = 512 / scale;
		return {
			tx0: Math.floor(b.x / tileWorldSize),
			ty0: Math.floor(b.y / tileWorldSize),
			tx1: Math.floor((b.x + b.w) / tileWorldSize),
			ty1: Math.floor((b.y + b.h) / tileWorldSize),
		};
	}

	function onObjectModified(e: any) {
		const obj = e.target as FabricObject;
		if (!obj.id) return;
		if (localTransform.isActive() && localTransform.ownsTarget(obj)) {
			updateQuadTree(obj);
			return;
		}
		const oldRect = collectOldRect(obj, e.transform);
		updateQuadTree(obj);
		if (isLoading()) return;
		const existing = pendingModifies.get(obj.id);
		pendingModifies.set(obj.id, {
			obj,
			oldRect: existing?.oldRect ?? oldRect,
			ts: performance.now(),
		});
		if (modifyFlushRafId === null)
			modifyFlushRafId = requestAnimationFrame(flushPendingModifies);
	}

	function flushPendingModifies() {
		modifyFlushRafId = null;
		if (!c || pendingModifies.size === 0) return;
		if (isLoading()) {
			pendingModifies.clear();
			return;
		}

		const now = performance.now();
		const items = Array.from(pendingModifies.values());
		pendingModifies.clear();

		for (const item of items)
			recentModifyObjectIds.push({ id: item.obj.id, ts: now });
		const cutoff = now - MODIFY_STORM_WINDOW_MS;
		recentModifyObjectIds = recentModifyObjectIds.filter((r) => r.ts >= cutoff);
		const distinct = new Set(recentModifyObjectIds.map((r) => r.id));
		inModifyStorm = distinct.size >= MODIFY_STORM_THRESHOLD;

		const viewport = c ? getViewportRectPadded(c) : null;
		const fellThrough: Array<{ obj: FabricObject; oldRect: WorldRect | null }> =
			[];

		for (const item of items) {
			const objBox = objectBounds(item.obj);
			const oldBoxInView =
				item.oldRect && viewport
					? rectsIntersect(item.oldRect, viewport)
					: false;
			const newBoxInView = viewport ? rectsIntersect(objBox, viewport) : false;
			if (!oldBoxInView && !newBoxInView) {
				if (item.oldRect) tileCache.invalidateRect(item.oldRect);
				tileCache.invalidateObject(item.obj);
				continue;
			}
			if (localTransform.isActive()) {
				fellThrough.push({ obj: item.obj, oldRect: item.oldRect });
				continue;
			}
			const big = isBigObject(item.obj);
			const alreadyOverlayed = remoteOverlay.isOverlayed(item.obj.id);
			const useOverlay = inModifyStorm || alreadyOverlayed || big;
			if (useOverlay) {
				const ok = remoteOverlay.handleRemoteModify(item.obj, item.oldRect);
				if (!ok) fellThrough.push({ obj: item.obj, oldRect: item.oldRect });
			} else {
				fellThrough.push({ obj: item.obj, oldRect: item.oldRect });
			}
		}

		for (const item of fellThrough) {
			if (item.oldRect) scheduleRectPatch(item.oldRect);
			scheduleObjectPatch(item.obj);
		}
	}

	function isBigObject(obj: FabricObject): boolean {
		if (!c) return false;
		const b = objectBounds(obj);
		if (!isFinite(b.w) || !isFinite(b.h)) return false;
		const zoom = c.viewportTransform![0];
		const tier = tileCache.pickTierForZoom(zoom);
		const tileWorldSize = 512 / tileCache.ZOOM_TIERS[tier];
		const tilesCovered =
			Math.ceil(b.w / tileWorldSize) * Math.ceil(b.h / tileWorldSize);
		return tilesCovered >= BIG_OBJECT_TILE_THRESHOLD;
	}

	function collectOldRect(o: FabricObject, transform: any): WorldRect | null {
		const oldText = (o as any)._textBeforeEdit;
		const isTextChanged = oldText !== undefined && oldText !== (o as any).text;
		if (!transform?.original && !isTextChanged) return null;
		const cur = {
			left: o.left,
			top: o.top,
			scaleX: o.scaleX,
			scaleY: o.scaleY,
			skewX: o.skewX,
			skewY: o.skewY,
			angle: o.angle,
			flipX: o.flipX,
			flipY: o.flipY,
			originX: o.originX,
			originY: o.originY,
			text: (o as any).text,
		};
		try {
			if (transform?.original) o.set(transform.original);
			if (isTextChanged && oldText.length > (o as any).text.length)
				o.set({ text: oldText });
			o.setCoords();
			const b = objectBounds(o);
			o.set(cur);
			o.setCoords();
			return b;
		} catch {
			o.set(cur);
			o.setCoords();
			return null;
		}
	}

	const events: FabricEvent[] = [
		{ on: "object:added", handler: (e: any) => onObjectAdded(e.target) },
		{
			on: "object:removed",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				if (remoteOverlay.isOverlayed(obj.id))
					remoteOverlay.endSessions([obj.id]);
				const oldRect = objectBounds(obj);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
				invalidateZIndex();
				if (!isLoading()) scheduleRectPatch(oldRect);
			},
		},
		{ on: "object:modified", handler: (e: any) => onObjectModified(e) },
		{
			on: "fullErase",
			handler: () => {
				tileCache.invalidateAll();
				coarseBakedBounds = null;
				remoteOverlay.reset();
				if (!isLoading()) requestRenderMain();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				if (!isLoading()) requestRenderMain(true);
			},
		},
		{
			on: "invalidateCanvas",
			handler: (e: any) => {
				if (isLoading()) return;
				const targets = Array.isArray(e.target) ? e.target : [e.target];
				for (const obj of targets as FabricObject[])
					if (obj?.id) scheduleObjectPatch(obj);
			},
		},
		{
			on: "render:patchModifiedObject",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				const oldRect = e.oldRect;
				if (!obj || !oldRect) return;
				updateQuadTree(obj);
				if (isLoading()) return;
				scheduleRectPatch({
					x: oldRect.x ?? oldRect.left,
					y: oldRect.y ?? oldRect.top,
					w: oldRect.w ?? oldRect.width,
					h: oldRect.h ?? oldRect.height,
				});
				scheduleObjectPatch(obj);
			},
		},
		{ on: "textStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "objectStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "imgFilterChanged", handler: (e: any) => handleStyleChange(e) },
		{
			on: "layer:changed",
			handler: (e: any) => {
				isZIndexDirty = true;
				handleStyleChange(e);
			},
		},
		{ on: "flip", handler: (e: any) => handleStyleChange(e) },
		{
			on: "erasing:end",
			handler: (e: any) => {
				if (isLoading()) return;
				const targets = Array.isArray(e.detail.targets)
					? e.detail.targets
					: [e.detail.targets];
				scheduleObjectsPatch(targets);
			},
		},
	];

	function handleStyleChange(e: any) {
		if (isLoading()) return;
		const t = (
			Array.isArray(e.target) ? e.target : [e.target]
		) as FabricObject[];
		const overlayed = t.filter((o) => o?.id && remoteOverlay.isOverlayed(o.id));
		if (overlayed.length > 0)
			remoteOverlay.endSessions(overlayed.map((o) => o.id));
		scheduleObjectsPatch(t);
	}

	// FIX 2 — coalesced renderMain
	function requestRenderMain(forceBake = false) {
		if (forceBake) renderForceBakeRequested = true;
		if (renderScheduled) return;
		renderScheduled = true;
		requestAnimationFrame(() => {
			renderScheduled = false;
			const force = renderForceBakeRequested;
			renderForceBakeRequested = false;
			renderMainNow(force);
		});
	}

	function renderMainNow(forceBake: boolean) {
		if (!c) return;
		const vpt = c.viewportTransform!;
		const pw = c.getElement().width;
		const ph = c.getElement().height;
		const dpr = window.devicePixelRatio || 1;
		const bg = c.backgroundColor as string;
		const mainCtx = c.getContext();
		const report = tileCache.composite(mainCtx, vpt, { w: pw, h: ph }, dpr, bg);
		if (forceBake) {
			clearTimeout(pendingBakeTimeout);
			pendingBakeTimeout = null;
			runBake();
		} else if (report.tilesMissing > 0 || report.tilesFallback > 0) {
			scheduleBake();
		}
		rerenderActiveObjectControls(c);
		if (remoteOverlay.hasActiveSessions()) remoteOverlay.requestRender();
	}

	function renderMain(forceBake = false) {
		requestRenderMain(forceBake);
	}
	function renderViewport(forceBake = false) {
		requestRenderMain(forceBake);
	}

	function scheduleBake() {
		const gs = useGestureStore();
		if (gs.isGesturing || !c) return;
		if (isLoading()) return;
		if (localTransform.isActive()) return;
		if (pendingBakeTimeout !== null) return;
		pendingBakeTimeout = setTimeout(() => {
			pendingBakeTimeout = null;
			runBake();
		}, 80);
	}

	function runBake() {
		if (!c) return;
		const gs = useGestureStore();
		if (gs.isGesturing) return;
		if (localTransform.isActive()) return;
		const vpt = c.viewportTransform!;
		const pw = c.getElement().width;
		const ph = c.getElement().height;
		const dpr = window.devicePixelRatio || 1;
		prefetchBakeController?.abort();
		prefetchBakeController = null;
		primaryBakeController?.abort();
		const ctrl = new AbortController();
		primaryBakeController = ctrl;
		// FIX 3 — pass directional pan hint
		tileCache
			.bakeMissing(vpt, { w: pw, h: ph }, dpr, primaryYielder, ctrl.signal, {
				panDx: lastPanDx,
				panDy: lastPanDy,
			})
			.then(() => {
				const wasCurrent = primaryBakeController === ctrl;
				if (wasCurrent) primaryBakeController = null;
				if (!wasCurrent) return;
				requestAnimationFrame(() => {
					if (c) renderMainNow(false);
				});
			})
			.catch(() => {
				if (primaryBakeController === ctrl) primaryBakeController = null;
				requestAnimationFrame(() => {
					if (c) renderMainNow(false);
				});
			});
	}

	// FIX 3 — directional prefetch tracking. Call from gesture helper.
	function recordPanDelta(dx: number, dy: number) {
		lastPanDx = lastPanDx * 0.6 + dx * 0.4;
		lastPanDy = lastPanDy * 0.6 + dy * 0.4;
	}

	function onGestureStart() {
		if (!c) return;
		if (localTransform.isActive()) localTransform.commit(c);
		const zoomNow = c.viewportTransform![0];
		// FIX 3 — only kill in-flight bakes on zoom change. Pure pan keeps them.
		const zoomChanged = Math.abs(Math.log2(zoomNow / lastGestureZoom)) > 0.05;
		if (zoomChanged) {
			tileCache.abortInflightBakes();
			primaryBakeController?.abort();
			primaryBakeController = null;
			prefetchBakeController?.abort();
			prefetchBakeController = null;
		}
		lastGestureZoom = zoomNow;
		clearTimeout(pendingBakeTimeout);
		pendingBakeTimeout = null;
		patchScheduled = false;
	}

	function onGestureEnd() {
		clearTimeout(pendingBakeTimeout);
		pendingBakeTimeout = null;
		for (const d of deferredDuringGesture) {
			if (d.kind === "obj") scheduleObjectPatch(d.payload);
			else scheduleRectPatch(d.payload);
		}
		deferredDuringGesture.length = 0;
		requestRenderMain(true);
	}

	function init(canvas: Canvas) {
		c = canvas;
		remoteOverlay.init(canvas);
		lastGestureZoom = canvas.viewportTransform![0];
		addStartingCanvasObjects();
		useDrawEventManager().addPermanentEvents(events);
		renderMainNow(false);
	}

	function addStartingCanvasObjects() {
		const { isBlocked } = useFriendStore();
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		isZIndexDirty = true;
		tileCache.invalidateAll();
		coarseBakedBounds = null;
		remoteOverlay.reset();
		const objects = c!.getObjects();
		for (let i = objects.length - 1; i >= 0; i--) {
			const obj = objects[i];
			if (isBlocked(obj.userId)) {
				c?.remove(obj);
				continue;
			}
			if (obj.id) {
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
			}
		}
	}

	function addToQuadTree(obj: FabricObject) {
		const e = fabricObjectToEntry(obj);
		entryMap.set(obj.id, e);
		quadtree.insert(e);
	}
	function removeFromQuadTree(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (e) {
			quadtree.remove(e);
			entryMap.delete(obj.id);
		}
	}
	function updateQuadTree(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (!e) return;
		// @ts-ignore
		const b = obj.getBoundingRect(true, true);
		e.bounds.x = b.left;
		e.bounds.y = b.top;
		e.bounds.w = b.width;
		e.bounds.h = b.height;
		quadtree.update(e);
	}

	function purgeBlockedObjects() {
		const { isBlocked } = useFriendStore();
		const toRemove: FabricObject[] = [];
		objectMap.forEach((o) => {
			if (isBlocked(o.userId)) toRemove.push(o);
		});
		if (!toRemove.length) return;
		for (const obj of toRemove) {
			if (obj.id) {
				if (remoteOverlay.isOverlayed(obj.id))
					remoteOverlay.endSessions([obj.id]);
				const oldRect = objectBounds(obj);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
				scheduleRectPatch(oldRect);
			}
			c?.remove(obj);
		}
		invalidateZIndex();
	}

	function query(rect: WorldRect): FabricObject[] {
		const entries = quadtree.query(rect);
		return entries
			.map((e) => objectMap.get(e.id))
			.filter(Boolean) as FabricObject[];
	}
	function getVisibleObjects(): FabricObject[] {
		return quadtree
			.query(getViewportRect(c!))
			.map((i) => objectMap.get(i.id))
			.filter(Boolean) as FabricObject[];
	}
	function getObjectById(id: string) {
		return objectMap.get(id);
	}
	function getObjectsById(ids: string[]): FabricObject[] {
		return ids.map((id) => getObjectById(id)).filter(Boolean) as FabricObject[];
	}
	function resetTileCache() {
		tileCache.invalidateAll();
		coarseBakedBounds = null;
	}
	function rebuildSpatialIndex() {
		if (!c) return;
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		isZIndexDirty = true;
		remoteOverlay.reset();
		for (const obj of c.getObjects())
			if (obj.id) {
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
			}
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
	};
});
