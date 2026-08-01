import type {
	BenchmarkMetric,
	FrameMetrics,
	MetricStatus,
	MetricUnit,
} from "@/draw/benchmark/benchmark.types";
import type { DrawMetricsSnapshot } from "@/draw/rendering/renderMetrics";

interface MetricDefinition {
	id: string;
	label: string;
	unit: MetricUnit;
	warningAbove: number;
	criticalAbove: number;
	summary: string;
	meaning: string;
	whenHigh: string;
	read(engine: DrawMetricsSnapshot, frames: FrameMetrics): number | null;
}

const phaseMax = (phase: string) => (engine: DrawMetricsSnapshot) =>
	engine.phaseMsMax[phase] ?? 0;

export const DRAW_METRIC_CATALOG: readonly MetricDefinition[] = [
	{
		id: "frameP95",
		label: "Frame time p95",
		unit: "ms",
		warningAbove: 20,
		criticalAbove: 33,
		summary: "How smooth the slowest common frames feel.",
		meaning: "95% of sampled animation frames completed within this time.",
		whenHigh: "Look for high composite, bake, overview, or long-task timing.",
		read: (_engine, frames) => (frames.samples ? frames.p95Ms : null),
	},
	{
		id: "slowFrameRate",
		label: "Slow frames",
		unit: "percent",
		warningAbove: 5,
		criticalAbove: 15,
		summary: "Share of frames taking more than 25 ms.",
		meaning:
			"A practical jank rate that works across 60 Hz and faster screens.",
		whenHigh:
			"Correlate with the largest main-thread phase and composite time.",
		read: (_engine, frames) =>
			frames.samples ? frames.slowFrameRate * 100 : null,
	},
	{
		id: "longTaskMax",
		label: "Longest main-thread block",
		unit: "ms",
		warningAbove: 50,
		criticalAbove: 100,
		summary: "The worst period where input could not be handled.",
		meaning: "Reported by the browser Long Tasks API when supported.",
		whenHigh: "Inspect local bake, overview build, and serialization flush.",
		read: (engine) => (engine.longTaskObserved ? engine.longTaskMsMax : null),
	},
	{
		id: "longFrameBlockingMax",
		label: "Long-frame blocking max",
		unit: "ms",
		warningAbove: 50,
		criticalAbove: 100,
		summary: "Worst blocking time inside a browser-attributed long frame.",
		meaning:
			"Long Animation Frames separates script, rendering, style/layout, input delay, and browser pauses.",
		whenHigh:
			"Inspect engine.longFrameScripts and the render, style/layout, and input-delay maxima.",
		read: (engine) =>
			engine.longAnimationFrameObserved
				? engine.longAnimationFrameBlockingMsMax
				: null,
	},
	{
		id: "compositeMax",
		label: "Composite max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 16,
		summary: "Worst frame spent assembling cached drawing tiles.",
		meaning: "Includes clearing, fallback search, and drawing visible tiles.",
		whenHigh:
			"Use tile draw and fallback search to identify the expensive part.",
		read: (engine) => engine.compositeMsMax,
	},
	{
		id: "tileDrawMax",
		label: "Tile drawing max",
		unit: "ms",
		warningAbove: 6,
		criticalAbove: 12,
		summary: "Worst time spent sending tile images to the canvas.",
		meaning: "Usually reflects GPU upload pressure or too many visible tiles.",
		whenHigh: "Check DPR, tile count, bitmap churn, and device GPU limits.",
		read: (engine) => engine.tileDrawMsMax,
	},
	{
		id: "tileMemoryPressure",
		label: "Tile memory pressure",
		unit: "percent",
		warningAbove: 85,
		criticalAbove: 98,
		summary: "Current tile memory compared with the engine's cache limit.",
		meaning:
			"High pressure causes eviction and repeated bitmap/GPU allocation.",
		whenHigh: "Check board spread, DPR, tile size, and cache churn.",
		read: (engine) =>
			engine.tileMemoryLimitMB ? engine.tileMemoryPressure * 100 : null,
	},
	{
		id: "visibleTiles",
		label: "Visible tiles max",
		unit: "tiles",
		warningAbove: 60,
		criticalAbove: 100,
		summary: "Largest number of tile images assembled in one composite.",
		meaning:
			"More visible tiles increase CPU draw calls and GPU upload pressure.",
		whenHigh:
			"Inspect viewport size, tile size, zoom tier, and fallback fragments.",
		read: (engine) => engine.compositeTilesMax,
	},
	{
		id: "searchMax",
		label: "Fallback search max",
		unit: "ms",
		warningAbove: 2,
		criticalAbove: 5,
		summary: "Worst time finding a usable tile from another zoom tier.",
		meaning:
			"Measures CPU lookup cost while active-tier tiles are unavailable.",
		whenHigh: "Inspect fallback depth and the number of uncovered cells.",
		read: (engine) => engine.searchMsMax,
	},
	{
		id: "localBakeMax",
		label: "Local bake max",
		unit: "ms",
		warningAbove: 16,
		criticalAbove: 40,
		summary: "Worst tile rasterized on the main thread.",
		meaning: "Heavy brushes or worker-refused tiles make this number rise.",
		whenHigh: "Check refusal reasons and objects in the heaviest tile.",
		read: phaseMax("localBake"),
	},
	{
		id: "overviewBuildMax",
		label: "Overview build max",
		unit: "ms",
		warningAbove: 50,
		criticalAbove: 120,
		summary: "Worst full rebuild of the zoomed-out drawing.",
		meaning: "This scales with scene complexity and overview resolution.",
		whenHigh:
			"Check scene spread, object complexity, and overview pixel budget.",
		read: phaseMax("overviewBuild"),
	},
	{
		id: "overviewPatchMax",
		label: "Overview patch max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst localized overview update after an edit.",
		meaning:
			"A patch should be small enough to fit comfortably within a frame.",
		whenHigh:
			"The edited region may contain too many or overly complex objects.",
		read: phaseMax("overviewPatch"),
	},
	{
		id: "eraseClipApplyMax",
		label: "Erase clip apply max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 16,
		summary: "Worst time adding one erase stroke to one object.",
		meaning: "Separates clip mutation cost from tile and overview rebuilding.",
		whenHigh: "Inspect target count, path complexity, and existing clip depth.",
		read: phaseMax("eraseClipApply"),
	},
	{
		id: "eraseClipUndoMax",
		label: "Erase clip undo max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 16,
		summary: "Worst time removing one erase stroke from one object.",
		meaning:
			"A high value usually means undo expanded or rebuilt a baked mask.",
		whenHigh: "Check whether an undoable stroke was flattened prematurely.",
		read: phaseMax("eraseClipUndo"),
	},
	{
		id: "eraseClipFlattenMax",
		label: "Erase mask flatten max",
		unit: "ms",
		warningAbove: 20,
		criticalAbove: 50,
		summary: "Worst bitmap compaction of an object's accumulated erase mask.",
		meaning:
			"Compaction bounds future clip rendering but is synchronous today.",
		whenHigh:
			"Lower mask resolution or move rasterization off the main thread.",
		read: phaseMax("eraseClipFlatten"),
	},
	{
		id: "eraseCleanupDispatchMax",
		label: "Erase cleanup dispatch max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary:
			"Worst main-thread setup before an erasure check reaches its worker.",
		meaning:
			"Measures object serialization and postMessage, but excludes worker rasterization.",
		whenHigh: "Reduce serialized clip data or reuse the worker's scene mirror.",
		read: phaseMax("eraseCleanupDispatch"),
	},
	{
		id: "eraseCleanupFinalizeMax",
		label: "Erase cleanup finalization max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst main-thread removal of fully erased objects.",
		meaning:
			"Includes canvas/index removal, coalesced invalidation, and attaching existing JSON to history.",
		whenHigh:
			"Chunk bulk removal further or inspect the canvas and spatial-index removal hooks.",
		read: phaseMax("eraseCleanupFinalize"),
	},
	{
		id: "lassoHitTestMax",
		label: "Lasso hit-test max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst lasso candidate and polygon-containment pass.",
		meaning:
			"Measures spatial lookup and precise shape checks, excluding overlay drawing.",
		whenHigh:
			"Reduce polygon detail or selected-shape sampling before changing the drawing renderer.",
		read: phaseMax("lassoHitTest"),
	},
	{
		id: "lassoOverlayMax",
		label: "Lasso overlay max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst frame spent drawing the lasso and selection highlights.",
		meaning:
			"Measures upper-canvas path and ghost rendering separately from object hit-testing.",
		whenHigh:
			"Reduce live highlight count or replace per-object ghost geometry with one merged overlay.",
		read: phaseMax("lassoOverlay"),
	},
	{
		id: "lassoSelectionCommitMax",
		label: "Lasso selection commit max",
		unit: "ms",
		warningAbove: 16,
		criticalAbove: 50,
		summary: "Worst synchronous conversion of lasso hits into a selection.",
		meaning:
			"Includes z-ordering, Fabric ActiveSelection construction, controls, and preview scheduling.",
		whenHigh:
			"Use a lightweight selection proxy when ActiveSelection construction dominates.",
		read: phaseMax("lassoSelectionCommit"),
	},
	{
		id: "selectionBakeMax",
		label: "Selection preview bake max",
		unit: "ms",
		warningAbove: 16,
		criticalAbove: 50,
		summary: "Worst bitmap preparation before moving a selection.",
		meaning:
			"Measures the main-thread compatibility path; large supported selections use the worker.",
		whenHigh:
			"Inspect worker eligibility and whether the selection was grabbed before prewarm completed.",
		read: phaseMax("selectionBake"),
	},
	{
		id: "selectionTransformCommitMax",
		label: "Selection move commit max",
		unit: "ms",
		warningAbove: 16,
		criticalAbove: 50,
		summary: "Worst mouse-up commit after moving or transforming a selection.",
		meaning:
			"Includes spatial-index refresh, old-region repair, bitmap stamping, and bake scheduling.",
		whenHigh:
			"Compare pure translations with scale or rotation, then inspect selected-object count.",
		read: phaseMax("selectionTransformCommit"),
	},
	{
		id: "selectionTransformLayoutMax",
		label: "Selection index update max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst spatial-index and worker-mirror update after a move.",
		meaning:
			"Pure translations retain quadtree placement unless an object crosses a spatial boundary.",
		whenHigh:
			"Check selected-object count and how many entries crossed node or chunk boundaries.",
		read: phaseMax("selectionTransformLayout"),
	},
	{
		id: "selectionTransformOldRegionMax",
		label: "Selection old-region repair max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst repair of the area vacated by a moved selection.",
		meaning:
			"Repairs a bounded number of visible tiles before background worker baking continues.",
		whenHigh:
			"Reduce synchronous repair admission or retain a temporary background snapshot.",
		read: phaseMax("selectionTransformOldRegion"),
	},
	{
		id: "selectionTransformStampMax",
		label: "Selection tile stamp max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst bitmap stamp into tiles at a selection's new position.",
		meaning: "Measures tile drawImage work and scheduling after a transform.",
		whenHigh:
			"Inspect moved-region size, active tier, and number of touched tiles.",
		read: phaseMax("selectionTransformStamp"),
	},
	{
		id: "historyTransformApplyMax",
		label: "Transform undo apply max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst main-thread application of one transform undo or redo.",
		meaning:
			"Measures object coordinates, spatial-index updates, mirror deltas, and invalidation setup.",
		whenHigh:
			"Check whether the action used the pure-translation fast path or required full transform recomputation.",
		read: phaseMax("historyTransformApply"),
	},
	{
		id: "historyTransformCaptureMax",
		label: "Transform history capture max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst history snapshot created when a transform ends.",
		meaning:
			"Measures selected-object state capture and undo-delta construction before the action is stored.",
		whenHigh:
			"Check whether a pure move used the shared translation delta or recomputed every absolute transform.",
		read: phaseMax("historyTransformCapture"),
	},
	{
		id: "historyBurstFlushMax",
		label: "History burst flush max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst coalesced invalidation after rapid undo or redo.",
		meaning:
			"This should now contain bookkeeping and worker scheduling, not tile or overview rasterization.",
		whenHigh:
			"Inspect rectangle merging, generation invalidation, and worker message preparation.",
		read: phaseMax("historyBurstFlush"),
	},
	{
		id: "flushMax",
		label: "Serialization flush max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst synchronous worker-mirror serialization block.",
		meaning:
			"Measures object-to-JSON work before data reaches the tile worker.",
		whenHigh: "Reduce flush size or serialization complexity.",
		read: (engine) => engine.flushMsMax,
	},
	{
		id: "draftThumbnailCopyMax",
		label: "Draft thumbnail copy max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst copy of the world overview into a 640px draft preview.",
		meaning:
			"Autosave reuses the engine's existing low-resolution overview instead of enlivening a second Fabric scene.",
		whenHigh:
			"Inspect overview dimensions and WebView canvas drawImage performance; object count should not affect this phase.",
		read: phaseMax("draftThumbnailCopy"),
	},
	{
		id: "draftSerializationMax",
		label: "Draft object serialization max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst single object converted to JSON during autosave.",
		meaning:
			"Autosave yields between objects, but one complex Fabric object cannot be interrupted while toJSON runs.",
		whenHigh:
			"Compact the named brush/object representation; reducing batch size cannot split one object.",
		read: phaseMax("documentSerializeObject"),
	},
	{
		id: "draftPersistDispatchMax",
		label: "Draft persist dispatch max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst synchronous IndexedDB draft write dispatch.",
		meaning:
			"Measures structured-clone work before IndexedDB accepts the save request.",
		whenHigh:
			"Confirm the worker returned an immutable JSON Blob instead of a string or nested object graph.",
		read: phaseMax("draftPersistDispatch"),
	},
	{
		id: "workerPrepMax",
		label: "Worker preparation max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 16,
		summary: "Worst main-thread preparation step before worker dispatch.",
		meaning:
			"Tracks query/sort, classification, serialization, and postMessage separately; this value is the largest of them.",
		whenHigh:
			"Inspect phaseMsMax.workerPrep* to identify which supposedly off-thread path is still blocking.",
		read: (engine) =>
			Math.max(
				phaseMax("workerPrepQuerySort")(engine),
				phaseMax("workerPrepClassify")(engine),
				phaseMax("workerPrepSerialize")(engine),
				phaseMax("workerPrepPost")(engine),
			),
	},
	{
		id: "workerResultMainMax",
		label: "Worker result main-thread max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst main-thread work after a worker result arrives.",
		meaning:
			"Includes response dispatch, tile cache admission, overview bitmap commit, and one unsupported overview overlay.",
		whenHigh:
			"Inspect phaseMsMax.workerResponseDispatch, workerResultCommit, overviewResultCommit, and overviewOverlayObject.",
		read: (engine) =>
			Math.max(
				phaseMax("workerResponseDispatch")(engine),
				phaseMax("workerResultCommit")(engine),
				phaseMax("overviewResultCommit")(engine),
				phaseMax("overviewOverlayObject")(engine),
			),
	},
	{
		id: "workerQueueWaitMax",
		label: "Worker queue wait max",
		unit: "ms",
		warningAbove: 100,
		criticalAbove: 500,
		summary: "Longest render request spent waiting behind earlier worker work.",
		meaning:
			"Separates worker congestion from actual Fabric enlivening and raster time.",
		whenHigh:
			"Reduce queued work, cancel obsolete requests sooner, or add another worker only after measuring contention.",
		read: (engine) =>
			engine.tilesRemote ? (engine.workerTimingMsMax.queueWaitMs ?? 0) : null,
	},
	{
		id: "workerRasterMax",
		label: "Worker raster max",
		unit: "ms",
		warningAbove: 100,
		criticalAbove: 500,
		summary: "Worst worker-side Fabric raster pass.",
		meaning:
			"Measures drawing time inside the worker without queueing or bitmap transfer.",
		whenHigh:
			"Inspect tile object density and brush complexity before changing worker count.",
		read: (engine) =>
			engine.tilesRemote ? (engine.workerTimingMsMax.rasterMs ?? 0) : null,
	},
	{
		id: "localFallbacks",
		label: "Local fallbacks",
		unit: "count",
		warningAbove: 0,
		criticalAbove: 20,
		summary: "Tiles that returned to full main-thread rasterization.",
		meaning:
			"Each fallback can negate the worker architecture during an interaction.",
		whenHigh:
			"Inspect localFallbackReasons and tileRefusals to find the exact escape path.",
		read: (engine) => engine.localFallbacks,
	},
	{
		id: "workerDeferrals",
		label: "Heavy local bakes deferred",
		unit: "count",
		warningAbove: 10,
		criticalAbove: 50,
		summary: "Worker misses deliberately kept off the main thread.",
		meaning:
			"These tiles temporarily retain overview or stale pixels instead of risking an input-blocking compatibility render.",
		whenHigh:
			"Inspect workerDeferralReasons; frequent refusal or z-order results identify the next worker capability to add.",
		read: (engine) => engine.workerDeferrals,
	},
	{
		id: "bakeMax",
		label: "Worker bake round-trip max",
		unit: "ms",
		warningAbove: 250,
		criticalAbove: 750,
		summary: "Slowest worker tile from dispatch to response.",
		meaning: "Includes queueing, worker rasterization, and message transfer.",
		whenHigh:
			"Compare mean vs max and inspect object count in the heaviest tile.",
		read: (engine) => (engine.tilesRemote ? engine.bakeMsMax : null),
	},
	{
		id: "refusalRate",
		label: "Worker refusal rate",
		unit: "percent",
		warningAbove: 15,
		criticalAbove: 40,
		summary: "Share of tile work that could not run fully in the worker.",
		meaning: "Rejected tiles fall back to main-thread or hybrid rendering.",
		whenHigh:
			"Inspect refusal reasons such as images, groups, text, or z-order.",
		read: (engine) =>
			engine.tilesRemote + engine.tilesRefused + engine.tilesFailed
				? engine.refusalRate * 100
				: null,
	},
	{
		id: "bakeryPauses",
		label: "Worker pauses",
		unit: "count",
		warningAbove: 0,
		criticalAbove: 0,
		summary: "Times worker rendering entered a cooldown.",
		meaning: "A healthy benchmark session should not pause the bakery.",
		whenHigh: "Inspect timeout and hard-error counts before tuning rendering.",
		read: (engine) => engine.bakeryPauses,
	},
	{
		id: "hardErrors",
		label: "Worker hard errors",
		unit: "count",
		warningAbove: 0,
		criticalAbove: 0,
		summary: "Structured worker failures.",
		meaning:
			"Any non-zero result indicates a correctness or compatibility bug.",
		whenHigh: "Capture the browser console and the exported benchmark report.",
		read: (engine) => engine.bakeHardErrors,
	},
];

