// Lightweight, always-on counters for the draw engine's health. Exists because
// the 0.4.3 ANR / GPU-crash cluster could not be attributed: `__comp` is
// debug-only and console-scoped, so in production we had no idea whether the
// tile bakery was even alive on the devices that were failing.
//
// See docs/DRAW_ENGINE_PERF.md → "Instrumentation". The four numbers that
// actually decide the roadmap are all collected here:
//
//   1. bakeryPauses / bakeryDisabled  — is the worker dying in the field?
//   2. tileRefusals by reason         — how much work is the worker refusing?
//   3. flushMs p-max                  — is synchronous toJSON the main-thread cost?
//   4. longTasks                      — is the main thread blocked at all?
//
// Everything here is integer adds plus a couple of `performance.now()` pairs
// around blocks that already cost milliseconds, so collection is always on and
// effectively free. Only REPORTING is throttled.
//
// ONE exception: the per-OBJECT phases are SAMPLED. Those sit inside loops that
// run once per object per tile, around renders measured in microseconds, where
// the clock reads cost more than the work — see RENDER_OBJECT_SAMPLE_STRIDE.
//
// There is deliberately no network call in this file. The app has no analytics
// transport today; `setDrawMetricsSink` is the seam to wire one in later.

import type { DrawRenderBackend } from "@/draw/config/renderBackend.config";
import type { WorkerTiming } from "@/draw/rendering/bakery/protocol";
import { yieldLabelAt } from "@/draw/scheduling/yielder";

export type RefusalReason =
	| "text"
	| "image"
	| "imageClip"
	| "grouped"
	| "hidden"
	| "zorder"
	| "noId";

export type BakeryStopReason = "timeout" | "error";
export type LocalFallbackReason =
	| "worker-unavailable"
	| "backpressure"
	| "timeout"
	| "missing"
	| "refusal"
	| "z-order"
	| "hard-error"
	| "hybrid-overlay-failed";

export interface LongFrameScriptAttribution {
	frameDurationMs: number;
	durationMs: number;
	pauseMs: number;
	forcedStyleLayoutMs: number;
	functionName: string;
	source: string;
	sourceCharPosition: number;
	executionStartMs: number;
	invoker: string;
	invokerType: string;
	yieldLabel: string;
}

export type RenderObjectPhase =
	| "localBakeObject"
	| "overviewPatchObject"
	| "overviewBuildObject"
	| "overviewOverlayObject"
	| "overviewEraseObject";

/**
 * Shape of the slowest indivisible Fabric render seen in this session.
 * Deliberately excludes object ids and user content; only structural cost
 * signals are persisted to Sentry.
 */
export interface SlowRenderObject {
	phase: RenderObjectPhase;
	ms: number;
	type: string;
	pathCommands: number;
	groupChildren: number;
	clipChildren: number;
	hasClipPath: boolean;
	objectCaching: boolean;
}

export interface DrawMetricsSnapshot {
	/** ms since the metrics module was initialised. */
	uptimeMs: number;
	/** A/B cohort. Compare performance only between snapshots with this set. */
	renderBackend: DrawRenderBackend;

	// ── bakery health (finding F2) ─────────────────────────────────────────
	/** Times the worker was torn down and put on cooldown. Should be 0. */
	bakeryPauses: number;
	bakeryPauseReasons: Record<string, number>;
	/** 1 once the bakery gave up permanently for this session. Should be 0. */
	bakeryDisabled: number;
	/** Requests abandoned on timeout. Back-pressure, not a fault — but a
	 *  non-trivial rate means the worker cannot keep up on this device. */
	bakeTimeouts: number;
	/** Structured worker errors. Any non-zero value is a real bug. */
	bakeHardErrors: number;
	/** Tiles that came back `{ missing }` and needed a re-upsert + retry.
	 *  Elevated after a bakery re-arm (fresh worker = empty mirror). */
	bakeMissingRetries: number;
	/** In-flight worker requests abandoned because a gesture started. */
	workerCancelRequests: number;
	/** Cancelled requests the worker acknowledged before producing a result. */
	workerCancelAcks: number;
	/** Cancelled requests that still completed too late (usually with a bitmap). */
	workerCancelLateResults: number;
	/** Time from the gesture cancel signal until the worker replied. */
	workerCancelMsMax: number;
	workerCancelMsMean: number;
	workerProtocolVersion: number;
	sceneCommits: number;
	sceneDeltas: number;
	workerQueueDepthMax: number;
	workerRequestBytes: number;
	workerResultBytes: number;
	workerTimingMsMax: Record<string, number>;
	workerTimingMsMean: Record<string, number>;
	localFallbacks: number;
	localFallbackReasons: Record<string, number>;
	workerDeferrals: number;
	workerDeferralReasons: Record<string, number>;

	// ── worker utilisation (finding F3) ────────────────────────────────────
	/** Tiles the worker actually rendered. */
	tilesRemote: number;
	/** Subset of tilesRemote that also overlaid ≥1 skipped object on the main
	 *  thread (hybrid tiles, F3-C). `hybridSkippedTotal` / this = avg overlay
	 *  objects per hybrid tile. */
	tilesHybrid: number;
	hybridSkippedTotal: number;
	/** Tiles refused before dispatch → main-thread bake. */
	tilesRefused: number;
	/** Tiles dispatched but not returned (timeout / error / paused). */
	tilesFailed: number;
	tileRefusals: Record<string, number>;
	/** Worker round-trip for ONE tile bake: worst and mean, in ms. The number
	 *  that says whether a dense tile is genuinely slow or merely queued. */
	bakeMsMax: number;
	bakeMsMean: number;
	/** Objects in the heaviest tile dispatched — the cost driver behind bakeMs. */
	bakeObjectsMax: number;
	/** tilesRefused / (tilesRemote + tilesRefused + tilesFailed). The single
	 *  number that decides how much of F3 is worth building. */
	refusalRate: number;

