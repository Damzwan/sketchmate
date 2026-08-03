import { Canvas, FabricObject } from "fabric";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { getViewportRect } from "@/draw/utils/QuadTree";
import {
	getRenderDpr,
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
} from "@/draw/config/renderQuality.config";
import {
	getDrawRenderBackend,
	installDrawRenderBackendDebugApi,
} from "@/draw/config/renderBackend.config";
import { initDrawMetrics } from "@/draw/rendering/renderMetrics";
import {
	installDrawDiagnostics,
	uninstallDrawDiagnostics,
} from "@/draw/diagnostics/drawDiagnostics";
import {
	installDrawMemoryPressure,
	uninstallDrawMemoryPressure,
} from "@/draw/diagnostics/drawMemoryPressure";
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
	isLayerHidden,
	isOnActiveLayer,
	isOnTopLayer,
	layerCount,
	layerOrderOf,
} from "@/draw/layers/layerRegistry";
import {
	bakeryBakeTile,
	bakeryBeginSceneBatch,
	bakeryCancel,
	bakeryClear,
	bakeryClipSet,
	bakeryEndSceneBatch,
	bakeryFlushSoon,
	bakeryMarkDirty,
	bakeryRemove,
	bakeryRenderOverview,
	bakerySeed,
	shutdownTileBakerySession,
	configureTileBakery,
	initTileBakery,
} from "@/draw/rendering/bakery/tileBakeryClient";

const IS_LOW_END = IS_LOW_END_DEVICE;
/**
 * Main-thread raster work remains bursty for throughput, but it must hand a
 * full frame to Android WebView regularly even when isInputPending is missing.
 * 12 ms leaves useful headroom in a 60 Hz frame without reducing baking to one
 * tiny slice per frame. Desktop can run longer between frame opportunities.
 */
const RENDER_WORK_BUDGET_MS = IS_LOW_END ? 3 : IS_MOBILE_DEVICE ? 5 : 8;
const RENDER_FRAME_YIELD_INTERVAL_MS = IS_MOBILE_DEVICE ? 12 : 24;

/**
 * How long the load reveal may wait for the first bake of the visible viewport.
 *
 * Deliberately generous. Users accept loading time; what they do not accept is
 * an indicator that clears and hands them a canvas that then stutters for
 * several seconds. Spending that time before the reveal costs nothing they
 * notice and buys a canvas that is genuinely ready.
 *
 * It is a ceiling, not a target: a small drawing bakes in a few hundred ms and
 * reveals immediately. Only a very large board reaches it, and reaching it is
 * safe — the overview is already built by then, so the reveal shows the whole
 * drawing softly rather than blankly while the remaining tiles land.
 */
const FIRST_PAINT_BAKE_BUDGET_MS = IS_LOW_END
	? 6_000
	: IS_MOBILE_DEVICE
		? 5_000
		: 3_000;

