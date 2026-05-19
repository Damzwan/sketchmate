// src/draw/store/drawObjectManager.store.ts
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

const IS_MOBILE = isMobile();
const HW_CONCURRENCY = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW_CONCURRENCY <= 4;

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

		// REMOVED Background color from baking parameters
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
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
				isZIndexDirty = true;
				tileCache.invalidateObject(obj);
				maybeExtendCoarse(obj);
				scheduleBake();
			},
		},
		{
			on: "object:removed",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				tileCache.invalidateObject(obj);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
				invalidateZIndex();
				scheduleBake();
			},
		},
		{
			on: "object:modified",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (obj.type === ObjectType.selection) {
					c!.getActiveObjects().forEach((o) => {
						updateQuadTree(o);
						tileCache.invalidateObject(o);
						maybeExtendCoarse(o);
					});
				} else {
					updateQuadTree(obj);
					tileCache.invalidateObject(obj);
					maybeExtendCoarse(obj);
				}
				scheduleBake();
			},
		},
		{
			on: "fullErase",
			handler: () => {
				tileCache.invalidateAll();
				coarseBakedBounds = null;
				renderViewport();
			},
		},
		{
			on: "layer:changed",
			handler: () => {
				isZIndexDirty = true;
				tileCache.invalidateAll();
				scheduleBake();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				// Tile Cache invalidation not needed anymore since background is detached
				renderViewport(true);
			},
		},
		{
			on: "invalidateCanvas",
			handler: (e: any) => {
				const targets = Array.isArray(e.target) ? e.target : [e.target];
				targets.forEach((obj: FabricObject) => {
					if (obj?.id) tileCache.invalidateObject(obj);
				});
				scheduleBake();
			},
		},
	];

	function renderViewport(forceBake = false) {
		if (!c) return;
		const vpt = c.viewportTransform!;
		const pw = c.getElement().width;
		const ph = c.getElement().height;
		const dpr = window.devicePixelRatio || 1;

		// Background is only used here during the compositing phase
		const bg = c.backgroundColor as string;
		const mainCtx = c.getContext();

		const report = tileCache.composite(mainCtx, vpt, { w: pw, h: ph }, dpr, bg);

		// @ts-ignore
		if (!c.skipControlsDrawing) c.drawControls(mainCtx);

		if (forceBake) {
			clearTimeout(pendingBakeTimeout);
			pendingBakeTimeout = null;
			runBake();
		} else if (report.tilesMissing > 0 || report.tilesFallback > 0) {
			scheduleBake();
		}
	}

	function scheduleBake() {
		const gs = useGestureStore();
		if (gs.isGesturing || !c) return;
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

		// REMOVED Background color parameter
		tileCache
			.bakeMissing(vpt, { w: pw, h: ph }, dpr, primaryYielder, ctrl.signal)
			.then((report) => {
				const wasCurrent = primaryBakeController === ctrl;
				if (wasCurrent) primaryBakeController = null;
				if (!wasCurrent) return;

				requestAnimationFrame(() => {
					if (!c) return;
					renderViewport();
				});
			})
			.catch(() => {
				if (primaryBakeController === ctrl) primaryBakeController = null;
				requestAnimationFrame(() => {
					if (c) renderViewport();
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
	}

	function onGestureEnd() {
		clearTimeout(pendingBakeTimeout);
		pendingBakeTimeout = null;
		renderViewport(true);
	}

	function init(canvas: Canvas) {
		c = canvas;
		addStartingCanvasObjects();
		useDrawEventManager().addPermanentEvents(events);
		renderViewport();
		// Removed specific mouse:up debug listener to keep things clean
	}

	function addStartingCanvasObjects() {
		const blocked = useAuthStore().user?.blocked_users ?? [];
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		isZIndexDirty = true;
		tileCache.invalidateAll();
		coarseBakedBounds = null;

		const objects = c!.getObjects();
		for (let i = objects.length - 1; i >= 0; i--) {
			const obj = objects[i];
			if (blocked.includes(obj.userId)) {
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
		const blocked = useAuthStore().user?.blocked_users ?? [];
		if (!blocked.length) return;
		const toRemove: FabricObject[] = [];
		objectMap.forEach((o) => {
			if (blocked.includes(o.userId)) toRemove.push(o);
		});
		if (!toRemove.length) return;
		toRemove.forEach((obj) => {
			if (obj.id) {
				tileCache.invalidateObject(obj);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
			}
			c?.remove(obj);
		});
		invalidateZIndex();
		renderViewport(true);
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

	return {
		init,
		renderViewport,
		onGestureStart,
		onGestureEnd,
		purgeBlockedObjects,
		query,
		getZIndexMap,
		updateQuadTree,
		getVisibleObjects,
		getObjectById,
		getObjectsById,
	};
});
