import { defineStore } from "pinia";
import { Canvas, FabricObject } from "fabric";
import { FabricEvent, ObjectType } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import {
	fabricObjectToEntry,
	getViewportRect,
	InfiniteQuadtreeManager,
	QuadtreeEntry,
} from "@/draw/utils/QuadTree";
import { useGestureStore } from "@/draw/store/tools/gesture.store";
import { useAuthStore } from "@/store/auth.store";
import { isMobile } from "@/helper/general.helper";
import { TileCache, WorldRect } from "@/draw/tilecache";
import { createYielder } from "@/draw/helpers/yielding.helper";
import { isolatedTileRenderer } from "@/draw/helpers/drawTileRenderer.helper";
import { useFriendStore } from "@/store/friend.store";

const IS_MOBILE = isMobile();
const HW_CONCURRENCY = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW_CONCURRENCY <= 4;

const SYNC_PATCH_TILE_BUDGET = IS_LOW_END ? 12 : IS_MOBILE ? 20 : 40;
const CLUSTER_WASTE_THRESHOLD = 2.0;

export const useDrawObjectManager = defineStore("drawObjectManager", () => {
	let c: Canvas | undefined = undefined;

	let objectMap = new Map<string, FabricObject>();
	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

	let zIndexMap = new Map<FabricObject, number>();
	let isZIndexDirty = true;

	let primaryBakeController: AbortController | null = null;
	let prefetchBakeController: AbortController | null = null;
	let pendingBakeTimeout: any = null;

	let coarseBakedBounds: WorldRect | null = null;
	let coarseExtendScheduled: any = null;

	const deferredDuringGesture: Array<{ kind: "obj" | "rect"; payload: any }> =
		[];

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
			viewportPaddingTiles: 0.15,
			tierSwitchThreshold: 0.9,
			fallbackTierRadius: 2,
			overscanPx: 2,
			zoomTiers: [0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8],
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

	function flushDirtyPatches() {
		if (!c) return;
		if (isLoading()) return;
		if (dirtyObjects.size === 0 && dirtyOldRects.length === 0) return;

		const gs = useGestureStore();
		if (gs.isGesturing) {
			for (const obj of dirtyObjects) {
				deferredDuringGesture.push({ kind: "obj", payload: obj });
			}
			for (const r of dirtyOldRects) {
				deferredDuringGesture.push({ kind: "rect", payload: r });
			}
			dirtyObjects.clear();
			dirtyOldRects.length = 0;
			return;
		}

		const objs = Array.from(dirtyObjects);
		const oldRects = dirtyOldRects.slice();
		dirtyObjects.clear();
		dirtyOldRects.length = 0;

		const candidates: Cluster[] = [];
		for (const obj of objs) {
			const b = objectBounds(obj);
			if (!isFinite(b.x) || !isFinite(b.y) || b.w <= 0 || b.h <= 0) continue;
			candidates.push({ rect: b, objects: [obj] });
		}
		for (const r of oldRects) {
			if (!isFinite(r.x) || !isFinite(r.y) || r.w <= 0 || r.h <= 0) continue;
			candidates.push({ rect: r, objects: [] });
		}

		if (candidates.length === 0) return;

		const clusters = clusterCandidates(candidates);

		for (const cl of clusters) {
			tileCache.invalidateRect(cl.rect);
		}

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

		renderMain();
		scheduleBake();

		for (const obj of objs) maybeExtendCoarse(obj);
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
			const dist = (ccx - cx) ** 2 + (ccy - cy) ** 2;
			const tilesEst = estimatePatchTileCount([cl.rect], tier);
			return { cl, dist, tilesEst };
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
					const a = result[i];
					const b = result[j];
					const u = unionRect(a.rect, b.rect);
					const unionArea = u.w * u.h;
					const aArea = a.rect.w * a.rect.h;
					const bArea = b.rect.w * b.rect.h;
					if (unionArea <= (aArea + bArea) * CLUSTER_WASTE_THRESHOLD) {
						result[i] = {
							rect: u,
							objects: a.objects.concat(b.objects),
						};
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

	function unionRect(a: WorldRect, b: WorldRect): WorldRect {
		const x = Math.min(a.x, b.x);
		const y = Math.min(a.y, b.y);
		const x2 = Math.max(a.x + a.w, b.x + b.w);
		const y2 = Math.max(a.y + a.h, b.y + b.h);
		return { x, y, w: x2 - x, h: y2 - y };
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
		if (gs.isGesturing) {
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

	const events: FabricEvent[] = [
		{
			on: "object:added",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				if (isLoading()) {
					objectMap.set(obj.id, obj);
					return;
				}
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
				isZIndexDirty = true;
				scheduleObjectPatch(obj);
			},
		},
		{
			on: "object:removed",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				const oldRect = objectBounds(obj);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
				invalidateZIndex();
				if (!isLoading()) scheduleRectPatch(oldRect);
			},
		},
		{
			on: "object:modified",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				const transform = e.transform;

				const collectOldRect = (o: FabricObject) => {
					if (!transform?.original) return null;
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
					};
					try {
						o.set(transform.original);
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
				};

				if (obj.type === ObjectType.selection) {
					const actives = c!.getActiveObjects();
					for (const o of actives) {
						const old = collectOldRect(o);
						updateQuadTree(o);
						if (!isLoading()) {
							if (old) scheduleRectPatch(old);
							scheduleObjectPatch(o);
						}
					}
				} else {
					const old = collectOldRect(obj);
					updateQuadTree(obj);
					if (!isLoading()) {
						if (old) scheduleRectPatch(old);
						scheduleObjectPatch(obj);
					}
				}
			},
		},
		{
			on: "fullErase",
			handler: () => {
				tileCache.invalidateAll();
				coarseBakedBounds = null;
				if (!isLoading()) renderMain();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				if (!isLoading()) renderMain(true);
			},
		},
		{
			on: "invalidateCanvas",
			handler: (e: any) => {
				if (isLoading()) return;
				const targets = Array.isArray(e.target) ? e.target : [e.target];
				for (const obj of targets as FabricObject[]) {
					if (obj?.id) scheduleObjectPatch(obj);
				}
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
		const t = Array.isArray(e.target) ? e.target : [e.target];
		scheduleObjectsPatch(t);
	}

	function renderMain(forceBake = false) {
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
	}

	function renderViewport(forceBake = false) {
		renderMain(forceBake);
	}

	function scheduleBake() {
		const gs = useGestureStore();
		if (gs.isGesturing || !c) return;
		if (isLoading()) return;
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

		const vpt = c.viewportTransform!;
		const pw = c.getElement().width;
		const ph = c.getElement().height;
		const dpr = window.devicePixelRatio || 1;

		prefetchBakeController?.abort();
		prefetchBakeController = null;

		primaryBakeController?.abort();
		const ctrl = new AbortController();
		primaryBakeController = ctrl;

		tileCache
			.bakeMissing(vpt, { w: pw, h: ph }, dpr, primaryYielder, ctrl.signal)
			.then(() => {
				const wasCurrent = primaryBakeController === ctrl;
				if (wasCurrent) primaryBakeController = null;
				if (!wasCurrent) return;

				requestAnimationFrame(() => {
					if (!c) return;
					renderMain();
				});
			})
			.catch(() => {
				if (primaryBakeController === ctrl) primaryBakeController = null;
				requestAnimationFrame(() => {
					if (c) renderMain();
				});
			});
	}

	function onGestureStart() {
		tileCache.abortInflightBakes();
		primaryBakeController?.abort();
		primaryBakeController = null;
		prefetchBakeController?.abort();
		prefetchBakeController = null;
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

		renderMain(true);
	}

	function init(canvas: Canvas) {
		c = canvas;
		addStartingCanvasObjects();
		useDrawEventManager().addPermanentEvents(events);
		renderMain();
	}

	function addStartingCanvasObjects() {
		const { isBlocked } = useFriendStore();
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		isZIndexDirty = true;
		tileCache.invalidateAll();
		coarseBakedBounds = null;

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

	function invalidateZIndex() {
		isZIndexDirty = true;
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

		for (const obj of c.getObjects()) {
			if (obj.id) {
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
			}
		}
	}

	return {
		init,
		renderMain,
		renderViewport, // legacy alias
		onGestureStart,
		onGestureEnd,
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
	};
});