	// ── main-thread serialization cost (finding F1) ────────────────────────
	flushCount: number;
	flushItems: number;
	flushMsTotal: number;
	/** Worst single synchronous flush block. This is the number F1 is about. */
	flushMsMax: number;

	// ── composite attribution: WHERE the switch-frame time goes ───────────
	//
	// The "it hitches right as the blur is replaced by tiles" report could not
	// be attributed from the outside: a composite is a clear + fill, an overview
	// drawImage, a fallback-tier search, and one drawImage per visible tile — and
	// the FIRST drawImage of a freshly-baked ImageBitmap also uploads it as a GPU
	// texture. Those have very different fixes, so they are timed separately.
	//   • tileDrawMsMax high  → GPU texture upload / fill rate (finding F5).
	//   • searchMsMax high    → findBestSource walking tiers per cell.
	//   • compositeMsMax high with both low → the clear+fill itself (DPR).
	compositeFrames: number;
	compositeMsMax: number;
	compositeMsMean: number;
	/** Worst time inside the tile drawImage loops alone. */
	tileDrawMsMax: number;
	/** Worst time in the fallback-tier search (findBestSource over all cells). */
	searchMsMax: number;
	/** Tiles drawn in the heaviest composite. */
	compositeTilesMax: number;
	/** Latest and peak tile-cache occupancy, excluding overview/pool reserves. */
	tileCacheCount: number;
	tileCacheCountMax: number;
	tileMemoryMB: number;
	tileMemoryMBMax: number;
	tileMemoryLimitMB: number;
	/** Current cache bytes / configured cache limit. */
	tileMemoryPressure: number;
	dirtyTiles: number;
	inFlightTiles: number;

	/**
	 * Synchronous repairs refused by the cost gate (see rendering/renderCost.ts),
	 * and the largest estimate seen.
	 *
	 * These are the numbers that calibrate `syncRenderCostBudget`. A decline rate
	 * near zero means the budget is too generous to be protecting anything; a
	 * high one with users reporting blurriness means it is too tight. Neither is
	 * knowable without field data, which is why they ship.
	 */
	syncRepairDeclines: number;
	syncRepairCostMax: number;

	// ── phase attribution: WHICH main-thread block is costing ─────────────
	//
	// Every entry here renders or serializes OBJECTS on the main thread, so each
	// one scales with per-object cost — which is why a watercolor board hurts and
	// the same board in pencil does not (a WaterColorStroke is ~3x the path
	// segments of a pencil stroke, stroked with round joins at `objectCaching =
	// false`). They have completely different fixes, so guessing between them
	// from the outside does not work. Read `phaseMsMax` first: that is the spike.
	//
	//   flushBake      — toJSON + structured clone inside a tile's bake prologue
	//   flushIdle      — the same, on the background drain
	//   localBake      — WALL CLOCK for a yielded local tile bake
	//   localBakeObject — one indivisible Fabric object render (ANR atom)
	//   localBakeTransfer — synchronous transferToImageBitmap / GPU flush
	//   localBakeCommit — synchronous cache admission + replacement
	//   overlaySkipped — hybrid tile: worker bitmap + main-thread objects on top
	//   overviewPatch  — WALL CLOCK for a yielded localized overview repair
	//   overviewPatchObject — one indivisible object render in that repair
	//   overviewPatchCommit — atomic clear + bitmap copy into the live overview
	//   overviewBuild  — full O(scene) overview render
	//   rebuildSync    — synchronous tile repair (destructiveInvalidate et al)
	//
	// SAMPLED: the per-OBJECT phases (`*Object`, `documentSerializeObject`) are
	// recorded for 1 in `RENDER_OBJECT_SAMPLE_STRIDE` renders — timing every one
	// cost more than the renders did. Read their `Total` and `Count` as a sample,
	// not a sum; `phaseMsMax` and `slowestRenderObject` remain meaningful.
	phaseMsTotal: Record<string, number>;
	phaseMsMax: Record<string, number>;
	phaseCount: Record<string, number>;
	/** Structural attribution for the worst single Fabric render. */
	slowestRenderObject: SlowRenderObject | null;

	// ── main thread blocked at all ─────────────────────────────────────────
	longTasks: number;
	/** Tasks at or above the near-ANR threshold. Counted directly, not inferred
	 * from the session maximum (two severe tasks need not set two new maxima). */
	longTasksSevere: number;
	longTaskMsTotal: number;
	longTaskMsMax: number;
	longTaskObserved: boolean;
	longAnimationFrames: number;
	longAnimationFrameMsMax: number;
	longAnimationFrameBlockingMsMax: number;
	longAnimationFrameRenderMsMax: number;
	longAnimationFrameStyleLayoutMsMax: number;
	longAnimationFrameInputDelayMsMax: number;
	longAnimationFrameObserved: boolean;
	longFrameScripts: LongFrameScriptAttribution[];

	// ── device context, to cross-reference against the crash cohort ────────
	device: {
		dpr: number;
		renderDpr: number;
		hardwareConcurrency: number;
		deviceMemoryGB: number | null;
		ua: string;
	};
}

