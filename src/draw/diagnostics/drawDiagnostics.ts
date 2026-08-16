// drawDiagnostics.ts
//
// Makes the draw engine's health legible to Sentry, specifically for ANRs and
// native crashes — which is a different problem from ordinary JS error
// reporting and needs a different shape.
//
// WHY THIS EXISTS (see docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M8)
//
// Three facts drive every decision in this file:
//
//   1. An Android ANR is captured POST-MORTEM by the native SDK, out of
//      `ApplicationExitInfo`, on the NEXT app start. The report carries the
//      scope that was already PERSISTED when the process died. Anything a JS
//      error handler would attach is, by construction, too late — the JS
//      context is gone. So state must be written to the scope CONTINUOUSLY.
//   2. `browserTracingIntegration({ enableLongTask })` only emits spans inside
//      an active transaction, and prod runs `tracesSampleRate: 0.1`. Nine out
//      of ten sessions record nothing. BREADCRUMBS are unsampled and they ride
//      along into the ANR report, so that is what we use.
//   3. A `libGLESv2_adreno.so` / `libgsl.so` SIGSEGV is a NATIVE crash. No JS
//      hook can observe it. All we can do is make sure the scope it inherits
//      already says what the engine was doing.
//
// Everything here is off the render hot path: one interval, one observer sink
// and one stall timer. No allocation happens per frame or per tile.

import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import * as Sentry from "@sentry/capacitor";
import { DRAW_QUALITY_DEMOTION } from "@/draw/config/qualityDemotion";
import type { DrawRenderBackend } from "@/draw/config/renderBackend.config";
import {
	DRAW_DEVICE_MEMORY_GB,
	DRAW_HARDWARE_CONCURRENCY,
	getRenderDpr,
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
	IS_SEVERELY_CONSTRAINED_DEVICE,
	isRenderDprCapped,
} from "@/draw/config/renderQuality.config";
import { RASTER_SOFTWARE } from "@/draw/rendering/rasterSurface";
import {
	type DrawMetricsSnapshot,
	type LongTaskReport,
	lastDrawPhase,
	setDrawMetricsSink,
	setLongTaskSink,
	snapshotDrawMetrics,
} from "@/draw/rendering/renderMetrics";
import { deviceProfile } from "@/service/deviceProfile";

/**
 * How often the engine snapshot is written to the Sentry scope.
 *
 * This is the resolution of the post-mortem answer: an ANR report tells us what
 * the engine looked like up to this long before it died. 10 s is frequent
 * enough to be causal and rare enough to be free (one object build + one
 * `setContext`, no network).
 */
const CONTEXT_INTERVAL_MS = 10_000;

/**
 * Stall detector cadence and the lateness that counts as a stall.
 *
 * Android's input-dispatch ANR window is 5 s. A timer that should fire every
 * second and fires more than 3 s late means the main thread was blocked for at
 * least that long — i.e. we were most of the way to an ANR and survived. Those
 * near-misses are far more numerous than actual ANRs and they carry a live JS
 * stack context that a post-mortem native report never will.
 */
const STALL_TICK_MS = 1_000;
const STALL_THRESHOLD_MS = 3_000;

/**
 * Android resumes the WebView before all lifecycle/timer bookkeeping has
 * settled. A suspended interval can therefore run just after `visible` /
 * `isActive=true` and look several minutes late. Ignore that first wake-up;
 * real foreground stalls remain observable from the following tick onward.
 */
const STALL_RESUME_GRACE_MS = STALL_TICK_MS * 2;

/**
 * `lastDrawPhase` is a completed phase marker, not a stack sample. Once it is
 * older than this it is no longer evidence for the delayed timer's cause.
 */
const STALL_PHASE_MAX_AGE_MS = STALL_TICK_MS;

/** Don't spam the issue stream from one bad session. */
const MAX_STALL_REPORTS_PER_SESSION = 5;

let installed = false;
let stallTimer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let stallReports = 0;
let lifecycleHidden = false;
let resumedAt = 0;
let visibilityListener: (() => void) | null = null;
let appStateListener: PluginListenerHandle | null = null;

function safe(fn: () => void): void {
	try {
		fn();
	} catch {
		// Diagnostics must never be able to break drawing. A missing native SDK,
		// a Sentry client that failed to init, a scope that is not writable yet —
		// all of them land here and are correctly ignored.
	}
}

/**
 * The subset of the snapshot worth persisting on every event.
 *
 * NOT the whole thing. `snapshotDrawMetrics()` carries the UA string, the
 * `longFrameScripts` array and several worker maps that are dead weight in
 * `main` mode; contexts count against the event payload budget and an oversized
 * one gets truncated server-side — which would drop the fields that matter.
 */
