import { Canvas, FabricObject } from "fabric";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { getViewportRect } from "@/draw/utils/QuadTree";
import {
	getRenderDpr,
	IS_LOW_END_DEVICE,
} from "@/draw/config/renderQuality.config";
import {
	getDrawRenderBackend,
	installDrawRenderBackendDebugApi,
} from "@/draw/config/renderBackend.config";
import { initDrawMetrics } from "@/draw/rendering/renderMetrics";
import { createYielder } from "@/draw/scheduling/yielder";
import { isolatedTileRenderer } from "@/draw/rendering/fabricTileRenderer";
import { serializeOnce } from "@/draw/objects/objectSerialization";
import { useFriendStore } from "@/store/friend.store";
import { rerenderActiveObjectControls } from "@/draw/rendering/fabricRenderState";
import * as localTransform from "@/draw/transform/transformController";
import { RenderEngine, type Surface } from "@/draw/rendering/renderEngine";
import { ExplicitZIndex } from "@/draw/objects/indexing/zIndex";
import { createDrawingSpatialIndex } from "@/draw/objects/indexing/spatialIndex";
import { createFabricEventBridge } from "@/draw/canvas/fabricEventBridge";
import { createLiveObjectRenderer } from "@/draw/rendering/liveObjectRenderer";
import { createGestureController } from "@/draw/input/gestureController";
import { createEngineOptions } from "@/draw/rendering/engineOptions";
import type { WorldRect } from "@/draw/rendering/committedLayer";
import {
	bakeryBakeTile,
	bakeryClear,
	bakeryClipSet,
	bakeryFlushSoon,
	bakeryMarkDirty,
	bakeryRemove,
	bakerySeed,
	configureTileBakery,
	initTileBakery,
} from "@/draw/rendering/bakery/tileBakeryClient";

const IS_LOW_END = IS_LOW_END_DEVICE;