interface Counters {
	bakeryPauses: number;
	bakeryPauseReasons: Record<string, number>;
	bakeryDisabled: number;
	bakeTimeouts: number;
	bakeHardErrors: number;
	bakeMissingRetries: number;
	workerCancelRequests: number;
	workerCancelAcks: number;
	workerCancelLateResults: number;
	workerCancelMsTotal: number;
	workerCancelMsMax: number;
	workerCancelMsCount: number;
	workerProtocolVersion: number;
	sceneCommits: number;
	sceneDeltas: number;
	workerQueueDepthMax: number;
	workerRequestBytes: number;
	workerResultBytes: number;
	workerTimingMsTotal: Record<string, number>;
	workerTimingMsMax: Record<string, number>;
	workerTimingCount: number;
	localFallbacks: number;
	localFallbackReasons: Record<string, number>;
	workerDeferrals: number;
	workerDeferralReasons: Record<string, number>;
	tilesRemote: number;
	tilesHybrid: number;
	hybridSkippedTotal: number;
	tilesRefused: number;
	tilesFailed: number;
	tileRefusals: Record<string, number>;
	bakeMsTotal: number;
	bakeMsMax: number;
	bakeMsCount: number;
	bakeObjectsMax: number;
	flushCount: number;
	flushItems: number;
	flushMsTotal: number;
	flushMsMax: number;
	compositeFrames: number;
	compositeMsTotal: number;
	compositeMsMax: number;
	tileDrawMsMax: number;
	searchMsMax: number;
	compositeTilesMax: number;
	tileCacheCount: number;
	tileCacheCountMax: number;
	tileMemoryBytes: number;
	tileMemoryBytesMax: number;
	tileMemoryLimitBytes: number;
	dirtyTiles: number;
	inFlightTiles: number;
	syncRepairDeclines: number;
	syncRepairCostMax: number;
	phaseMsTotal: Record<string, number>;
	phaseMsMax: Record<string, number>;
	phaseCount: Record<string, number>;
	slowestRenderObject: SlowRenderObject | null;
	longTasks: number;
	longTasksSevere: number;
	longTaskMsTotal: number;
	longTaskMsMax: number;
	longAnimationFrames: number;
	longAnimationFrameMsMax: number;
	longAnimationFrameBlockingMsMax: number;
	longAnimationFrameRenderMsMax: number;
	longAnimationFrameStyleLayoutMsMax: number;
	longAnimationFrameInputDelayMsMax: number;
	longFrameScripts: LongFrameScriptAttribution[];
}

/** Sub-millisecond composite numbers matter here, so don't round to integers. */
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}

function blank(): Counters {
	return {
		bakeryPauses: 0,
		bakeryPauseReasons: {},
		bakeryDisabled: 0,
		bakeTimeouts: 0,
		bakeHardErrors: 0,
		bakeMissingRetries: 0,
		workerCancelRequests: 0,
		workerCancelAcks: 0,
		workerCancelLateResults: 0,
		workerCancelMsTotal: 0,
		workerCancelMsMax: 0,
		workerCancelMsCount: 0,
		workerProtocolVersion: 1,
		sceneCommits: 0,
		sceneDeltas: 0,
		workerQueueDepthMax: 0,
		workerRequestBytes: 0,
		workerResultBytes: 0,
		workerTimingMsTotal: {},
		workerTimingMsMax: {},
		workerTimingCount: 0,
		localFallbacks: 0,
		localFallbackReasons: {},
		workerDeferrals: 0,
		workerDeferralReasons: {},
		tilesRemote: 0,
		tilesHybrid: 0,
		hybridSkippedTotal: 0,
		tilesRefused: 0,
		tilesFailed: 0,
		tileRefusals: {},
		bakeMsTotal: 0,
		bakeMsMax: 0,
		bakeMsCount: 0,
		bakeObjectsMax: 0,
		flushCount: 0,
		flushItems: 0,
		flushMsTotal: 0,
		flushMsMax: 0,
		compositeFrames: 0,
		compositeMsTotal: 0,
		compositeMsMax: 0,
		tileDrawMsMax: 0,
		searchMsMax: 0,
		compositeTilesMax: 0,
		tileCacheCount: 0,
		tileCacheCountMax: 0,
		tileMemoryBytes: 0,
		tileMemoryBytesMax: 0,
		tileMemoryLimitBytes: 0,
		dirtyTiles: 0,
		inFlightTiles: 0,
		syncRepairDeclines: 0,
		syncRepairCostMax: 0,
		phaseMsTotal: {},
		phaseMsMax: {},
		phaseCount: {},
		slowestRenderObject: null,
		longTasks: 0,
		longTasksSevere: 0,
		longTaskMsTotal: 0,
		longTaskMsMax: 0,
		longAnimationFrames: 0,
		longAnimationFrameMsMax: 0,
		longAnimationFrameBlockingMsMax: 0,
		longAnimationFrameRenderMsMax: 0,
		longAnimationFrameStyleLayoutMsMax: 0,
		longAnimationFrameInputDelayMsMax: 0,
		longFrameScripts: [],
	};
}

let m = blank();
let startedAt = Date.now();
let longTaskObserver: PerformanceObserver | null = null;
let longAnimationFrameObserver: PerformanceObserver | null = null;
let renderDprFn: () => number = () => 1;
let renderBackendFn: () => DrawRenderBackend = () => "main";

// ── recorders (hot path — keep these trivial) ────────────────────────────────

export function recordBakeryPause(reason: BakeryStopReason): void {
	m.bakeryPauses++;
	m.bakeryPauseReasons[reason] = (m.bakeryPauseReasons[reason] ?? 0) + 1;
}

export function recordBakeryDisabled(): void {
	m.bakeryDisabled = 1;
}