function compactContext(s: DrawMetricsSnapshot): Record<string, unknown> {
	return {
		backend: s.renderBackend,
		uptimeS: Math.round(s.uptimeMs / 1000),

		// Memory: the OOM / SIGTRAP cohort.
		tileCount: s.tileCacheCount,
		tileCountMax: s.tileCacheCountMax,
		tileMB: s.tileMemoryMB,
		tileMBMax: s.tileMemoryMBMax,
		tileLimitMB: s.tileMemoryLimitMB,
		tilePressure: s.tileMemoryPressure,
		dirtyTiles: s.dirtyTiles,
		inFlightTiles: s.inFlightTiles,

		// Main-thread blocking: the ANR cohort.
		longTasks: s.longTasks,
		longTasksSevere: s.longTasksSevere,
		longTaskMsMax: s.longTaskMsMax,
		longTaskObserved: s.longTaskObserved,
		loafMsMax: s.longAnimationFrameMsMax,
		loafBlockingMsMax: s.longAnimationFrameBlockingMsMax,
		compositeMsMax: s.compositeMsMax,
		compositeMsMean: s.compositeMsMean,
		tileDrawMsMax: s.tileDrawMsMax,

		// Which block is costing. `phaseMsMax` alone answers most questions.
		phaseMsMax: s.phaseMsMax,
		lastPhase: lastDrawPhase(),
		slowestRenderObject: s.slowestRenderObject,

		// Only meaningful in `worker` mode; cheap to keep so the two cohorts stay
		// comparable if the backend is ever flipped by experiment.
		bakeryPauses: s.bakeryPauses,
		bakeryDisabled: s.bakeryDisabled,
		refusalRate: Math.round(s.refusalRate * 100) / 100,
		localFallbacks: s.localFallbacks,
	};
}

/**
 * Tags, not context: tags are indexed and searchable, so these are what let you
 * ask "is the ANR cohort DPR-3 Adreno specifically?" directly in the issue
 * search instead of opening events one at a time.
 *
 * Set once — none of them change during a session (`getRenderDpr` is cached on
 * purpose, see renderQuality.config).
 *
 * `draw.gpu` is the one that closes the loop with Play Console. Its ANR clusters
 * are named after the driver that stalled — `libIMGegl.so`, `libGLESv2_adreno`,
 * `libgsl` — and nothing else we record identifies the GPU, so until this tag
 * existed the two data sets could not be joined at all. `draw.gpu` is only
 * populated from the SECOND launch onwards (see service/deviceProfile.ts).
 */
function setStaticTags(backend: DrawRenderBackend): void {
	const rawDpr =
		typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
	const profile = deviceProfile();
	Sentry.setTag("draw.backend", backend);
	Sentry.setTag("draw.raster", RASTER_SOFTWARE ? "cpu" : "gpu");
	Sentry.setTag("draw.renderDpr", String(getRenderDpr()));
	Sentry.setTag("draw.rawDpr", String(rawDpr));
	Sentry.setTag("draw.dprCapped", String(isRenderDprCapped()));
	Sentry.setTag("draw.lowEnd", String(IS_LOW_END_DEVICE));
	Sentry.setTag("draw.severe", String(IS_SEVERELY_CONSTRAINED_DEVICE));
	Sentry.setTag("draw.mobile", String(IS_MOBILE_DEVICE));
	Sentry.setTag("draw.deviceMemoryGB", String(DRAW_DEVICE_MEMORY_GB));
	Sentry.setTag("draw.totalMemMB", String(profile.totalMemMB ?? "unknown"));
	Sentry.setTag("draw.cores", String(DRAW_HARDWARE_CONCURRENCY));
	Sentry.setTag("draw.qualityDemotion", String(DRAW_QUALITY_DEMOTION));
	Sentry.setTag("draw.gpu", profile.gpu ?? "unknown");
	Sentry.setTag("draw.gpuClass", profile.gpuClass);
	Sentry.setTag(
		"draw.lowRam",
		profile.lowRam === undefined ? "unknown" : String(profile.lowRam),
	);
	Sentry.setTag("draw.webViewPackage", profile.webViewPackage ?? "unknown");
	Sentry.setTag("draw.webViewVersion", profile.webViewVersion ?? "unknown");
}

function reportLongTask(report: LongTaskReport): void {
	safe(() => {
		Sentry.addBreadcrumb({
			category: "draw.longtask",
			level: report.durationMs >= 1_000 ? "warning" : "info",
			message: `${report.durationMs}ms block${report.phase ? ` near ${report.phase}` : ""}`,
			data: {
				durationMs: report.durationMs,
				phase: report.phase,
				phaseMs: report.phaseMs,
				phaseAgeMs: report.phaseAgeMs,
			},
		});
	});
}