export function createDrawObjectManager() {
	let c: Canvas | undefined;
	let renderEngine: RenderEngine<FabricObject> | null = null;

	const objectMap = new Map<string, FabricObject>();
	// Fabric.getObjects() copies the entire stack. New strokes and imported
	// objects are overwhelmingly appended, and ExplicitZIndex checks the tail
	// before doing any search, so hand it the internal read-only stack here. This
	// turns bulk append z-assignment from O(N²) allocation/scanning into O(N).
	const zIndex = new ExplicitZIndex(
		() => (c ? ((c as any)._objects as FabricObject[]) : []),
		objectMap,
	);

	let loadingDepth = 0;
	const isLoading = () => loadingDepth > 0;

	// ── batch mode ─────────────────────────────────────────────────────────
	let batchDepth = 0;
	let batchRects: WorldRect[] = [];
	let batchRetainedRemovalRects: WorldRect[] = [];
	let retainedRemovalDepth = 0;
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
		if (batchDepth === 0) bakeryBeginSceneBatch();
		batchDepth++;
	}

	function endBatch() {
		batchDepth = Math.max(0, batchDepth - 1);
		if (batchDepth !== 0) return;
		bakeryEndSceneBatch();
		const rects = batchRects;
		const retainedRemovalRects = batchRetainedRemovalRects;
		const adds = batchAdds;
		batchRects = [];
		batchRetainedRemovalRects = [];
		batchAdds = [];
		if (isLoading() || !renderEngine) return;
		if (
			rects.length === 0 &&
			retainedRemovalRects.length === 0 &&
			adds.length === 0
		)
			return;
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
		// History removals swap the old sharp tile directly for its replacement.
		// Any destructive invalidation in the same batch runs afterwards and wins.
		if (retainedRemovalRects.length) {
			renderEngine.retainRegionsUntilRebaked(retainedRemovalRects);
		}
		if (rects.length) renderEngine.invalidateRegions(rects);
		// AFTER the destructive pass, never before: a stamp needs fresh tiles, so
		// running it first would only have it invalidated a moment later. If a
		// rect in this same batch did invalidate the region, the add falls back to
		// the live overlay by itself — correct either way.
		if (adds.length) {
			for (const obj of adds) {
				if (!obj.id || !objectMap.has(obj.id)) continue; // added then removed
				if (isLayerHidden((obj as any).layerId)) continue;
				// An add whose footprint the destructive pass just touched must NOT
				// take the additive stamp path.
				//
				// `invalidateRegions` above repairs visible tiles synchronously, and it
				// repairs them FROM THE SPATIAL INDEX — which already contains this
				// object, because it was added before the flush. Stamping it again
				// composites it twice. That is invisible for opaque content and
				// visibly DARKER for anything semi-transparent, until some later edit
				// forces a real re-bake. A batch that both removes and adds over the
				// same area — flattening a layer, undoing one — hits this every time.
				//
				// `topmost: false` routes it through the re-render-its-own-footprint
				// path instead, which is idempotent whether or not the repair already
				// covered it (the rects are merged inside invalidateRegions, so a
				// footprint can overlap one and still sit in a hole).
				const covered =
					rects.length > 0 && rectsIntersect(rects, objectBounds(obj));
				renderEngine.onObjectAdded(obj, !covered && isRenderTopmost(obj));
			}
		}
	}

	function rectsIntersect(list: readonly WorldRect[], rect: WorldRect): boolean {
		for (const r of list) {
			if (
				r.x < rect.x + rect.w &&
				rect.x < r.x + r.w &&
				r.y < rect.y + rect.h &&
				rect.y < r.y + r.h
			)
				return true;
		}
		return false;
	}

	/** Returns true if the region was absorbed by the batch (skip per-event renderEngine). */
	function noteRegion(rect: WorldRect | null | undefined): boolean {
		if (!isBatching()) return false;
		if (rect) batchRects.push(rect);
		return true;
	}

	function withRetainedRemovalTiles<T>(operation: () => T): T {
		retainedRemovalDepth++;
		try {
			return operation();
		} finally {
			retainedRemovalDepth--;
		}
	}

	/**
	 * Erase undo/redo region repair, batch-aware.
	 *
	 * Holding undo queues one history op per keypress, and each one used to run a
	 * full repair pass: a synchronous tile rebuild, an overview patch and a bake
	 * of the whole invalidated region. Measured over a 23s erase session that was
	 * 163 sync repairs (2.1s) and 307 overview patches (0.9s) of pure main-thread
	 * time, most of it immediately thrown away by the next undo.
	 *
	 * Inside a batch the changed rect just joins the batch — ONE repair for the
	 * whole burst. The re-bake region is still marked stale immediately, since
	 * that is bookkeeping only (no rendering) and keeps the tiles showable.
	 */
	function dropRegionEraseUndo(rect: WorldRect, changedRect?: WorldRect) {
		if (isBatching()) {
			localTransform.invalidateCache();
			if (changedRect) renderEngine?.markRegionStale(rect);
			batchRects.push(changedRect ?? rect);
			return;
		}
		gestures.dropEraseRegion(rect, changedRect);
	}

	const {
		spatialIndex,
		queryObjects,
		queryObjectsRaw,
		queryInteractiveObjects,
		querySelectableObjects,
		layerContentBounds,
		objectIdsOnLayer,
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

	/**
	 * "Can anything paint over this object?" — the question `onObjectAdded`'s
	 * fast paths actually depend on. Both of them (the additive tile stamp and
	 * the live overlay) draw the object ON TOP of what is already there, which is
	 * only correct when nothing outranks it.
	 *
	 * Canvas order alone was the test, and with layers that is wrong: a stroke
	 * drawn on a low layer is still appended LAST to the canvas, so it claimed
	 * both fast paths and appeared over content that must cover it — until the
	 * bake landed and it snapped underneath.
	 *
	 * The layer check is nearly free (a rank compare) and short-circuits the
	 * common cases: one layer, or drawing on the top layer. Only a genuine
	 * draw-underneath pays the overlap query, which is bounded by the new
	 * object's own footprint.
	 */
	function isRenderTopmost(obj: FabricObject): boolean {
		const arr = c!.getObjects();
		if (arr.length === 0 || arr[arr.length - 1] !== obj) return false;
		if (layerCount() < 2 || isOnTopLayer((obj as any).layerId)) return true;
		const rank = layerOrderOf((obj as any).layerId);
		for (const other of queryObjects(objectBounds(obj))) {
			if (other === obj) continue;
			if (layerOrderOf((other as any).layerId) > rank) return false;
		}
		return true;
	}

	/**
	 * "Does this region belong to exactly one layer?"
	 *
	 * Gate for the engine's destination-out fast paths (the erase stamp and the
	 * overview punch). Those subtract pixels from a bitmap that already holds
	 * every layer composited together, so a punch cannot distinguish the erased
	 * layer's pixels from anything sitting under the stroke — which is precisely
	 * how an erase on one layer visibly ate content on another.
	 *
	 * Short-circuits on a single-layer document, so the overwhelmingly common
	 * case keeps the fast path and pays one boolean. Otherwise it costs one
	 * quadtree query per erase COMMIT (not per frame), bounded by the stroke's
	 * own footprint, and returns false only when another layer really does have
	 * content there — an erase in a region only your layer occupies still gets
	 * the cheap punch.
	 */
	function isRegionSingleLayer(rect: WorldRect): boolean {
		if (layerCount() < 2) return true;
		for (const obj of queryObjects(rect)) {
			if (!isOnActiveLayer((obj as any).layerId)) return false;
		}
		return true;
	}

	// ── fabric events → renderEngine lifecycle ───────────────────────────────────────
	function onObjectAdded(obj: FabricObject) {
		if (!obj.id) return;
		localTransform.invalidateVacatedCache();
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
		// Hidden-layer edits remain indexed, serialized, synced and undoable, but
		// must not enter the immediate tile-stamp/live-overlay render path.
		if (isLayerHidden((obj as any).layerId)) return;
		if (isBatching()) {
			// Hold it for the flush so it keeps the ADDITIVE path (stamp / live
			// overlay) instead of collapsing into a destructive rect. Past the cap,
			// fall back to the coalesced invalidation.
			if (batchAdds.length < MAX_BATCH_STAMPED_ADDS) batchAdds.push(obj);
			else noteRegion(objectBounds(obj));
			return;
		}
		renderEngine?.onObjectAdded(obj, isRenderTopmost(obj));
	}

	function onObjectRemoved(obj: FabricObject) {
		if (!obj.id) return;
		localTransform.invalidateVacatedCache();
		const oldRect = objectBounds(obj);
		objectMap.delete(obj.id);
		zIndex.remove(obj);
		bakeryRemove(obj.id);
		removeFromQuadTree(obj);
		if (isLoading()) return;
		if (retainedRemovalDepth > 0) {
			renderEngine?.removeLiveObject(obj.id);
			if (isBatching()) batchRetainedRemovalRects.push(oldRect);
			else renderEngine?.retainRegionsUntilRebaked([oldRect]);
			return;
		}
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
		localTransform.invalidateVacatedCache();

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
		// Persist engine state to the Sentry scope from here on. Must run AFTER
		// initDrawMetrics (it owns the observers and the reporting sink).
		installDrawDiagnostics(renderBackend);
		configureTileBakery(renderBackend === "worker");
		initTileBakery(); // no-op in main mode; otherwise warms worker parse

		// Every accessor tolerates the canvas being GONE.
		//
		// Fabric's `dispose()` tears down `elements`, so `getContext()` throws a
		// TypeError on a disposed canvas rather than returning null. A frame or
		// bake scheduled just before teardown lands just after it — leaving the
		// draw page, or re-entering it (initCanvas disposes the old canvas and
		// then awaits the document load), both open that window. `renderNow`
		// already bails on a null context, so answering null is all it takes.
		const alive = () => !!c && !!(c as any).elements?.lower;
		const surface: Surface = {
			getContext: () => (alive() ? c!.getContext() : (null as any)),
			getSize: () =>
				alive()
					? { w: c!.getElement().width, h: c!.getElement().height }
					: { w: 0, h: 0 },
			getVpt: () => (alive() ? c!.viewportTransform! : [1, 0, 0, 1, 0, 0]),
			// MUST equal fabric's getRetinaScaling(): getSize() reports the backing
			// store fabric sized from config.devicePixelRatio, and viewWorld divides
			// by this. A mismatch scales the whole composite wrong.
			getDpr: getRenderDpr,
			getBackground: () =>
				alive() ? (c!.backgroundColor as string) : "transparent",
		};

		renderEngine = new RenderEngine<FabricObject>(
			spatialIndex,
			isolatedTileRenderer,
			renderLive,
			surface,
			(label) =>
				createYielder({
					budgetMs: RENDER_WORK_BUDGET_MS,
					frameYieldIntervalMs: RENDER_FRAME_YIELD_INTERVAL_MS,
					label: label ?? "render-work",
				}) as any,
			{
				...createEngineOptions(),
				afterComposite: () => {
					if (c) rerenderActiveObjectControls(c);
				},
				canPunchRegion: isRegionSingleLayer,
				remoteBaker: renderBackend === "worker" ? bakeryBakeTile : undefined,
				remoteOverview:
					renderBackend === "worker" ? bakeryRenderOverview : undefined,
				cancelRemoteWork: renderBackend === "worker" ? bakeryCancel : undefined,
			},
		);

		// Hand back every GPU-backed cache while the app is in the background, and
		// on an Android memory-pressure signal. The scene is untouched — this only
		// drops tiles, the overview and the canvas pool — so coming back is a
		// repaint, not a reload. See drawMemoryPressure.ts.
		installDrawMemoryPressure({
			release: () => renderEngine?.releaseGraphicsMemory(),
			restore: () => renderEngine?.restoreFromRelease(),
		});

		rebuildIndexFromCanvas();
		renderEngine.setContentBounds(computeContentBounds());
		renderEngine.markAllDirty();
		// Paint nothing until `prepareFirstPaint` says the picture is real.
		//
		// This used to fire `warmOverview()` (abortable, fire-and-forget) and then
		// `requestFrame()` immediately, while the caller cleared its loading
		// indicator in the very next statement. On a large board that meant the
		// spinner disappeared before there was an overview to show — a white canvas
		// for a beat — and long before any tile was baked, so the first pan or zoom
		// ran straight into the whole first bake pass.
		renderEngine.setLoading(true);
		useDrawEventManager().addPermanentEvents(events);
	}

	/**
	 * Finish loading: guarantee the first painted frame is a real picture, and
	 * that the engine is not still doing its heaviest work when the user gets
	 * control.
	 *
	 * Awaited by the caller BEFORE it clears the loading indicator. That is the
	 * whole point — a loading indicator that clears while the canvas is blank and
	 * the main thread is saturated is worse than a slightly longer one, because
	 * the user reads it as "ready" and immediately hits the lag.
	 *
	 * Two stages, in this order for a reason:
	 *   1. The overview, BLOCKING and non-abortable. It is the base layer under
	 *      every unbaked tile, so once it exists the canvas can never be blank
	 *      again no matter what happens next.
	 *   2. The visible tiles, on a wall-clock budget. Sharpness, and — more to
	 *      the point — the bulk of the main-thread rasterization, moved inside
	 *      the loading window instead of landing on the user's first gesture.
	 *
	 * Stage 2's budget bounds the WAIT, not the work: on timeout the bake keeps
	 * going and reveals happen against the overview, which is soft but complete.
	 */
	async function prepareFirstPaint(signal?: AbortSignal): Promise<void> {
		if (!renderEngine) return;
		try {
			await renderEngine.warmOverviewBlocking();
			if (signal?.aborted) return;
			await renderEngine.bakeVisibleBlocking(
				FIRST_PAINT_BAKE_BUDGET_MS,
				signal,
			);
		} finally {
			// Reveal even if a stage threw. A soft or partial picture is recoverable;
			// a canvas stuck behind a permanent loading gate is not.
			//
			// …but NOT if another load started while we were waiting. This await is
			// now seconds long on a big board, which is ample time for a room join or
			// a document swap to call beginLoading(); revealing here would un-suppress
			// frames over a scene that is mid-rebuild. Whoever owns the new load will
			// reveal when it is done.
			if (loadingDepth === 0) {
				renderEngine?.setLoading(false);
				renderEngine?.requestFrame();
				renderEngine?.scheduleBake();
			}
		}
	}

	/**
	 * The canvas is being disposed. Stop the engine before its surface dies, and
	 * drop both references so nothing can resurrect a frame against a dead
	 * fabric canvas. The next `init()` builds a fresh engine.
	 */
	function detach() {
		renderEngine?.destroy();
		renderEngine = null;
		objectMap.clear();
		clearSpatialIndex();
		zIndex.reset();
		batchDepth = 0;
		batchRects = [];
		batchRetainedRemovalRects = [];
		batchAdds = [];
		retainedRemovalDepth = 0;
		shutdownTileBakerySession();
		uninstallDrawMemoryPressure();
		uninstallDrawDiagnostics();
		c = undefined;
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
		const yielder = createYielder({
			budgetMs: IS_LOW_END ? 4 : 6,
			label: "spatial-index-rebuild",
		});
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
		// Same reveal contract as the solo path: overview first so the canvas can
		// never be blank, then the visible tiles so the first gesture after the
		// reveal is not competing with the first bake pass.
		await prepareFirstPaint();
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

	/**
	 * A layer's visibility or order changed. Nothing about the objects changed,
	 * only which of them the index hands out and in what order — so the correct
	 * response is a plain destructive invalidation of the region that layer
	 * covers, exactly like a bulk remote edit there.
	 *
	 * Bounded on purpose: a decoration layer in one corner must not cost the
	 * whole tile cache. `null` (layer is empty, or order changed globally) falls
	 * back to marking everything dirty, which is the honest cost of a reorder.
	 */
	function invalidateLayer(layerId: string | null) {
		if (!renderEngine) return;
		markZIndexDirty();
		localTransform.invalidateCache();
		localTransform.invalidateVacatedCache();
		const rect = layerId ? layerContentBounds(layerId) : null;
		if (rect) {
			renderEngine.invalidateRegions([rect]);
		} else {
			renderEngine.markAllDirty();
			renderEngine.warmOverview();
			renderEngine.requestFrame();
		}
		renderEngine.scheduleBake();
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

	function createDraftThumbnailBlob(
		maxSize: number,
		quality: number,
	): Promise<Blob | null> {
		if (!renderEngine || !c) return Promise.resolve(null);
		const background =
			typeof c.backgroundColor === "string" ? c.backgroundColor : "#ffffff";
		return renderEngine.createDraftThumbnailBlob(
			maxSize,
			quality,
			background || "#ffffff",
		);
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

	/**
	 * Batch-aware, and it has to be.
	 *
	 * This invalidates (see `RenderEngine.retainRegionsUntilRebaked`) — the name
	 * describes the intent, `markDirty` is the honest implementation. An
	 * invalidation is only invisible if the synchronous repair runs with it, and
	 * the engine deliberately skips that repair while `mutating`.
	 *
	 * History's transform undo/redo called this straight through, from INSIDE the
	 * burst: the footprints were marked unusable with the repair suppressed, and
	 * nothing repaired them afterwards either, so both the old and the new
	 * position sat on the low-res overview until the debounced async bake landed.
	 * That is the "undo/redo a move and it blurs" report. Joining the batch means
	 * the flush invalidates AND repairs, after `setMutating(false)`.
	 */
	function retainRegionsUntilRebaked(rects: readonly WorldRect[]) {
		if (!rects.length) return;
		if (isBatching()) {
			batchRetainedRemovalRects.push(...rects);
			return;
		}
		renderEngine?.retainRegionsUntilRebaked(rects);
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
		prepareFirstPaint,
		detach,
		renderMain: gestures.requestFrame,
		renderViewport: gestures.requestFrame,
		renderViewportNow: gestures.renderFrameNow,
		onGestureStart: gestures.start,
		onGestureEnd: gestures.end,
		onTransformStart: gestures.startTransform,
		onTransformEnd: gestures.endTransform,
		recordPanDelta: () => {},
		purgeBlockedObjects,
		query,
		queryAll: queryObjectsRaw,
		queryInteractive: queryInteractiveObjects,
		querySelectable: querySelectableObjects,
		invalidateLayer,
		objectIdsOnLayer,
		getZIndexMap,
		updateQuadTree,
		clipChanged,
		offsetQuadTree,
		getObjectBounds: objectBounds,
		getStaleObjectBounds: staleBounds,
		getVisibleObjects,
		getObjectById,
		getObjectsById,
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
		createDraftThumbnailBlob,
		rebuildSpatialIndex,
		scheduleRectPatch,
		scheduleObjectPatch,
		flushPatchesNow,
		isRegionBaked,
		setErasing: gestures.setErasing,
		dropRegion: gestures.dropRegion,
		dropRegionLight: gestures.dropRegionLight,
		dropRegionEraseUndo,
		setMutating: (on: boolean) => renderEngine?.setMutating(on),
		eraseStampCommit: gestures.commitEraseStamp,
		stampRegionBitmap: gestures.stampRegionBitmap,
		patchRectSync,
		retainRegionsUntilRebaked,
		withRetainedRemovalTiles,
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