export function recordBakeTimeout(): void {
	m.bakeTimeouts++;
}

export function recordBakeHardError(): void {
	m.bakeHardErrors++;
}

export function recordBakeMissingRetry(): void {
	m.bakeMissingRetries++;
}

export function recordWorkerCancelRequests(count: number): void {
	m.workerCancelRequests += count;
}

export function recordWorkerCancelResult(ms: number, aborted: boolean): void {
	if (aborted) m.workerCancelAcks++;
	else m.workerCancelLateResults++;
	m.workerCancelMsTotal += ms;
	m.workerCancelMsCount++;
	if (ms > m.workerCancelMsMax) m.workerCancelMsMax = ms;
}

export function setWorkerProtocolVersion(version: number): void {
	m.workerProtocolVersion = version;
}

export function recordSceneCommit(deltas: number): void {
	m.sceneCommits++;
	m.sceneDeltas += deltas;
}

export function recordWorkerQueueDepth(depth: number): void {
	if (depth > m.workerQueueDepthMax) m.workerQueueDepthMax = depth;
}

export function recordWorkerMessage(
	requestBytes: number,
	resultBytes = 0,
): void {
	m.workerRequestBytes += Math.max(0, requestBytes);
	m.workerResultBytes += Math.max(0, resultBytes);
}

export function recordWorkerTiming(timing: WorkerTiming | undefined): void {
	if (!timing) return;
	m.workerTimingCount++;
	for (const [name, value] of Object.entries(timing)) {
		if (!Number.isFinite(value)) continue;
		m.workerTimingMsTotal[name] = (m.workerTimingMsTotal[name] ?? 0) + value;
		if (value > (m.workerTimingMsMax[name] ?? 0)) {
			m.workerTimingMsMax[name] = value;
		}
	}
}

export function recordLocalFallback(reason: LocalFallbackReason): void {
	m.localFallbacks++;
	m.localFallbackReasons[reason] = (m.localFallbackReasons[reason] ?? 0) + 1;
}

export function recordWorkerDeferral(reason: LocalFallbackReason): void {
	m.workerDeferrals++;
	m.workerDeferralReasons[reason] = (m.workerDeferralReasons[reason] ?? 0) + 1;
}

export function recordTileRemote(): void {
	m.tilesRemote++;
}

/**
 * The two bake counters, without building a full snapshot.
 *
 * `snapshotDrawMetrics()` allocates a large object with a dozen map copies — it
 * is a reporting call, not something to poll. The flatten hint needs exactly
 * these two numbers on a timer, so it reads them directly.
 *
 * `bakeObjectsMax` is the density signal (objects in the heaviest tile — the
 * cost driver); `bakeMsMean` is what that density actually costs on THIS device.
 */
export function drawBakePressure(): {
	bakeMsMean: number;
	bakeObjectsMax: number;
} {
	return {
		bakeMsMean: m.bakeMsCount ? m.bakeMsTotal / m.bakeMsCount : 0,
		bakeObjectsMax: m.bakeObjectsMax,
	};
}

/** One completed worker tile bake: round-trip ms and how many objects it held. */
export function recordBakeTiming(ms: number, objects: number): void {
	m.bakeMsTotal += ms;
	m.bakeMsCount++;
	if (ms > m.bakeMsMax) m.bakeMsMax = ms;
	if (objects > m.bakeObjectsMax) m.bakeObjectsMax = objects;
}

/** A hybrid tile: worker bitmap + `skippedCount` objects overlaid on main. */
export function recordTileHybrid(skippedCount: number): void {
	m.tilesHybrid++;
	m.hybridSkippedTotal += skippedCount;
}

export function recordTileFailed(): void {
	m.tilesFailed++;
}

export function recordTileRefused(reason: RefusalReason): void {
	m.tilesRefused++;
	m.tileRefusals[reason] = (m.tileRefusals[reason] ?? 0) + 1;
}

/** One synchronous mirror-sync block: `items` objects serialized + posted. */
export function recordFlush(ms: number, items: number): void {
	m.flushCount++;
	m.flushItems += items;
	m.flushMsTotal += ms;
	if (ms > m.flushMsMax) m.flushMsMax = ms;
}

/**
 * One composite pass. Called from CommittedLayer.composite on EVERY frame, so it
 * must stay integer adds — the three `performance.now()` pairs at the call site
 * are the entire cost, around blocks that already cost milliseconds.
 */
export function recordComposite(
	totalMs: number,
	tileDrawMs: number,
	searchMs: number,
	tiles: number,
	cacheCount = 0,
	cacheMemoryBytes = 0,
	cacheMemoryLimitBytes = 0,
	dirtyTiles = 0,
	inFlightTiles = 0,
): void {
	m.compositeFrames++;
	m.compositeMsTotal += totalMs;
	if (totalMs > m.compositeMsMax) m.compositeMsMax = totalMs;
	if (tileDrawMs > m.tileDrawMsMax) m.tileDrawMsMax = tileDrawMs;
	if (searchMs > m.searchMsMax) m.searchMsMax = searchMs;
	if (tiles > m.compositeTilesMax) m.compositeTilesMax = tiles;
	m.tileCacheCount = cacheCount;
	m.tileCacheCountMax = Math.max(m.tileCacheCountMax, cacheCount);
	m.tileMemoryBytes = cacheMemoryBytes;
	m.tileMemoryBytesMax = Math.max(m.tileMemoryBytesMax, cacheMemoryBytes);
	m.tileMemoryLimitBytes = cacheMemoryLimitBytes;
	m.dirtyTiles = dirtyTiles;
	m.inFlightTiles = inFlightTiles;
}

