import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	appStateCallback: null as ((state: { isActive: boolean }) => void) | null,
	captureMessage: vi.fn(),
	phase: { phase: "localBakeObject", ms: 42, ageMs: 10 },
}));

vi.mock("@sentry/capacitor", () => ({
	addBreadcrumb: vi.fn(),
	captureMessage: mocks.captureMessage,
	setContext: vi.fn(),
	setTag: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
	App: {
		addListener: vi.fn(
			(_event: string, callback: (state: { isActive: boolean }) => void) => {
				mocks.appStateCallback = callback;
				return Promise.resolve({ remove: vi.fn() });
			},
		),
	},
}));

vi.mock("@/draw/config/renderQuality.config", () => ({
	DRAW_DEVICE_MEMORY_GB: 2,
	DRAW_HARDWARE_CONCURRENCY: 2,
	getRenderDpr: () => 1.5,
	IS_LOW_END_DEVICE: true,
	IS_MOBILE_DEVICE: true,
	isRenderDprCapped: () => true,
}));

vi.mock("@/draw/rendering/renderMetrics", () => ({
	lastDrawPhase: () => mocks.phase,
	setDrawMetricsSink: vi.fn(),
	setLongTaskSink: vi.fn(),
	snapshotDrawMetrics: () => ({
		bakeryDisabled: 0,
		bakeryPauses: 0,
		compositeMsMax: 0,
		compositeMsMean: 0,
		dirtyTiles: 0,
		inFlightTiles: 0,
		localFallbacks: 0,
		longAnimationFrameBlockingMsMax: 0,
		longAnimationFrameMsMax: 0,
		longTaskMsMax: 0,
		longTaskObserved: true,
		longTasks: 0,
		phaseMsMax: {},
		refusalRate: 0,
		renderBackend: "main",
		tileCacheCount: 0,
		tileCacheCountMax: 0,
		tileDrawMsMax: 0,
		tileMemoryLimitMB: 16,
		tileMemoryMB: 0,
		tileMemoryMBMax: 0,
		tileMemoryPressure: 0,
		uptimeMs: 0,
	}),
}));

import {
	installDrawDiagnostics,
	uninstallDrawDiagnostics,
} from "./drawDiagnostics";

let now = 0;
let intervalCallback: (() => void) | null = null;
let visibility = "visible";
const documentListeners = new Set<() => void>();

function setVisibility(next: string): void {
	visibility = next;
	for (const listener of documentListeners) listener();
}

beforeEach(() => {
	now = 0;
	visibility = "visible";
	mocks.phase = { phase: "localBakeObject", ms: 42, ageMs: 10 };
	mocks.appStateCallback = null;
	intervalCallback = null;
	documentListeners.clear();
	mocks.captureMessage.mockClear();
	vi.spyOn(performance, "now").mockImplementation(() => now);
	vi.stubGlobal("setInterval", (callback: () => void) => {
		intervalCallback = callback;
		return 1 as any;
	});
	vi.stubGlobal("clearInterval", vi.fn());
	vi.stubGlobal("document", {
		get visibilityState() {
			return visibility;
		},
		addEventListener(type: string, listener: () => void) {
			if (type === "visibilitychange") documentListeners.add(listener);
		},
		removeEventListener(type: string, listener: () => void) {
			if (type === "visibilitychange") documentListeners.delete(listener);
		},
	});
});

afterEach(() => {
	uninstallDrawDiagnostics();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("draw stall diagnostics", () => {
	it("does not report a suspended interval immediately after app resume", () => {
		installDrawDiagnostics("main");
		now = 1_000;
		mocks.appStateCallback?.({ isActive: false });
		now = 900_000;
		mocks.appStateCallback?.({ isActive: true });
		now = 900_100;
		intervalCallback?.();

		expect(mocks.captureMessage).not.toHaveBeenCalled();
	});

	it("does not report a suspended interval immediately after visibility resume", () => {
		installDrawDiagnostics("main");
		now = 1_000;
		setVisibility("hidden");
		now = 900_000;
		setVisibility("visible");
		now = 900_100;
		intervalCallback?.();

		expect(mocks.captureMessage).not.toHaveBeenCalled();
	});

	it("reports a real foreground delay with a recent atomic phase", () => {
		installDrawDiagnostics("main");
		now = 2_100;
		intervalCallback?.();
		now = 6_101;
		intervalCallback?.();

		expect(mocks.captureMessage).toHaveBeenCalledWith(
			"Draw main-thread stall 3001ms near localBakeObject",
			expect.objectContaining({
				tags: { "draw.stallPhase": "localBakeObject" },
			}),
		);
	});

	it("does not blame a stale completed phase", () => {
		mocks.phase = { phase: "localBakeObject", ms: 42, ageMs: 5_000 };
		installDrawDiagnostics("main");
		now = 2_100;
		intervalCallback?.();
		now = 6_101;
		intervalCallback?.();

		expect(mocks.captureMessage).toHaveBeenCalledWith(
			"Draw main-thread stall 3001ms",
			expect.objectContaining({ tags: { "draw.stallPhase": "unknown" } }),
		);
	});
});
