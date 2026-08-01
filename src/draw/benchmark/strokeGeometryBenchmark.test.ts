import { describe, expect, it } from "vitest";
import {
	runEraserCloneGeometryBenchmark,
	runStrokeGeometryBenchmark,
} from "./strokeGeometryBenchmark";

describe("pencil stroke geometry benchmark", () => {
	it("shows the resident saving independently from serialized JSON size", () => {
		const result = runStrokeGeometryBenchmark(1_000);

		expect(result.commandCount).toBe(1_000);
		expect(result.coordinateCount).toBe(3_998);
		expect(result.compactPayloadBytes).toBe(16_992);
		expect(result.estimatedFabricResidentBytes).toBeGreaterThan(140_000);
		expect(result.estimatedCompactResidentBytes).toBeLessThan(18_000);
		expect(result.reductionPercent).toBeGreaterThan(85);
		// The save/sync payload remains a compressedTrace JSON document. It is a
		// different metric and is not expected to shrink in this change.
		expect(result.serializedJsonBytes).toBeGreaterThan(0);
	});

	it("shares one eraser geometry buffer across many target clip clones", () => {
		const result = runEraserCloneGeometryBenchmark(250, 100);

		expect(result.commandCount).toBe(250);
		expect(result.cloneCount).toBe(100);
		expect(result.sharedCloneCount).toBe(100);
		expect(result.sharedCompactGeometryBytes).toBeLessThan(5_000);
		expect(result.estimatedFabricGeometryBytes).toBeGreaterThan(3_500_000);
		expect(result.reductionPercent).toBeGreaterThan(99);
	});
});