export type DrawPhase =
	| "flushBake"
	| "flushIdle"
	| "workerPrepQuerySort"
	| "workerPrepClassify"
	| "workerPrepSerialize"
	| "workerPrepPost"
	| "workerResponseDispatch"
	| "workerResultCommit"
	| "overviewResultCommit"
	| "overviewOverlayObject"
	| "localBake"
	| "localBakeObject"
	| "localBakeTransfer"
	| "localBakeCommit"
	| "overlaySkipped"
	| "overviewPatch"
	| "overviewPatchObject"
	| "overviewPatchCommit"
	| "overviewBuild"
	| "overviewBuildObject"
	| "overviewEraseObject"
	| "rebuildSync"
	| "eraseClipApply"
	| "eraseClipUndo"
	| "eraseClipFlatten"
	| "eraseCleanupDispatch"
	| "eraseCleanupFinalize"
	| "lassoHitTest"
	| "lassoOverlay"
	| "lassoSelectionCommit"
	| "lassoSelectionSort"
	| "lassoSelectionConstruct"
	| "lassoSelectionActivate"
	| "lassoSelectionControls"
	| "lassoSelectionPrewarm"
	| "selectionBake"
	| "selectionTransformCommit"
	| "selectionTransformLayout"
	| "selectionTransformOldRegion"
	| "selectionTransformStamp"
	| "historyTransformCapture"
	| "historyTransformApply"
	| "documentSerializeObject"
	| "thumbnailTransfer"
	| "draftThumbnailCopy"
	| "draftPersistDispatch"
	// WALL CLOCK, not CPU: both yield internally, so a big number means the work
	// spanned many frames, not that it blocked for that long. They exist to
	// attribute what the phase list above kept missing — `longTaskMsMax` has
	// repeatedly been several times larger than any measured phase, which means
	// the block was outside the instrumented set. Compare against `longTasks`.
	| "historyOp"
	| "historyBurstFlush"
	| "eraseCommit"
	| "erasedSweep";

/**
 * A synchronous repair was refused because its estimated cost exceeded the
 * device's `syncRenderCostBudget`. The work is not lost — the yielded async bake
 * owns it — so this counts a deliberate trade of sharpness for a frame.
 */
export function recordSyncRepairDeclined(cost: number): void {
	m.syncRepairDeclines++;
	if (cost > m.syncRepairCostMax) m.syncRepairCostMax = cost;
}

/**
 * The most recent instrumented block, kept as a rolling "what was the engine
 * doing" marker.
 *
 * An Android ANR is captured post-mortem from `ApplicationExitInfo`: the report
 * carries whatever scope was ALREADY persisted, so nothing written at error
 * time can reach it. This is deliberately updated on every phase so a crash
 * handler always has a current answer without paying for a subscription.
 */
let lastPhaseName: DrawPhase | "" = "";
let lastPhaseMs = 0;
let lastPhaseAt = 0;

export function lastDrawPhase(): {
	phase: string;
	ms: number;
	ageMs: number;
} {
	return {
		phase: lastPhaseName,
		ms: round2(lastPhaseMs),
		ageMs: lastPhaseAt ? Math.round(performance.now() - lastPhaseAt) : -1,
	};
}

/**
 * One synchronous main-thread block, attributed. Call sites wrap work that
 * already costs milliseconds, so the two `performance.now()` reads are free.
 */
export function recordPhase(phase: DrawPhase, ms: number): void {
	m.phaseMsTotal[phase] = (m.phaseMsTotal[phase] ?? 0) + ms;
	if (ms > (m.phaseMsMax[phase] ?? 0)) m.phaseMsMax[phase] = ms;
	m.phaseCount[phase] = (m.phaseCount[phase] ?? 0) + 1;
	// These phases deliberately span awaits/yields. Their totals describe job
	// latency, not one continuous main-thread block, so they must never be used
	// as the causal label for a late timer or long task.
	if (
		phase === "localBake" ||
		phase === "overviewPatch" ||
		phase === "overviewBuild" ||
		phase === "historyOp" ||
		phase === "historyBurstFlush" ||
		phase === "eraseCommit" ||
		phase === "erasedSweep"
	)
		return;
	lastPhaseName = phase;
	lastPhaseMs = ms;
	lastPhaseAt = performance.now();
}

/**
 * How often a per-OBJECT render is timed at all.
 *
 * The comment on `recordPhase` — "call sites wrap work that already costs
 * milliseconds, so the two `performance.now()` reads are free" — is true for
 * phases and false for objects. A per-object site pays THREE clock reads
 * (two at the call site, one for `lastPhaseAt`) plus three map updates around
 * a render that is frequently tens of microseconds, and it runs once per object
 * PER TILE: a dense board hands one tile a few thousand objects and a bake pass
 * covers ~40 of them. The overview build is worse — every object on the board,
 * in one pass. That is six figures of clock reads per pass, which is real money
 * on the low-end Android this instrumentation exists to protect.
 *
 * So sample. `phaseMsMax` and `slowestRenderObject` are the diagnostics that
 * matter here and both are extreme-value statistics: a stride still sees
 * thousands of objects per pass and finds the pathological ones. What it costs
 * is the per-object phase TOTALS, which become 1-in-N samples rather than sums
 * — noted on `phaseMsTotal` in the snapshot.
 *
 * Larger stride where the overhead hurts most and the object counts are
 * highest.
 */
const RENDER_OBJECT_SAMPLE_STRIDE =
	typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent)
		? 31
		: 7;

let renderObjectSampleCounter = 0;