export function createDrawObjectManager() {
	let c: Canvas | undefined;
	let renderEngine: RenderEngine<FabricObject> | null = null;

	const objectMap = new Map<string, FabricObject>();
	const zIndex = new ExplicitZIndex(() => c?.getObjects() ?? [], objectMap);

	let loadingDepth = 0;
	const isLoading = () => loadingDepth > 0;

	// ── batch mode ─────────────────────────────────────────────────────────
	let batchDepth = 0;
	let batchRects: WorldRect[] = [];
	/**
	 * Objects ADDED during a batch, held back so they can go through the normal
	 * per-object add path at flush time instead of being flattened into a
	 * destructive rect invalidation.
	 *
	 * An add is ADDITIVE: the surrounding tile pixels are still perfectly valid,
	 * so `renderEngine.onObjectAdded` can stamp the object straight into the fresh tiles
	 * (or overlay it live) and nothing ever blurs. Turning it into a plain
	 * `markDirty(rect)` — which is what noteRegion did — threw the whole
	 * footprint away and rendered it from the overview until the bake landed.
	 * Every redo of a stroke went through exactly that path.
	 */
	let batchAdds: FabricObject[] = [];
	/** Past this, stamping each object individually costs more than one
	 *  coalesced invalidation (each stamp re-renders into every covered tile). A
	 *  bulk paste / big remote replay keeps the old behaviour. */
	const MAX_BATCH_STAMPED_ADDS = 16;
	const isBatching = () => batchDepth > 0;

	function beginBatch() {
		batchDepth++;
	}

	function endBatch() {
		batchDepth = Math.max(0, batchDepth - 1);
		if (batchDepth !== 0) return;
		const rects = batchRects;
		const adds = batchAdds;
		batchRects = [];
		batchAdds = [];
		if (isLoading() || !renderEngine) return;
		if (rects.length === 0 && adds.length === 0) return;
		// Batched changes (remote sync, undo/redo) may have altered objects that
		// are currently selected — the drag-layer bitmap can't be trusted anymore.
		localTransform.invalidateCache();
		// NB: do NOT recompute content bounds here. computeContentBounds is
		// O(all objects) and this runs on EVERY undo/redo and every remote-sync
		// batch — an all-scene scan per interaction on a big board. It is also
		// redundant: invalidateRegions() below calls growContentBounds() for
		// every rect, so growth is already covered. The only thing skipped is
		// SHRINK after a removal, and a slightly-loose content bound merely makes
		// the overview cover a bit of extra empty space — harmless. The full
		// recompute still runs on load / reset (endLoading, resetTileCache).
		if (rects.length) renderEngine.invalidateRegions(rects);
		// AFTER the destructive pass, never before: a stamp needs fresh tiles, so
		// running it first would only have it invalidated a moment later. If a
		// rect in this same batch did invalidate the region, the add falls back to
		// the live overlay by itself — correct either way.
		if (adds.length) {
			const order = c!.getObjects();
			const top = order.length ? order[order.length - 1] : null;
			for (const obj of adds) {
				if (!obj.id || !objectMap.has(obj.id)) continue; // added then removed
				renderEngine.onObjectAdded(obj, obj === top);
			}
		}
	}

	/** Returns true if the region was absorbed by the batch (skip per-event renderEngine). */
	function noteRegion(rect: WorldRect | null | undefined): boolean {
		if (!isBatching()) return false;
		if (rect) batchRects.push(rect);
		return true;
	}

	const {
		spatialIndex,
		queryObjects,
		clearSpatialIndex,
		addToQuadTree,
		removeFromQuadTree,
		updateQuadTree,
		clipChanged,
		offsetQuadTree,
		computeContentBounds,
		collectOldRect,
		objectBounds,
		staleBounds,
		unionRect,
		getZIndexMap,
		zGet,
		zRestore,
		zToFront,
		zToBack,
		zUpOne,
		zDownOne,
		invalidateZIndex,
		markZIndexDirty,
	} = createDrawingSpatialIndex(objectMap, zIndex);

	const renderLive = createLiveObjectRenderer(() => c);
	const gestures = createGestureController({
		getCanvas: () => c,
		getEngine: () => renderEngine,
		isLowEndDevice: IS_LOW_END,
	});

	// ── fabric events → renderEngine lifecycle ───────────────────────────────────────
	function onObjectAdded(obj: FabricObject) {
		if (!obj.id) return;
		objectMap.set(obj.id, obj);
		if (isLoading()) return; // bulk loads reseed the bakery in rebuildIndexFromCanvas
		// Seed the mirror from the SHARED serialization instead of marking dirty
		// (which would make the idle flush run a third toJSON of this same
		// stroke). serializeOnce is memoized for this dispatch, so the sync emit
		// and the history entry have already paid for it — or will reuse ours.
		// bakerySeed stashes it and drops the stash on the next real mutation.
		bakerySeed(obj, serializeOnce(obj));
		bakeryFlushSoon();
		addToQuadTree(obj);
		zIndex.assignOnAdd(obj);
		if (isBatching()) {
			// Hold it for the flush so it keeps the ADDITIVE path (stamp / live
			// overlay) instead of collapsing into a destructive rect. Past the cap,
			// fall back to the coalesced invalidation.
			if (batchAdds.length < MAX_BATCH_STAMPED_ADDS) batchAdds.push(obj);
			else noteRegion(objectBounds(obj));
			return;
		}
		const arr = c!.getObjects();
		const topmost = arr.length > 0 && arr[arr.length - 1] === obj;
		renderEngine?.onObjectAdded(obj, topmost);
	}

	/**
	 * Register objects added while actionWithoutEvents() had Fabric's
	 * object:added listener detached. Without this, they exist only in Fabric's
	 * display list: the active-object layer can show them briefly, but the tile
	 * renderer cannot find them after the next viewport redraw.
	 */
	function registerAddedObjects(objects: FabricObject[]) {
		if (!objects.length) return;
		beginBatch();
		try {
			for (const obj of objects) onObjectAdded(obj);
		} finally {
			endBatch();
		}
	}

	function onObjectRemoved(obj: FabricObject) {
		if (!obj.id) return;
		const oldRect = objectBounds(obj);
		objectMap.delete(obj.id);
		zIndex.remove(obj);
		bakeryRemove(obj.id);
		removeFromQuadTree(obj);
		if (isLoading()) return;
		if (noteRegion(oldRect)) return;
		renderEngine?.onObjectRemoved(obj, oldRect);
	}

	function onObjectModified(e: any) {
		const obj = e.target as FabricObject;
		if (!obj.id || !renderEngine) return;
		// Local drag is owned by transformController (it renders its own layer).
		if (localTransform.ownsTarget(obj)) {
			updateQuadTree(obj);
			return;
		}

		const oldRect = collectOldRect(obj, e.transform);
		updateQuadTree(obj);
		if (isLoading()) return;
		if (isBatching()) {
			const cur = objectBounds(obj);
			noteRegion(oldRect ? unionRect(cur, oldRect) : cur);
			return;
		}
		renderEngine.onObjectChangedCoalesced(obj, oldRect ?? undefined);
	}

	function handleStyleChange(e: any) {
		if (isLoading() || !renderEngine) return;
		// The transform controller's selection bitmap may show these objects.
		localTransform.invalidateCache();
		const list = (
			Array.isArray(e.target) ? e.target : [e.target]
		) as FabricObject[];
		const rects: WorldRect[] = [];
		let firstObj: FabricObject | null = null;
		let firstOldRect: WorldRect | undefined;
		for (const obj of list) {
			if (!obj?.id) continue;
			// Grab the pre-mutation footprint BEFORE updateQuadTree re-measures and
			// overwrites the cache. A style change can SHRINK an object — swapping to
			// a narrower font, mainly — and invalidating only the new (smaller) rect
			// is purely additive, so the pixels it vacated stay baked into the tiles
			// as leftover specks.
			const oldRect = staleBounds(obj);
			updateQuadTree(obj);
			const cur = objectBounds(obj);
			if (!firstObj) {
				firstObj = obj;
				firstOldRect = oldRect ?? undefined;
			}
			rects.push(oldRect ? unionRect(cur, oldRect) : cur);
		}
		if (!firstObj) return;
		if (isBatching()) {
			for (const r of rects) noteRegion(r);
			return;
		}
		// Single object keeps the precise per-object path; multi-object collapses
		// into ONE merged invalidation instead of N overview patches + N bakes.
		if (rects.length === 1)
			renderEngine.onObjectChanged(firstObj, firstOldRect);
		else renderEngine.invalidateRegions(rects);
	}

	const events = createFabricEventBridge({
		getEngine: () => renderEngine,
		isLoading,
		isBatching,
		noteRegion,
		objectBounds,
		unionRect,
		updateSpatialIndex: updateQuadTree,
		zIndex,
		onObjectAdded,
		onObjectRemoved,
		onObjectModified: (event) => onObjectModified(event as any),
		onStyleChanged: (event) => handleStyleChange(event as any),
	});

	// ── init / lifecycle ─────────────────────────────────────────────────────
	function init(canvas: Canvas) {
		c = canvas;
		const renderBackend = getDrawRenderBackend();
		installDrawRenderBackendDebugApi();
		initDrawMetrics(getRenderDpr, () => renderBackend);
		configureTileBakery(renderBackend === "worker");
		initTileBakery(); // no-op in main mode; otherwise warms worker parse

		const surface: Surface = {
			getContext: () => c!.getContext(),
			getSize: () => ({ w: c!.getElement().width, h: c!.getElement().height }),
			getVpt: () => c!.viewportTransform!,
			// MUST equal fabric's getRetinaScaling(): getSize() reports the backing
			// store fabric sized from config.devicePixelRatio, and viewWorld divides
			// by this. A mismatch scales the whole composite wrong.
			getDpr: getRenderDpr,
			getBackground: () => c!.backgroundColor as string,
		};

		renderEngine = new RenderEngine<FabricObject>(
			spatialIndex,
			isolatedTileRenderer,
			renderLive,
			surface,
			() => createYielder({ budgetMs: IS_LOW_END ? 4 : 8 }) as any,
			{
				...createEngineOptions(),
				afterComposite: () => {
					if (c) rerenderActiveObjectControls(c);
				},
				remoteBaker: renderBackend === "worker" ? bakeryBakeTile : undefined,
			},
		);

		rebuildIndexFromCanvas();
		renderEngine.setContentBounds(computeContentBounds());
		renderEngine.markAllDirty();
		renderEngine.warmOverview();
		useDrawEventManager().addPermanentEvents(events);
		renderEngine.requestFrame();
	}

	function beginIndexRebuild() {
		objectMap.clear();
		clearSpatialIndex();
		zIndex.reset();
		bakeryClear();
	}

	function indexCanvasObject(
		obj: FabricObject,
		isBlocked: (userId: string) => boolean,
	) {
		if (isBlocked(obj.userId)) {
			c?.remove(obj);
			return;
		}
		if (obj.id) {
			objectMap.set(obj.id, obj);
			addToQuadTree(obj);
			// Prefer the JSON the object was enlivened FROM (stashed at load) so the
			// mirror seeds with zero toJSON; fall back to a lazy serialize otherwise.
			const src = (obj as any).__bakeJSON;
			if (src) bakerySeed(obj, src);
			else bakeryMarkDirty(obj);
		}
	}

	function finishIndexRebuild() {
		zIndex.seed(c!.getObjects());
		// Start seeding the worker mirror NOW, in idle-sized chunks, instead of
		// letting the first bake ship the whole scene in one blocking postMessage.
		bakeryFlushSoon();
	}

	function rebuildIndexFromCanvas() {
		const { isBlocked } = useFriendStore();
		beginIndexRebuild();
		const objs = c!.getObjects();
		for (let i = objs.length - 1; i >= 0; i--) {
			indexCanvasObject(objs[i], isBlocked);
		}
		finishIndexRebuild();
	}

	async function rebuildIndexFromCanvasYielded() {
		const { isBlocked } = useFriendStore();
		const yielder = createYielder({ budgetMs: IS_LOW_END ? 4 : 6 });
		beginIndexRebuild();
		const objs = c!.getObjects();
		yielder.reset();
		for (let i = objs.length - 1; i >= 0; i--) {
			indexCanvasObject(objs[i], isBlocked);
			await yielder.maybeYield();
		}
		finishIndexRebuild();
	}

	// ── loading ──────────────────────────────────────────────────────────────
	function beginLoading() {
		if (loadingDepth === 0) renderEngine?.setLoading(true);
		loadingDepth++;
	}

	async function endLoading() {
		loadingDepth = Math.max(0, loadingDepth - 1);
		if (loadingDepth !== 0) return;
		if (!renderEngine || !c) return;

		// One load finalization pass. Callers used to rebuild the index, reset all
		// tiles, synchronously warm the overview, then come through here and do
		// the same rebuild/dirty/warm sequence again. Besides the duplicate CPU
		// and allocations, both overview jobs could overlap.
		renderEngine.reset();
		await rebuildIndexFromCanvasYielded();
		renderEngine.setContentBounds(computeContentBounds());
		await renderEngine.warmOverviewBlocking();
		renderEngine.setLoading(false);
		renderEngine.requestFrame();
		renderEngine.scheduleBake();
	}

	// ── blocked users ────────────────────────────────────────────────────────
	function purgeBlockedObjects() {
		const { isBlocked } = useFriendStore();
		const toRemove: FabricObject[] = [];
		objectMap.forEach((o) => {
			if (isBlocked(o.userId)) toRemove.push(o);
		});
		if (!toRemove.length) return;
		// c.remove() fires object:removed → onObjectRemoved does index + renderEngine work;
		// doing it manually here as well double-invalidated every region. Batch so
		// N removals collapse into one invalidateRegions pass.
		beginBatch();
		try {
			for (const obj of toRemove) c?.remove(obj);
		} finally {
			endBatch();
		}
		invalidateZIndex();
	}

	// ── public query API ─────────────────────────────────────────────────────
	function query(rect: WorldRect): FabricObject[] {
		return queryObjects(rect);
	}

	function getVisibleObjects(): FabricObject[] {
		return queryObjects(getViewportRect(c!));
	}

	function getObjectById(id: string) {
		return objectMap.get(id);
	}

	function getObjectsById(ids: string[]): FabricObject[] {
		return ids.map((id) => objectMap.get(id)).filter(Boolean) as FabricObject[];
	}

	// ── reset / rebuild ──────────────────────────────────────────────────────
	function resetTileCache() {
		renderEngine?.reset();
		renderEngine?.setContentBounds(computeContentBounds());
		renderEngine?.warmOverview();
		renderEngine?.requestFrame();
	}

	/** Await a full overview (base-layer) build. Called during the load reveal so
	 *  the first painted frame after a room join already has content — no white
	 *  flash. Paints stay suppressed by the renderEngine's loading gate until endLoading. */
	async function warmOverviewBlocking() {
		await renderEngine?.warmOverviewBlocking();
	}

	function rebuildSpatialIndex() {
		if (!c || !renderEngine) return;
		rebuildIndexFromCanvas();
		renderEngine.reset();
		renderEngine.setContentBounds(computeContentBounds());
		renderEngine.warmOverview();
		renderEngine.requestFrame();
	}

	// ── compatibility shims for external callers ─────────────────────────────
	function scheduleRectPatch(rect: WorldRect) {
		renderEngine?.markDirty(rect);
	}

	function scheduleObjectPatch(obj: FabricObject) {
		renderEngine?.markDirty(objectBounds(obj));
	}

	function flushPatchesNow(_force = false) {
		renderEngine?.requestFrame();
	}

	function isRegionBaked(rect: WorldRect): boolean {
		return renderEngine ? renderEngine.isRegionBaked(rect) : true;
	}

	function patchRectSync(rect: WorldRect) {
		if (!renderEngine || !c) return;
		if (noteRegion(rect)) return; // batched → one invalidate at endBatch
		const vpt = c.viewportTransform!;
		const tier = renderEngine.pickActiveTier(vpt[0]);
		renderEngine.markDirtyAndRebuildSync(rect, tier);
	}

	function clearAllObjects() {
		if (!c || !renderEngine) return;
		objectMap.clear();
		clearSpatialIndex();
		bakeryClear();
		zIndex.reset();
		renderEngine.reset();
		renderEngine.setContentBounds(null);
		renderEngine.requestFrame();
	}

	return {
		init,
		renderMain: gestures.requestFrame,
		renderViewport: gestures.requestFrame,
		renderViewportNow: gestures.renderFrameNow,
		onGestureStart: gestures.start,
		onGestureEnd: gestures.end,
		recordPanDelta: () => {},
		purgeBlockedObjects,
		query,
		getZIndexMap,
		updateQuadTree,
		clipChanged,
		offsetQuadTree,
		getObjectBounds: objectBounds,
		getStaleObjectBounds: staleBounds,
		getVisibleObjects,
		getObjectById,
		getObjectsById,
		registerAddedObjects,
		translateMirror: gestures.translateMirror,
		zToFront,
		zToBack,
		zUpOne,
		zDownOne,
		zGet,
		zRestore,
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
		setErasing: gestures.setErasing,
		dropRegion: gestures.dropRegion,
		dropRegionLight: gestures.dropRegionLight,
		dropRegionEraseUndo: gestures.dropEraseRegion,
		eraseStampCommit: gestures.commitEraseStamp,
		stampRegionBitmap: gestures.stampRegionBitmap,
		patchRectSync,
		beginBatch,
		endBatch,
		isBatching,
		markZIndexDirty,
		getZoomLimits: gestures.getZoomLimits,
		getContentBounds: computeContentBounds,
		clearAllObjects,
	};
}

export type DrawObjectManager = ReturnType<typeof createDrawObjectManager>;

let drawObjectManager: DrawObjectManager | undefined;

export function useDrawObjectManager(): DrawObjectManager {
	return (drawObjectManager ??= createDrawObjectManager());
}
