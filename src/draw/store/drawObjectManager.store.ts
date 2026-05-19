// src/draw/store/drawObjectManager.store.ts
import { defineStore } from "pinia";
import { Canvas, FabricObject } from "fabric";
import { FabricEvent, ObjectType } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import {
	fabricObjectToEntry,
	InfiniteQuadtreeManager,
	QuadtreeEntry,
} from "@/draw/utils/QuadTree";
import { useGestureStore } from "@/draw/store/tools/gesture.store";
import { useAuthStore } from "@/store/auth.store";
import { isMobile } from "@/helper/general.helper";
import { TileCache, WorldRect } from "@/draw/tilecache";
import { createYielder } from "@/draw/helpers/yielding.helper";

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

	// ---------------------------------------------------------------------
	// Coarse-bake bounds tracking. We bake the entire scene at tier 0 so
	// the fallback chain always has something to draw, even far outside the
	// viewport. With collaborative editing, new objects can appear outside
	// our previously-known bounds — we need to grow this region.
	// ---------------------------------------------------------------------
	let coarseBakedBounds: WorldRect | null = null;
	let coarseExtendScheduled: any = null;

	const primaryYielder = createYielder({
		budgetMs: IS_LOW_END ? 4 : IS_MOBILE ? 6 : 8,
	});
	const prefetchYielder = createYielder({
		budgetMs: IS_LOW_END ? 2 : IS_MOBILE ? 3 : 4,
	});

	function getZIndexMap(): Map<FabricObject, number> {
		if (isZIndexDirty) {
			zIndexMap.clear();
			c!.getObjects().forEach((o, i) => zIndexMap.set(o, i));
			isZIndexDirty = false;
		}
		return zIndexMap;
	}

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

	const tileRenderer = (
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		obj: FabricObject,
	) => {
		if (obj.visible === false || obj.opacity === 0) return false;

		ctx.save();

		// 1. Force absolute isolation from its parent canvas properties during this thread
		const originalCanvas = obj.canvas;
		// @ts-ignore
		obj.canvas = null;

		// 2. Clear caching references on the fly
		const wasCached = obj.objectCaching;
		obj.objectCaching = false;
		obj.dirty = true;

		try {
			// 3. Compute and apply the object's specific transform matrix manually to the canvas context
			// This detaches the geometry from whatever the interactive canvas thread is doing.
			if (typeof (obj as any).calcTransformMatrix === "function") {
				const matrix = (obj as any).calcTransformMatrix();
				ctx.transform(
					matrix[0],
					matrix[1],
					matrix[2],
					matrix[3],
					matrix[4],
					matrix[5],
				);
			} else {
				// Fallback if matrix calculation is unavailable
				ctx.translate(obj.left, obj.top);
				ctx.rotate((obj.angle * Math.PI) / 180);
				ctx.scale(obj.scaleX, obj.scaleY);
			}

			// 4. Draw the RAW vector geometry paths directly onto the context
			// This completely bypasses container lookups, clipPaths, and canvas state dependencies.
			if ((obj as any)._render) {
				(obj as any)._render(ctx);
			} else {
				obj.render(ctx as any);
			}
		} catch (err) {
			console.warn("[TileRenderer Isolation Override] Draw failed:", err);
		} finally {
			// 5. Restore original states safely
			obj.objectCaching = wasCached;
			// @ts-ignore
			obj.canvas = originalCanvas;
			ctx.restore();
		}
	};

	const tileCache = new TileCache<FabricObject>(spatialIndex, tileRenderer, {
		tileSize: 256,
		memoryBudgetMB: IS_MOBILE ? 64 : 256,
		fallbackTierRadius: 6,
		viewportPaddingTiles: IS_MOBILE ? 0.5 : 1,
		tierSwitchThreshold: 0.5,
		overscanPx: 2,
		debugOverlay: true,
	});

	// ---------------------------------------------------------------------
	// Bounds helpers for tracking coarse-baked region.
	// ---------------------------------------------------------------------
	function objectBounds(obj: FabricObject): WorldRect {
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

	/**
	 * If `obj` falls outside the coarse-baked region, schedule an extension
	 * bake. Debounced so a burst of new objects from a collaborator doesn't
	 * trigger N separate coarse bakes.
	 */
	function maybeExtendCoarse(obj: FabricObject) {
		if (!c) return;
		const ob = objectBounds(obj);
		// Skip degenerate.
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
			// Try again after gesture.
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
		const bg = c.backgroundColor as string;

		tileCache
			.bakeRect(bounds, 0, prefetchYielder, ctrl.signal, bg)
			.then(() => {
				if (prefetchBakeController === ctrl) prefetchBakeController = null;
				// Coarse bake doesn't require a render — fallbacks now have
				// content but the visible viewport is already painted with
				// whatever it has. New renders will pick this up naturally.
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
				maybeExtendCoarse(obj); // <-- collab fix
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
				// Coarse re-bake will happen on next viewport bake completion
				// via the regular schedule. We don't reset coarseBakedBounds
				// since the world extent hasn't changed.
				scheduleBake();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				tileCache.invalidateAll();
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
		const bg = c.backgroundColor as string;

		const mainCtx = c.getContext();
		const report = tileCache.composite(mainCtx, vpt, { w: pw, h: ph }, dpr, bg);

		// @ts-ignore
		if (!c.skipControlsDrawing) {
			c.drawControls(mainCtx);
		}

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
		const bg = c.backgroundColor as string;

		prefetchBakeController?.abort();
		prefetchBakeController = null;

		primaryBakeController?.abort();
		const ctrl = new AbortController();
		primaryBakeController = ctrl;

		tileCache
			.bakeMissing(vpt, { w: pw, h: ph }, dpr, primaryYielder, ctrl.signal, bg)
			.then((report) => {
				const wasCurrent = primaryBakeController === ctrl;
				if (wasCurrent) primaryBakeController = null;

				// If superseded by a newer bake, that newer bake will render.
				if (!wasCurrent) return;

				requestAnimationFrame(() => {
					if (!c) return;
					// Always render — composite's missing-tile detection will
					// reschedule via scheduleBake() if anything is still
					// outstanding. This is the retry mechanism for aborted
					// bakes.
					renderViewport();

					// Only prefetch when bake completed cleanly AND we're not
					// gesturing. Otherwise the gesture handlers / the next
					// scheduled bake will take care of it.
					const gs2 = useGestureStore();
					if (report.aborted) return;
					if (gs2.isGesturing) return;
					// kickoffNeighborPrefetch(); TODO LATER OPTIMIZATION
				});
			})
			.catch(() => {
				if (primaryBakeController === ctrl) primaryBakeController = null;
				requestAnimationFrame(() => {
					if (c) renderViewport();
				});
			});
	}

	function kickoffNeighborPrefetch() {
		if (!c) return;
		const gs = useGestureStore();
		if (gs.isGesturing) return;

		prefetchBakeController?.abort();
		const ctrl = new AbortController();
		prefetchBakeController = ctrl;

		const vpt = c.viewportTransform!;
		const pw = c.getElement().width;
		const ph = c.getElement().height;
		const dpr = window.devicePixelRatio || 1;
		const bg = c.backgroundColor as string;

		tileCache
			.bakeNeighborTiers(
				vpt,
				{ w: pw, h: ph },
				dpr,
				prefetchYielder,
				ctrl.signal,
				bg,
			)
			.then(() => {
				if (prefetchBakeController === ctrl) prefetchBakeController = null;
			})
			.catch(() => {
				if (prefetchBakeController === ctrl) prefetchBakeController = null;
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

		c.on("mouse:up", (options) => {
			const e = options.e; // Get the native browser event

			// 2. Get canvas element bounding rect
			// In Fabric, 'c' is your canvas instance; c.upperCanvasEl handles pointer events
			const canvasElement = c.upperCanvasEl;
			const rect = canvasElement.getBoundingClientRect();

			// 3. Get Device Pixel Ratio
			const dpr = window.devicePixelRatio || 1;

			// 4. Calculate viewport-relative DEVICE-PIXEL positions
			const px = (e.clientX - rect.left) * dpr;
			const py = (e.clientY - rect.top) * dpr;

			// 5. Get the current viewport transform matrix (vpt)
			// Fabric v5: c.viewportTransform
			// Fabric v6+: c.getViewportTransform()
			const vpt =
				c.viewportTransform ||
				(c.getViewportTransform && c.getViewportTransform());

			const hit = tileCache.debugTileAtPixel(px, py, vpt, dpr);
			if (hit) {
				tileCache.debugRebakeTile(hit.tier, hit.tx, hit.ty);
			}
		});
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

	return {
		init,
		renderViewport,
		onGestureStart,
		onGestureEnd,
		purgeBlockedObjects,
		query,
		getZIndexMap,
	};
});