/**
 * Should this object's render be timed? Counts across ALL per-object sites from
 * one shared counter, so the sample stays uniform whichever loop is running.
 *
 * Call it ONCE per object and reuse the answer for both the clock read and the
 * record, or the two will disagree.
 *
 * The stride is PRIME on purpose. Two sites interleaving in lockstep — a tile
 * bake and an overview build alternating — hit every other counter value, so an
 * even stride can be aliased away entirely and starve one site of samples
 * completely. A prime cannot be aliased by any smaller period.
 */
export function shouldTimeRenderObject(): boolean {
	return ++renderObjectSampleCounter % RENDER_OBJECT_SAMPLE_STRIDE === 0;
}

/**
 * Record one indivisible Fabric render and retain structural details only when
 * it becomes the session maximum. The hot path is therefore the same counter
 * updates plus one comparison; property inspection is rare and guarded.
 */
export function recordRenderObject(
	phase: RenderObjectPhase,
	ms: number,
	object: unknown,
): void {
	recordPhase(phase, ms);
	if (ms <= (m.slowestRenderObject?.ms ?? 0)) return;

	try {
		const candidate = object as any;
		const clip = candidate?.clipPath;
		m.slowestRenderObject = {
			phase,
			ms,
			type: String(
				candidate?.type ?? candidate?.constructor?.name ?? "unknown",
			).slice(0, 64),
			pathCommands: Array.isArray(candidate?.path) ? candidate.path.length : 0,
			groupChildren: Array.isArray(candidate?._objects)
				? candidate._objects.length
				: 0,
			clipChildren: Array.isArray(clip?._objects) ? clip._objects.length : 0,
			hasClipPath: Boolean(clip),
			objectCaching: candidate?.objectCaching === true,
		};
	} catch {
		m.slowestRenderObject = {
			phase,
			ms,
			type: "unknown",
			pathCommands: 0,
			groupChildren: 0,
			clipChildren: 0,
			hasClipPath: false,
			objectCaching: false,
		};
	}
}

function roundMap(src: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const k in src) out[k] = round2(src[k]);
	return out;
}

// ── snapshot / reset ─────────────────────────────────────────────────────────

export function snapshotDrawMetrics(): DrawMetricsSnapshot {
	const attempted = m.tilesRemote + m.tilesRefused + m.tilesFailed;
	const nav = typeof navigator !== "undefined" ? (navigator as any) : {};
	return {
		uptimeMs: Date.now() - startedAt,
		renderBackend: renderBackendFn(),
		bakeryPauses: m.bakeryPauses,
		bakeryPauseReasons: { ...m.bakeryPauseReasons },
		bakeryDisabled: m.bakeryDisabled,
		bakeTimeouts: m.bakeTimeouts,
		bakeHardErrors: m.bakeHardErrors,
		bakeMissingRetries: m.bakeMissingRetries,
		workerCancelRequests: m.workerCancelRequests,
		workerCancelAcks: m.workerCancelAcks,
		workerCancelLateResults: m.workerCancelLateResults,
		workerCancelMsMax: round2(m.workerCancelMsMax),
		workerCancelMsMean: m.workerCancelMsCount
			? round2(m.workerCancelMsTotal / m.workerCancelMsCount)
			: 0,
		workerProtocolVersion: m.workerProtocolVersion,
		sceneCommits: m.sceneCommits,
		sceneDeltas: m.sceneDeltas,
		workerQueueDepthMax: m.workerQueueDepthMax,
		workerRequestBytes: m.workerRequestBytes,
		workerResultBytes: m.workerResultBytes,
		workerTimingMsMax: roundMap(m.workerTimingMsMax),
		workerTimingMsMean: Object.fromEntries(
			Object.entries(m.workerTimingMsTotal).map(([name, total]) => [
				name,
				round2(total / Math.max(1, m.workerTimingCount)),
			]),
		),
		localFallbacks: m.localFallbacks,
		localFallbackReasons: { ...m.localFallbackReasons },
		workerDeferrals: m.workerDeferrals,
		workerDeferralReasons: { ...m.workerDeferralReasons },
		tilesRemote: m.tilesRemote,
		tilesHybrid: m.tilesHybrid,
		hybridSkippedTotal: m.hybridSkippedTotal,
		tilesRefused: m.tilesRefused,
		tilesFailed: m.tilesFailed,
		tileRefusals: { ...m.tileRefusals },
		refusalRate: attempted > 0 ? m.tilesRefused / attempted : 0,
		bakeMsMax: Math.round(m.bakeMsMax),
		bakeMsMean: m.bakeMsCount ? Math.round(m.bakeMsTotal / m.bakeMsCount) : 0,
		bakeObjectsMax: m.bakeObjectsMax,
		flushCount: m.flushCount,
		flushItems: m.flushItems,
		flushMsTotal: Math.round(m.flushMsTotal),
		flushMsMax: Math.round(m.flushMsMax),
		compositeFrames: m.compositeFrames,
		compositeMsMax: round2(m.compositeMsMax),
		compositeMsMean: m.compositeFrames
			? round2(m.compositeMsTotal / m.compositeFrames)
			: 0,
		tileDrawMsMax: round2(m.tileDrawMsMax),
		searchMsMax: round2(m.searchMsMax),
		compositeTilesMax: m.compositeTilesMax,
		tileCacheCount: m.tileCacheCount,
		tileCacheCountMax: m.tileCacheCountMax,
		tileMemoryMB: round2(m.tileMemoryBytes / 1024 / 1024),
		tileMemoryMBMax: round2(m.tileMemoryBytesMax / 1024 / 1024),
		tileMemoryLimitMB: round2(m.tileMemoryLimitBytes / 1024 / 1024),
		tileMemoryPressure: m.tileMemoryLimitBytes
			? round2(m.tileMemoryBytes / m.tileMemoryLimitBytes)
			: 0,
		dirtyTiles: m.dirtyTiles,
		inFlightTiles: m.inFlightTiles,
		syncRepairDeclines: m.syncRepairDeclines,
		syncRepairCostMax: Math.round(m.syncRepairCostMax),
		phaseMsTotal: roundMap(m.phaseMsTotal),
		phaseMsMax: roundMap(m.phaseMsMax),
		phaseCount: { ...m.phaseCount },
		slowestRenderObject: m.slowestRenderObject
			? { ...m.slowestRenderObject, ms: round2(m.slowestRenderObject.ms) }
			: null,
		longTasks: m.longTasks,
		longTasksSevere: m.longTasksSevere,
		longTaskMsTotal: Math.round(m.longTaskMsTotal),
		longTaskMsMax: Math.round(m.longTaskMsMax),
		longTaskObserved: longTaskObserver !== null,
		longAnimationFrames: m.longAnimationFrames,
		longAnimationFrameMsMax: round2(m.longAnimationFrameMsMax),
		longAnimationFrameBlockingMsMax: round2(m.longAnimationFrameBlockingMsMax),
		longAnimationFrameRenderMsMax: round2(m.longAnimationFrameRenderMsMax),
		longAnimationFrameStyleLayoutMsMax: round2(
			m.longAnimationFrameStyleLayoutMsMax,
		),
		longAnimationFrameInputDelayMsMax: round2(
			m.longAnimationFrameInputDelayMsMax,
		),
		longAnimationFrameObserved: longAnimationFrameObserver !== null,
		longFrameScripts: m.longFrameScripts.map((script) => ({ ...script })),
		device: {
			dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
			renderDpr: renderDprFn(),
			hardwareConcurrency: nav.hardwareConcurrency || 0,
			deviceMemoryGB: nav.deviceMemory ?? null,
			ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
		},
	};
}

