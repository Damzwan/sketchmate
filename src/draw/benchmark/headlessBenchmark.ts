import {
	type BenchmarkDriver,
	type BenchmarkScenarioId,
	runBenchmarkScenario,
} from "@/draw/benchmark/benchScenarios";
import {
	type BenchmarkScene,
	type BenchmarkSceneId,
	createBenchmarkScene,
} from "@/draw/benchmark/sceneFactory";
import type { WorldRect } from "@/draw/rendering/committedLayer";
import { DEFAULT_ZOOM_TIERS } from "@/draw/rendering/zoomLevels";

export interface HeadlessBenchmarkResult {
	scene: BenchmarkSceneId;
	scenario: BenchmarkScenarioId;
	objectCount: number;
	operations: number;
	viewportChanges: number;
	invalidations: number;
	additions: number;
	totalInvalidatedCells: number;
	maxInvalidatedCellsPerEdit: number;
	objectsTouched: number;
	weightedObjectWork: number;
}

function intersects(a: WorldRect, b: WorldRect): boolean {
	return !(
		a.x + a.w < b.x ||
		a.x > b.x + b.w ||
		a.y + a.h < b.y ||
		a.y > b.y + b.h
	);
}

function cellsAcrossTiers(rect: WorldRect, tileSize = 512): number {
	let cells = 0;
	for (const scale of DEFAULT_ZOOM_TIERS) {
		const worldSize = tileSize / scale;
		const x0 = Math.floor(rect.x / worldSize);
		const y0 = Math.floor(rect.y / worldSize);
		const x1 = Math.floor((rect.x + rect.w) / worldSize);
		const y1 = Math.floor((rect.y + rect.h) / worldSize);
		cells += (x1 - x0 + 1) * (y1 - y0 + 1);
	}
	return cells;
}

function createCountingDriver(
	scene: BenchmarkScene,
	result: HeadlessBenchmarkResult,
): BenchmarkDriver {
	const measureEdit = (rect: WorldRect) => {
		const cells = cellsAcrossTiers(rect);
		result.totalInvalidatedCells += cells;
		result.maxInvalidatedCellsPerEdit = Math.max(
			result.maxInvalidatedCellsPerEdit,
			cells,
		);
		for (const object of scene.objects) {
			if (!intersects(object.bounds, rect)) continue;
			result.objectsTouched++;
			result.weightedObjectWork += object.complexity;
		}
	};

	return {
		setViewport(viewport) {
			result.operations++;
			result.viewportChanges++;
			for (const object of scene.objects) {
				if (!intersects(object.bounds, viewport)) continue;
				result.objectsTouched++;
				result.weightedObjectWork += object.complexity;
			}
		},
		invalidate(rect) {
			result.operations++;
			result.invalidations++;
			measureEdit(rect);
		},
		add(rect) {
			result.operations++;
			result.additions++;
			measureEdit(rect);
		},
		beginGesture() {
			result.operations++;
		},
		endGesture() {
			result.operations++;
		},
		settle() {
			result.operations++;
		},
	};
}

export async function runHeadlessBenchmark(
	sceneId: BenchmarkSceneId,
	scenarioId: BenchmarkScenarioId,
): Promise<HeadlessBenchmarkResult> {
	const scene = createBenchmarkScene(sceneId);
	const result: HeadlessBenchmarkResult = {
		scene: sceneId,
		scenario: scenarioId,
		objectCount: scene.objects.length,
		operations: 0,
		viewportChanges: 0,
		invalidations: 0,
		additions: 0,
		totalInvalidatedCells: 0,
		maxInvalidatedCellsPerEdit: 0,
		objectsTouched: 0,
		weightedObjectWork: 0,
	};
	await runBenchmarkScenario(
		scene,
		scenarioId,
		createCountingDriver(scene, result),
	);
	return result;
}
