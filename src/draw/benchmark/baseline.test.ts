import { describe, expect, it } from "vitest";
import type { BenchmarkScenarioId } from "@/draw/benchmark/benchScenarios";
import type { HeadlessBenchmarkResult } from "@/draw/benchmark/headlessBenchmark";
import { runHeadlessBenchmark } from "@/draw/benchmark/headlessBenchmark";
import type { BenchmarkSceneId } from "@/draw/benchmark/sceneFactory";
import baseline from "../../../bench/baseline/algorithmic.json";

const workloadMetrics: Array<keyof HeadlessBenchmarkResult> = [
	"totalInvalidatedCells",
	"maxInvalidatedCellsPerEdit",
	"objectsTouched",
	"weightedObjectWork",
];

describe("draw benchmark baseline", () => {
	for (const expected of baseline.results) {
		it(`${expected.scene} / ${expected.scenario}`, async () => {
			const actual = await runHeadlessBenchmark(
				expected.scene as BenchmarkSceneId,
				expected.scenario as BenchmarkScenarioId,
			);

			expect(actual.objectCount).toBe(expected.objectCount);
			expect(actual.operations).toBe(expected.operations);
			expect(actual.viewportChanges).toBe(expected.viewportChanges);
			expect(actual.invalidations).toBe(expected.invalidations);
			expect(actual.additions).toBe(expected.additions);

			const tolerance = 1 + baseline.allowedRegressionPercent / 100;
			for (const metric of workloadMetrics) {
				const limit = Math.ceil(Number(expected[metric]) * tolerance);
				expect(
					Number(actual[metric]),
					`${metric} exceeded baseline ${expected[metric]} by more than ${baseline.allowedRegressionPercent}%`,
				).toBeLessThanOrEqual(limit);
			}
		});
	}
});