function statusOf(
	value: number | null,
	warningAbove: number,
	criticalAbove: number,
): MetricStatus {
	if (value === null || !Number.isFinite(value)) return "unavailable";
	if (value > criticalAbove) return "critical";
	if (value > warningAbove) return "warning";
	return "good";
}

function format(value: number | null, unit: MetricUnit): string {
	if (value === null || !Number.isFinite(value)) return "Not available";
	const rounded = Math.round(value * 100) / 100;
	if (unit === "ms") return `${rounded} ms`;
	if (unit === "percent") return `${rounded}%`;
	return `${rounded}`;
}

export function describeMetricBudget(
	definition: (typeof DRAW_METRIC_CATALOG)[number],
): string {
	return `Healthy ≤ ${format(definition.warningAbove, definition.unit)}; critical > ${format(definition.criticalAbove, definition.unit)}`;
}

export function evaluateDrawMetrics(
	engine: DrawMetricsSnapshot,
	frames: FrameMetrics,
): BenchmarkMetric[] {
	return DRAW_METRIC_CATALOG.map((definition) => {
		const value = definition.read(engine, frames);
		return {
			id: definition.id,
			label: definition.label,
			value,
			formattedValue: format(value, definition.unit),
			status: statusOf(
				value,
				definition.warningAbove,
				definition.criticalAbove,
			),
			budget: describeMetricBudget(definition),
			summary: definition.summary,
			meaning: definition.meaning,
			whenHigh: definition.whenHigh,
		};
	});
}
