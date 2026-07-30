import {
	resetDrawMetrics,
	snapshotDrawMetrics,
} from "@/draw/rendering/renderMetrics";
import {
	startFrameSampler,
	type FrameSampler,
} from "@/draw/benchmark/frameSampler";
import { evaluateDrawMetrics } from "@/draw/benchmark/metricCatalog";
import type { BenchmarkReport } from "@/draw/benchmark/benchmark.types";

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