export function resetDrawMetrics(): void {
	// A manual benchmark can reset counters while the draw observers stay active.
	// Drain anything already queued so it is not charged to the new interval.
	try {
		longTaskObserver?.takeRecords();
		longAnimationFrameObserver?.takeRecords();
	} catch {
		/* an observer shim may not implement takeRecords */
	}
	const workerProtocolVersion = m.workerProtocolVersion;
	m = blank();
	m.workerProtocolVersion = workerProtocolVersion;
	startedAt = Date.now();
	lastPhaseName = "";
	lastPhaseMs = 0;
	lastPhaseAt = 0;
	renderObjectSampleCounter = 0;
}

// ── reporting seam ───────────────────────────────────────────────────────────

type Sink = (snapshot: DrawMetricsSnapshot) => void;

let sink: Sink | null = null;
let sinkTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Wire a transport for these counters (analytics, log endpoint, socket — the
 * app has none today, hence the seam). The sink is called every `intervalMs`
 * with a cumulative snapshot, and once more on `pagehide`. It is NOT reset
 * between calls: send cumulative values and diff server-side, so a dropped
 * beacon loses nothing.
 */
export function setDrawMetricsSink(fn: Sink | null, intervalMs = 60_000): void {
	sink = fn;
	if (sinkTimer !== null) {
		clearInterval(sinkTimer);
		sinkTimer = null;
	}
	if (!fn) return;
	sinkTimer = setInterval(() => {
		try {
			fn(snapshotDrawMetrics());
		} catch {
			/* a broken sink must never break drawing */
		}
	}, intervalMs);
}

// ── long tasks ───────────────────────────────────────────────────────────────

/**
 * Count main-thread blocks over 50ms. This is the ground truth for "is the
 * main thread janking", independent of which subsystem caused it — and it is
 * the check that tells us whether removing the bake-path flush (F1) actually
 * moved anything.
 *
 * `longtask` is unsupported on some engines; failure is silent and
 * `longTaskObserved` reports whether the numbers are meaningful.
 */
/**
 * A long task at or above this gets reported individually, not just counted.
 *
 * 50 ms (the `longtask` threshold itself) is far too chatty to attach to a
 * crash report. 250 ms is the point where a block is a plausible contributor to
 * an input-dispatch timeout rather than ordinary jank.
 */
export const LONG_TASK_REPORT_MS = 250;

/** One task this long consumed most of Android's 5 s input timeout budget. */
export const SEVERE_LONG_TASK_MS = 2_000;

/** A completed phase older than this is context, not attribution. */
export const LONG_TASK_PHASE_MAX_AGE_MS = 1_000;

export interface LongTaskReport {
	durationMs: number;
	/** Phase that was running when the block started, if any. */
	phase: string;
	phaseMs: number;
	phaseAgeMs: number;
}

let longTaskSink: ((report: LongTaskReport) => void) | null = null;

/**
 * Report individual long tasks somewhere durable (a Sentry breadcrumb).
 *
 * Kept as a seam rather than importing Sentry here: this module is imported BY
 * the bakery and must stay free of app dependencies.
 */
export function setLongTaskSink(
	fn: ((report: LongTaskReport) => void) | null,
): void {
	longTaskSink = fn;
}