function noteLifecycleState(hidden: boolean): void {
	lifecycleHidden = hidden;
	lastTick = performance.now();
	if (!hidden) resumedAt = lastTick;
}

function bindLifecycle(): void {
	if (typeof document !== "undefined") {
		visibilityListener = () =>
			noteLifecycleState(document.visibilityState === "hidden");
		document.addEventListener("visibilitychange", visibilityListener);
		noteLifecycleState(document.visibilityState === "hidden");
	} else {
		noteLifecycleState(false);
	}

	void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
		noteLifecycleState(!isActive);
	})
		.then((handle) => {
			if (installed) appStateListener = handle;
			else void handle.remove();
		})
		.catch(() => {
			/* web / unsupported platform — visibilitychange is sufficient */
		});
}

function unbindLifecycle(): void {
	if (visibilityListener && typeof document !== "undefined") {
		document.removeEventListener("visibilitychange", visibilityListener);
	}
	visibilityListener = null;
	void appStateListener?.remove();
	appStateListener = null;
}

/**
 * Backstop for the case where native ANR reporting turns out not to work at all
 * (unverified against the R8 release build at time of writing).
 *
 * A `setInterval` that fires late by more than the threshold could not have been
 * serviced, which means the main thread was busy for that long. Unlike the
 * native report this one knows WHICH engine phase was last running, so it
 * attributes the stall as well as detecting it.
 */
function startStallDetector(): void {
	if (stallTimer !== null) return;
	bindLifecycle();
	stallTimer = setInterval(() => {
		const now = performance.now();
		const late = now - lastTick - STALL_TICK_MS;
		lastTick = now;
		// A backgrounded WebView has its timers throttled or suspended outright,
		// so lateness there says nothing about main-thread health. Checking only
		// `visibilityState` here is insufficient: on resume it is already visible,
		// while this interval still carries the entire suspended duration.
		if (
			lifecycleHidden ||
			(typeof document !== "undefined" &&
				(document.visibilityState === "hidden" ||
					now - resumedAt < STALL_RESUME_GRACE_MS))
		)
			return;
		if (late < STALL_THRESHOLD_MS) return;
		if (stallReports >= MAX_STALL_REPORTS_PER_SESSION) return;
		stallReports++;
		const lastPhase = lastDrawPhase();
		const phase =
			lastPhase.ageMs >= 0 && lastPhase.ageMs <= STALL_PHASE_MAX_AGE_MS
				? lastPhase
				: { phase: "", ms: 0, ageMs: lastPhase.ageMs };
		safe(() => {
			Sentry.captureMessage(
				`Draw main-thread stall ${Math.round(late)}ms${phase.phase ? ` near ${phase.phase}` : ""}`,
				{
					level: "error",
					tags: { "draw.stallPhase": phase.phase || "unknown" },
					contexts: {
						drawStall: {
							lateMs: Math.round(late),
							phase: phase.phase,
							phaseMs: phase.ms,
							phaseAgeMs: phase.ageMs,
						},
					},
				} as any,
			);
		});
	}, STALL_TICK_MS);
}

/**
 * Wire the draw engine into Sentry. Called from the object manager's `init`,
 * i.e. once per canvas. Safe to call repeatedly.
 */
export function installDrawDiagnostics(backend: DrawRenderBackend): void {
	if (installed) return;
	installed = true;
	stallReports = 0;

	safe(() => setStaticTags(backend));

	// Continuous scope persistence — the whole point (fact 1 above). The sink
	// also fires once on `pagehide`, which is the last chance to record a session
	// that is about to be killed.
	setDrawMetricsSink((snapshot) => {
		safe(() => Sentry.setContext("draw", compactContext(snapshot)));
	}, CONTEXT_INTERVAL_MS);
	// Write one immediately so an early crash is not reported with no context.
	safe(() => Sentry.setContext("draw", compactContext(snapshotDrawMetrics())));

	setLongTaskSink(reportLongTask);
	startStallDetector();
}

/** Canvas teardown. Leaves the last context on the scope deliberately: a crash
 *  during or just after teardown should still say what the engine was doing. */
export function uninstallDrawDiagnostics(): void {
	if (!installed) return;
	installed = false;
	setLongTaskSink(null);
	setDrawMetricsSink(null);
	if (stallTimer !== null) {
		clearInterval(stallTimer);
		stallTimer = null;
	}
	unbindLifecycle();
	lifecycleHidden = false;
	resumedAt = 0;
	lastTick = 0;
}
