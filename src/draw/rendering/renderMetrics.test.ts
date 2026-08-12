import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	initDrawMetrics,
	lastDrawPhase,
	recordComposite,
	recordLocalFallback,
	recordPhase,
	recordRenderObject,
	recordSceneCommit,
	recordWorkerCancelRequests,
	recordWorkerCancelResult,
	recordWorkerDeferral,
	recordWorkerMessage,
	recordWorkerQueueDepth,
	recordWorkerTiming,
	resetDrawMetrics,
	setWorkerProtocolVersion,
	snapshotDrawMetrics,
	stopDrawMetrics,
} from "./renderMetrics";

describe("draw worker cancellation metrics", () => {
	beforeEach(() => resetDrawMetrics());

	it("separates acknowledged cancels from late worker results", () => {
		recordWorkerCancelRequests(2);
		recordWorkerCancelResult(12.345, true);
		recordWorkerCancelResult(3, false);

		const metrics = snapshotDrawMetrics();
		expect(metrics.workerCancelRequests).toBe(2);
		expect(metrics.workerCancelAcks).toBe(1);
		expect(metrics.workerCancelLateResults).toBe(1);
		expect(metrics.workerCancelMsMax).toBe(12.35);
		expect(metrics.workerCancelMsMean).toBe(7.67);
	});

	it("labels snapshots with the active render backend", () => {
		initDrawMetrics(
			() => 2,
			() => "main",
		);

		const metrics = snapshotDrawMetrics();
		expect(metrics.renderBackend).toBe("main");
		expect(metrics.device.renderDpr).toBe(2);
	});

	it("reports tile cache pressure without allocating diagnostics objects", () => {
		recordComposite(4, 2, 1, 24, 80, 60 * 1024 * 1024, 64 * 1024 * 1024, 8, 2);

		const metrics = snapshotDrawMetrics();
		expect(metrics.tileCacheCount).toBe(80);
		expect(metrics.tileMemoryMB).toBe(60);
		expect(metrics.tileMemoryLimitMB).toBe(64);
		expect(metrics.tileMemoryPressure).toBe(0.94);
		expect(metrics.dirtyTiles).toBe(8);
		expect(metrics.inFlightTiles).toBe(2);
	});

	it("attributes worker preparation, worker execution, and fallbacks", () => {
		setWorkerProtocolVersion(2);
		recordSceneCommit(4);
		recordWorkerQueueDepth(2);
		recordWorkerQueueDepth(1);
		recordWorkerMessage(512, 1024);
		recordPhase("workerPrepSerialize", 3.25);
		recordWorkerTiming({
			queueWaitMs: 6,
			indexQueryMs: 0,
			enlivenMs: 4,
			rasterMs: 12,
			bitmapTransferMs: 2,
		});
		recordLocalFallback("backpressure");
		recordWorkerDeferral("refusal");

		const metrics = snapshotDrawMetrics();
		expect(metrics.workerProtocolVersion).toBe(2);
		expect(metrics.sceneCommits).toBe(1);
		expect(metrics.sceneDeltas).toBe(4);
		expect(metrics.workerQueueDepthMax).toBe(2);
		expect(metrics.workerRequestBytes).toBe(512);
		expect(metrics.workerResultBytes).toBe(1024);
		expect(metrics.phaseMsMax.workerPrepSerialize).toBe(3.25);
		expect(metrics.workerTimingMsMax.rasterMs).toBe(12);
		expect(metrics.localFallbackReasons.backpressure).toBe(1);
		expect(metrics.workerDeferrals).toBe(1);
		expect(metrics.workerDeferralReasons.refusal).toBe(1);
	});

	it("keeps the active protocol label when a capture resets counters", () => {
		setWorkerProtocolVersion(2);
		resetDrawMetrics();

		expect(snapshotDrawMetrics().workerProtocolVersion).toBe(2);
	});

	it("does not attribute a stall to a yielded job's wall-clock duration", () => {
		recordPhase("localBakeObject", 75);
		recordPhase("localBake", 3_200);
		recordPhase("overviewPatch", 900);

		expect(lastDrawPhase()).toMatchObject({
			phase: "localBakeObject",
			ms: 75,
		});
		expect(snapshotDrawMetrics().phaseMsMax).toMatchObject({
			localBake: 3_200,
			overviewPatch: 900,
		});
	});

	it("keeps structural attribution for the slowest indivisible render", () => {
		recordRenderObject("localBakeObject", 41.234, {
			type: "path",
			path: [["M"], ["L"], ["L"]],
			clipPath: { _objects: [{}, {}] },
			objectCaching: false,
		});
		recordRenderObject("overviewPatchObject", 12, {
			type: "group",
			_objects: new Array(50),
		});

		expect(snapshotDrawMetrics().slowestRenderObject).toEqual({
			phase: "localBakeObject",
			ms: 41.23,
			type: "path",
			pathCommands: 3,
			groupChildren: 0,
			clipChildren: 2,
			hasClipPath: true,
			objectCaching: false,
		});
	});

	it("attributes long animation frames to script and browser rendering", () => {
		const observers: {
			callback: (list: { getEntries: () => any[] }) => void;
			type?: string;
		}[] = [];
		class FakePerformanceObserver {
			private readonly observer: (typeof observers)[number];

			constructor(callback: (list: { getEntries: () => any[] }) => void) {
				this.observer = { callback };
				observers.push(this.observer);
			}

			observe(options: { type: string }) {
				this.observer.type = options.type;
			}

			disconnect() {}
		}

		stopDrawMetrics();
		vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
		try {
			initDrawMetrics(() => 1);
			const observer = observers.find(
				(candidate) => candidate.type === "long-animation-frame",
			);
			expect(observer).toBeDefined();
			observer!.callback({
				getEntries: () => [
					{
						startTime: 100,
						duration: 180,
						blockingDuration: 125,
						renderStart: 240,
						styleAndLayoutStart: 260,
						firstUIEventTimestamp: 210,
						scripts: [
							{
								duration: 90,
								pauseDuration: 12,
								forcedStyleAndLayoutDuration: 8,
								sourceFunctionName: "commitSelection",
								sourceURL: "https://example.test/src/draw/tools/lassoTool.ts",
								sourceCharPosition: 321,
								executionStart: 222,
								invoker: "BUTTON.onclick",
								invokerType: "event-listener",
							},
						],
					},
				],
			});

			const metrics = snapshotDrawMetrics();
			expect(metrics.longAnimationFrameBlockingMsMax).toBe(125);
			expect(metrics.longAnimationFrameRenderMsMax).toBe(40);
			expect(metrics.longAnimationFrameStyleLayoutMsMax).toBe(20);
			expect(metrics.longAnimationFrameInputDelayMsMax).toBe(30);
			expect(metrics.longFrameScripts[0]).toMatchObject({
				functionName: "commitSelection",
				durationMs: 90,
				source: "/src/draw/tools/lassoTool.ts",
				sourceCharPosition: 321,
				executionStartMs: 222,
				invoker: "BUTTON.onclick",
				yieldLabel: "",
			});
		} finally {
			stopDrawMetrics();
			vi.unstubAllGlobals();
		}
	});
});
