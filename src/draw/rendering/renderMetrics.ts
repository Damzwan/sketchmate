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
// around blocks that already cost milliseconds, so there is no sampling gate —
// collection is always on and effectively free. Only REPORTING is throttled.
//
// There is deliberately no network call in this file. The app has no analytics
// transport today; `setDrawMetricsSink` is the seam to wire one in later.

import type { DrawRenderBackend } from "@/draw/config/renderBackend.config";

export type RefusalReason =
	| "text"
	| "image"
	| "imageClip"
	| "grouped"
	| "hidden"
	| "zorder"
	| "noId";

export type BakeryStopReason = "timeout" | "error";

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
	//   localBake      — a tile the worker refused → full main-thread render
	//   overlaySkipped — hybrid tile: worker bitmap + main-thread objects on top
	//   overviewPatch  — patchRect: clear + redraw a region of the overview
	//   overviewBuild  — full O(scene) overview render
	//   rebuildSync    — synchronous tile repair (destructiveInvalidate et al)
	phaseMsTotal: Record<string, number>;
	phaseMsMax: Record<string, number>;
	phaseCount: Record<string, number>;

	// ── main thread blocked at all ─────────────────────────────────────────
	longTasks: number;
	longTaskMsTotal: number;
	longTaskMsMax: number;
	longTaskObserved: boolean;

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
	phaseMsTotal: Record<string, number>;
	phaseMsMax: Record<string, number>;
	phaseCount: Record<string, number>;
	longTasks: number;
	longTaskMsTotal: number;
	longTaskMsMax: number;
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
		phaseMsTotal: {},
		phaseMsMax: {},
		phaseCount: {},
		longTasks: 0,
		longTaskMsTotal: 0,
		longTaskMsMax: 0,
	};
}

let m = blank();
let startedAt = Date.now();
let longTaskObserver: PerformanceObserver | null = null;
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

export function recordTileRemote(): void {
	m.tilesRemote++;
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
): void {
	m.compositeFrames++;
	m.compositeMsTotal += totalMs;
	if (totalMs > m.compositeMsMax) m.compositeMsMax = totalMs;
	if (tileDrawMs > m.tileDrawMsMax) m.tileDrawMsMax = tileDrawMs;
	if (searchMs > m.searchMsMax) m.searchMsMax = searchMs;
	if (tiles > m.compositeTilesMax) m.compositeTilesMax = tiles;
}

export type DrawPhase =
	| "flushBake"
	| "flushIdle"
	| "localBake"
	| "overlaySkipped"
	| "overviewPatch"
	| "overviewBuild"
	| "rebuildSync";

/**
 * One synchronous main-thread block, attributed. Call sites wrap work that
 * already costs milliseconds, so the two `performance.now()` reads are free.
 */
export function recordPhase(phase: DrawPhase, ms: number): void {
	m.phaseMsTotal[phase] = (m.phaseMsTotal[phase] ?? 0) + ms;
	if (ms > (m.phaseMsMax[phase] ?? 0)) m.phaseMsMax[phase] = ms;
	m.phaseCount[phase] = (m.phaseCount[phase] ?? 0) + 1;
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
		phaseMsTotal: roundMap(m.phaseMsTotal),
		phaseMsMax: roundMap(m.phaseMsMax),
		phaseCount: { ...m.phaseCount },
		longTasks: m.longTasks,
		longTaskMsTotal: Math.round(m.longTaskMsTotal),
		longTaskMsMax: Math.round(m.longTaskMsMax),
		longTaskObserved: longTaskObserver !== null,
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
	m = blank();
	startedAt = Date.now();
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
function startLongTaskObserver(): void {
	if (longTaskObserver) return;
	if (typeof PerformanceObserver === "undefined") return;
	try {
		const obs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				m.longTasks++;
				m.longTaskMsTotal += entry.duration;
				if (entry.duration > m.longTaskMsMax) m.longTaskMsMax = entry.duration;
			}
		});
		obs.observe({ type: "longtask", buffered: true });
		longTaskObserver = obs;
	} catch {
		/* unsupported — counters stay 0, longTaskObserved stays false */
	}
}

export function stopDrawMetrics(): void {
	longTaskObserver?.disconnect();
	longTaskObserver = null;
	if (sinkTimer !== null) {
		clearInterval(sinkTimer);
		sinkTimer = null;
	}
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
