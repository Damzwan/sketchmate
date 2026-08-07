import type { BenchmarkReport } from "@/draw/benchmark/benchmark.types";
import {
	type FrameSampler,
	startFrameSampler,
} from "@/draw/benchmark/frameSampler";
import { evaluateDrawMetrics } from "@/draw/benchmark/metricCatalog";
import {
	resetDrawMetrics,
	snapshotDrawMetrics,
} from "@/draw/rendering/renderMetrics";

export interface BenchmarkSession {
	startedAt: number;
	finish(name?: string): BenchmarkReport;
}

export function startBenchmarkSession(): BenchmarkSession {
	resetDrawMetrics();
	const startedAt = Date.now();
	const frames: FrameSampler = startFrameSampler();
	let report: BenchmarkReport | null = null;

	return {
		startedAt,
		finish(name = "Manual drawing session") {
			if (report) return report;
			const frameMetrics = frames.stop();
			const engine = snapshotDrawMetrics();
			report = {
				version: 1,
				name,
				startedAt: new Date(startedAt).toISOString(),
				durationMs: Date.now() - startedAt,
				metrics: evaluateDrawMetrics(engine, frameMetrics),
				frames: frameMetrics,
				engine,
			};
			return report;
		},
	};
}