function startLongTaskObserver(): void {
	if (longTaskObserver) return;
	if (typeof PerformanceObserver === "undefined") return;
	try {
		const obs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				m.longTasks++;
				if (entry.duration >= SEVERE_LONG_TASK_MS) m.longTasksSevere++;
				m.longTaskMsTotal += entry.duration;
				if (entry.duration > m.longTaskMsMax) m.longTaskMsMax = entry.duration;
				if (longTaskSink && entry.duration >= LONG_TASK_REPORT_MS) {
					const phase = lastDrawPhase();
					const phaseIsRecent =
						phase.ageMs >= 0 && phase.ageMs <= LONG_TASK_PHASE_MAX_AGE_MS;
					try {
						longTaskSink({
							durationMs: Math.round(entry.duration),
							phase: phaseIsRecent ? phase.phase : "",
							phaseMs: phaseIsRecent ? phase.ms : 0,
							phaseAgeMs: phase.ageMs,
						});
					} catch {
						/* a broken sink must never break drawing */
					}
				}
			}
		});
		// Session policy must not ingest startup work that happened before the draw
		// engine was opened. In particular, a buffered auth/startup task must never
		// demote drawing quality on an otherwise healthy device.
		obs.observe({ type: "longtask" });
		longTaskObserver = obs;
	} catch {
		/* unsupported — counters stay 0, longTaskObserved stays false */
	}
}

function sourceLabel(sourceURL: string): string {
	if (!sourceURL) return "";
	try {
		return new URL(sourceURL, globalThis.location?.href).pathname;
	} catch {
		return sourceURL.slice(0, 160);
	}
}

function startLongAnimationFrameObserver(): void {
	if (longAnimationFrameObserver) return;
	if (typeof PerformanceObserver === "undefined") return;
	try {
		const observer = new PerformanceObserver((list) => {
			for (const rawEntry of list.getEntries()) {
				const entry = rawEntry as any;
				const frameEnd = entry.startTime + entry.duration;
				const renderMs =
					entry.renderStart > 0 ? Math.max(0, frameEnd - entry.renderStart) : 0;
				const styleLayoutMs =
					entry.styleAndLayoutStart > 0
						? Math.max(0, frameEnd - entry.styleAndLayoutStart)
						: 0;
				const inputDelayMs =
					entry.firstUIEventTimestamp > 0 && entry.renderStart > 0
						? Math.max(0, entry.renderStart - entry.firstUIEventTimestamp)
						: 0;

				m.longAnimationFrames++;
				m.longAnimationFrameMsMax = Math.max(
					m.longAnimationFrameMsMax,
					entry.duration ?? 0,
				);
				m.longAnimationFrameBlockingMsMax = Math.max(
					m.longAnimationFrameBlockingMsMax,
					entry.blockingDuration ?? 0,
				);
				m.longAnimationFrameRenderMsMax = Math.max(
					m.longAnimationFrameRenderMsMax,
					renderMs,
				);
				m.longAnimationFrameStyleLayoutMsMax = Math.max(
					m.longAnimationFrameStyleLayoutMsMax,
					styleLayoutMs,
				);
				m.longAnimationFrameInputDelayMsMax = Math.max(
					m.longAnimationFrameInputDelayMsMax,
					inputDelayMs,
				);

				for (const script of entry.scripts ?? []) {
					m.longFrameScripts.push({
						frameDurationMs: round2(entry.duration ?? 0),
						durationMs: round2(script.duration ?? 0),
						pauseMs: round2(script.pauseDuration ?? 0),
						forcedStyleLayoutMs: round2(
							script.forcedStyleAndLayoutDuration ?? 0,
						),
						functionName:
							script.sourceFunctionName || script.invoker || "(anonymous)",
						source: sourceLabel(script.sourceURL ?? ""),
						sourceCharPosition: script.sourceCharPosition ?? 0,
						executionStartMs: round2(script.executionStart ?? 0),
						invoker: script.invoker ?? "",
						invokerType: script.invokerType ?? "",
						yieldLabel: yieldLabelAt(script.executionStart ?? -1),
					});
				}
			}
			m.longFrameScripts.sort(
				(a, b) =>
					b.durationMs +
					b.pauseMs +
					b.forcedStyleLayoutMs -
					(a.durationMs + a.pauseMs + a.forcedStyleLayoutMs),
			);
			m.longFrameScripts.length = Math.min(8, m.longFrameScripts.length);
		});
		// A draw session must not ingest buffered auth/startup frames.
		observer.observe({ type: "long-animation-frame" } as any);
		longAnimationFrameObserver = observer;
	} catch {
		/* unsupported */
	}
}

export function stopDrawMetrics(): void {
	longTaskSink = null;
	longTaskObserver?.disconnect();
	longTaskObserver = null;
	longAnimationFrameObserver?.disconnect();
	longAnimationFrameObserver = null;
	if (sinkTimer !== null) {
		clearInterval(sinkTimer);
		sinkTimer = null;
	}
	sink = null;
}

/**
 * Called once from the object manager's `init`. Safe to call repeatedly.
 * `getRenderDpr` is injected rather than imported to keep this module free of
 * draw-engine dependencies (it is imported BY the bakery service).
 */
export function initDrawMetrics(
	getRenderDpr: () => number,
	getRenderBackend: () => DrawRenderBackend = () => "main",
): void {
	renderDprFn = getRenderDpr;
	renderBackendFn = getRenderBackend;
	startLongTaskObserver();
	startLongAnimationFrameObserver();
	// Console handle for local profiling and for asking a user to read a number
	// back during a support conversation.
	(globalThis as any).__drawPerf = snapshotDrawMetrics;
	if (typeof window !== "undefined" && !(window as any).__drawPerfBound) {
		(window as any).__drawPerfBound = true;
		window.addEventListener("pagehide", () => {
			try {
				sink?.(snapshotDrawMetrics());
			} catch {
				/* ignore */
			}
		});
	}
}
