import { describe, expect, it } from "vitest";
import { summarizeFrameTimes } from "@/draw/benchmark/frameSampler";
import { runHeadlessBenchmark } from "@/draw/benchmark/headlessBenchmark";
import { evaluateDrawMetrics } from "@/draw/benchmark/metricCatalog";
import { createBenchmarkScene } from "@/draw/benchmark/sceneFactory";
import type { DrawMetricsSnapshot } from "@/draw/rendering/renderMetrics";

function emptyEngineMetrics(): DrawMetricsSnapshot {
	return {
		uptimeMs: 0,
		renderBackend: "main",
		bakeryPauses: 0,
		bakeryPauseReasons: {},
		bakeryDisabled: 0,
		bakeTimeouts: 0,
		bakeHardErrors: 0,
		bakeMissingRetries: 0,
		workerCancelRequests: 0,
		workerCancelAcks: 0,
		workerCancelLateResults: 0,
		workerCancelMsMax: 0,
		workerCancelMsMean: 0,
		workerProtocolVersion: 2,
		sceneCommits: 0,
		sceneDeltas: 0,
		workerQueueDepthMax: 0,
		workerRequestBytes: 0,
		workerResultBytes: 0,
		workerTimingMsMax: {},
		workerTimingMsMean: {},
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
		bakeMsMax: 0,
		bakeMsMean: 0,
		bakeObjectsMax: 0,
		refusalRate: 0,
		flushCount: 0,
		flushItems: 0,
		flushMsTotal: 0,
		flushMsMax: 0,
		compositeFrames: 0,
		compositeMsMax: 0,
		compositeMsMean: 0,
		tileDrawMsMax: 0,
		searchMsMax: 0,
		compositeTilesMax: 0,
		tileCacheCount: 0,
		tileCacheCountMax: 0,
		tileMemoryMB: 0,
		tileMemoryMBMax: 0,
		tileMemoryLimitMB: 100,
		tileMemoryPressure: 0,
		dirtyTiles: 0,
		inFlightTiles: 0,
		syncRepairDeclines: 0,
		syncRepairCostMax: 0,
		phaseMsTotal: {},
		phaseMsMax: {},
		phaseCount: {},
		longTasks: 0,
		longTaskMsTotal: 0,
		longTaskMsMax: 0,
		longTaskObserved: true,
		longAnimationFrames: 0,
		longAnimationFrameMsMax: 0,
		longAnimationFrameBlockingMsMax: 0,
		longAnimationFrameRenderMsMax: 0,
		longAnimationFrameStyleLayoutMsMax: 0,
		longAnimationFrameInputDelayMsMax: 0,
		longAnimationFrameObserved: false,
		longFrameScripts: [],
		device: {
			dpr: 1,
			renderDpr: 1,
			hardwareConcurrency: 8,
			deviceMemoryGB: 8,
			ua: "test",
		},
	};
}

describe("draw benchmark", () => {
	it("creates identical scenes from the same seed", () => {
		const first = createBenchmarkScene("mixed-lobby-2000");
		const second = createBenchmarkScene("mixed-lobby-2000");

		expect(first.objects).toHaveLength(2_000);
		expect(first.objects.map((object) => object.bounds)).toEqual(
			second.objects.map((object) => object.bounds),
		);
	});

	it("calculates stable frame percentiles without mutating input", () => {
		const samples = [16, 40, 17, 18, 16];
		const summary = summarizeFrameTimes(samples);

		expect(samples).toEqual([16, 40, 17, 18, 16]);
		expect(summary).toEqual({
			samples: 5,
			medianMs: 17,
			p95Ms: 40,
			maxMs: 40,
			slowFrames: 1,
			slowFrameRate: 0.2,
		});
	});

	it("turns raw counters into explained severity-ranked metrics", () => {
		const engine = emptyEngineMetrics();
		engine.compositeMsMax = 20;
		engine.bakeHardErrors = 1;
		engine.phaseMsMax.workerResponseDispatch = 4;
		engine.phaseMsMax.workerResultCommit = 12;
		engine.phaseMsMax.overviewResultCommit = 7;
		const metrics = evaluateDrawMetrics(engine, summarizeFrameTimes([16, 17]));

		expect(metrics.find((metric) => metric.id === "compositeMax")?.status).toBe(
			"critical",
		);
		expect(metrics.find((metric) => metric.id === "hardErrors")?.status).toBe(
			"critical",
		);
		expect(
			metrics.find((metric) => metric.id === "workerResultMainMax")?.value,
		).toBe(12);
		expect(metrics.every((metric) => metric.meaning.length > 0)).toBe(true);
	});

	it("runs reusable scenarios against the deterministic counting driver", async () => {
		const first = await runHeadlessBenchmark("pencil-500", "undo-redo-storm");
		const second = await runHeadlessBenchmark("pencil-500", "undo-redo-storm");

		expect(first).toEqual(second);
		expect(first.invalidations).toBe(40);
		expect(first.maxInvalidatedCellsPerEdit).toBeGreaterThan(0);
		expect(first.weightedObjectWork).toBeGreaterThan(0);
	});
});
