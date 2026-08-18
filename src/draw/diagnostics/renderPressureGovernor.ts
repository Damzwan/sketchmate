// renderPressureGovernor.ts
//
// Watches how badly this session is actually going, sheds what is cheap to shed
// now, and records a demotion so the NEXT session starts smaller.
//
// WHY IT EXISTS
//
// Every automatic quality decision in the engine — render DPR and tile budget
// — is made once, at start-up, from a device class inferred from
// `hardwareConcurrency`, `deviceMemory`, the GPU string and Android's
// `isLowRamDevice()`. That covers the hardware we can name. It does not cover a
// mid-range phone with a hot battery, a 400-object drawing, three other apps
// resident, or a GPU family nobody has written a rule for yet — and those
// sessions are a real part of the ANR volume.
//
// WHY IT DOES SO LITTLE, ON PURPOSE
//
// The tempting response to "frames are late" is to drop the render scale
// immediately. The engine cannot: the render DPR is load-bearing for fabric's
// backing store, hit-testing, bucket-fill pixel reads and the eraser's clip rect
// all at once, and changing it means resizing every canvas and re-baking every
// tile — the most expensive operation available, run at the exact moment the
// device is least able to afford it. See qualityDemotion.ts.
//
// So the within-session action is limited to work that is cheap and immediately
// helpful (give tile memory back, which is GPU texture memory), and the real
// adjustment is persisted for the next launch.
//
// WHAT COUNTS AS PRESSURE
//
// Main-thread stalls, not frame rate. A slow frame is a bad experience; a
// multi-second block is what Android's input dispatcher measures, and it is the
// same quantity that turns into "Input dispatching timed out". The signal is
// deliberately the one the ANR is defined in terms of.

import * as Sentry from "@sentry/capacitor";
import {
	DRAW_QUALITY_DEMOTION,
	MAX_QUALITY_DEMOTION,
	type QualityDemotionLevel,
	raiseQualityDemotion,
} from "@/draw/config/qualityDemotion";
import { snapshotDrawMetrics } from "@/draw/rendering/renderMetrics";

/**
 * How often the governor looks. Long: this is a trend detector, and the thing
 * it is detecting blocks the very timer that would sample it more finely.
 */
const SAMPLE_INTERVAL_MS = 15_000;

const SEVERE_BLOCKS_FOR_DEMOTION = 2;

/**
 * Sustained lesser blocking. `longTaskMsTotal` counts every task over 50 ms, so
 * this is "a tenth of the session was spent in blocks a user can feel", which
 * is a different failure from one catastrophic stall and deserves its own trigger.
 */
const BLOCKING_FRACTION_FOR_DEMOTION = 0.1;
/** Below this the fraction is noise — a short session amplifies one bad bake. */
const MIN_UPTIME_FOR_FRACTION_MS = 120_000;

export interface RenderPressureHandlers {
	/**
	 * Give back what is reconstructable, now. Called at most once per pressure
	 * escalation, never per sample.
	 */
	shed: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let handlers: RenderPressureHandlers | null = null;
let shedThisSession = false;
let reportedLevel: QualityDemotionLevel = DRAW_QUALITY_DEMOTION;

function safe(fn: () => void): void {
	try {
		fn();
	} catch {
		// The governor exists to protect a struggling session. It must never be
		// the thing that breaks one.
	}
}

/**
 * Pure decision, exported for tests: how far should a session showing these
 * numbers demote the device?
 *
 * Returns the level to raise TO, or the current level when nothing is wrong.
 * Never returns a lower level — recovery is by expiry (see qualityDemotion.ts),
 * not by a quiet stretch inside a bad session.
 */
export function decideDemotion(sample: {
	longTaskMsMax: number;
	longTaskMsTotal: number;
	uptimeMs: number;
	severeBlocks: number;
	current: QualityDemotionLevel;
}): QualityDemotionLevel {
	const { severeBlocks, longTaskMsTotal, uptimeMs, current } = sample;

	const severe = severeBlocks >= SEVERE_BLOCKS_FOR_DEMOTION;
	const sustained =
		uptimeMs >= MIN_UPTIME_FOR_FRACTION_MS &&
		longTaskMsTotal / uptimeMs >= BLOCKING_FRACTION_FOR_DEMOTION;

	if (!severe && !sustained) return current;
	// Both signals at once, or an already-demoted device that is STILL blocking,
	// means the next tier down is the right answer rather than one step.
	if ((severe && sustained) || current >= 1) return MAX_QUALITY_DEMOTION;
	return 1;
}

function sample(): void {
	if (!handlers) return;
	const s = snapshotDrawMetrics();
	const severeBlocks = s.longTasksSevere;

	const next = decideDemotion({
		longTaskMsMax: s.longTaskMsMax,
		longTaskMsTotal: s.longTaskMsTotal,
		uptimeMs: s.uptimeMs,
		severeBlocks,
		current: reportedLevel,
	});
	if (next <= reportedLevel) return;

	// Cheap, immediate, and the right direction for both failure modes: retained
	// tile surfaces consume native/graphics memory and can become texture upload
	// traffic, so a smaller cache reduces pressure without resizing the canvas.
	if (!shedThisSession) {
		shedThisSession = true;
		safe(() => handlers?.shed());
	}

	const stored = raiseQualityDemotion(next);
	reportedLevel = stored;

	safe(() => {
		Sentry.addBreadcrumb({
			category: "draw.pressure",
			level: "warning",
			message: `quality demoted to ${stored}`,
			data: {
				severeBlocks,
				longTaskMsMax: Math.round(s.longTaskMsMax),
				longTaskMsTotal: Math.round(s.longTaskMsTotal),
				uptimeS: Math.round(s.uptimeMs / 1000),
				tileMB: s.tileMemoryMB,
			},
		});
		Sentry.setTag("draw.qualityDemotion", String(stored));
	});
}

export function installRenderPressureGovernor(
	next: RenderPressureHandlers,
): void {
	handlers = next;
	if (timer !== null) return;
	timer = setInterval(sample, SAMPLE_INTERVAL_MS);
}

export function uninstallRenderPressureGovernor(): void {
	if (timer !== null) clearInterval(timer);
	timer = null;
	handlers = null;
	shedThisSession = false;
	reportedLevel = DRAW_QUALITY_DEMOTION;
}
