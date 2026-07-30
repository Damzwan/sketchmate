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
		meaning: "A practical jank rate that works across 60 Hz and faster screens.",
		whenHigh: "Correlate with the largest main-thread phase and composite time.",
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
		read: (engine) =>
			engine.longTaskObserved ? engine.longTaskMsMax : null,
	},
	{
		id: "compositeMax",
		label: "Composite max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 16,
		summary: "Worst frame spent assembling cached drawing tiles.",
		meaning: "Includes clearing, fallback search, and drawing visible tiles.",
		whenHigh: "Use tile draw and fallback search to identify the expensive part.",
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
		meaning: "High pressure causes eviction and repeated bitmap/GPU allocation.",
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
		meaning: "More visible tiles increase CPU draw calls and GPU upload pressure.",
		whenHigh: "Inspect viewport size, tile size, zoom tier, and fallback fragments.",
		read: (engine) => engine.compositeTilesMax,
	},
	{
		id: "searchMax",
		label: "Fallback search max",
		unit: "ms",
		warningAbove: 2,
		criticalAbove: 5,
		summary: "Worst time finding a usable tile from another zoom tier.",
		meaning: "Measures CPU lookup cost while active-tier tiles are unavailable.",
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
		whenHigh: "Check scene spread, object complexity, and overview pixel budget.",
		read: phaseMax("overviewBuild"),
	},
	{
		id: "overviewPatchMax",
		label: "Overview patch max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst localized overview update after an edit.",
		meaning: "A patch should be small enough to fit comfortably within a frame.",
		whenHigh: "The edited region may contain too many or overly complex objects.",
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
		meaning: "A high value usually means undo expanded or rebuilt a baked mask.",
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
		meaning: "Compaction bounds future clip rendering but is synchronous today.",
		whenHigh: "Lower mask resolution or move rasterization off the main thread.",
		read: phaseMax("eraseClipFlatten"),
	},
	{
		id: "flushMax",
		label: "Serialization flush max",
		unit: "ms",
		warningAbove: 8,
		criticalAbove: 20,
		summary: "Worst synchronous worker-mirror serialization block.",
		meaning: "Measures object-to-JSON work before data reaches the tile worker.",
		whenHigh: "Reduce flush size or serialization complexity.",
		read: (engine) => engine.flushMsMax,
	},
	{
		id: "bakeMax",
		label: "Worker bake round-trip max",
		unit: "ms",
		warningAbove: 250,
		criticalAbove: 750,
		summary: "Slowest worker tile from dispatch to response.",
		meaning: "Includes queueing, worker rasterization, and message transfer.",
		whenHigh: "Compare mean vs max and inspect object count in the heaviest tile.",
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
		whenHigh: "Inspect refusal reasons such as images, groups, text, or z-order.",
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
		meaning: "Any non-zero result indicates a correctness or compatibility bug.",
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
