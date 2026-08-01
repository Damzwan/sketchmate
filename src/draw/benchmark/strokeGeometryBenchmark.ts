import type { TSimplePathData } from "fabric";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { getObjectPathStorageMetrics } from "@/draw/utils/brushes/pathStorage";

export interface StrokeGeometryBenchmarkResult {
	commandCount: number;
	coordinateCount: number;
	compactPayloadBytes: number;
	estimatedCompactResidentBytes: number;
	estimatedFabricResidentBytes: number;
	estimatedSavingsBytes: number;
	reductionPercent: number;
	serializedJsonBytes: number;
}

export interface EraserCloneGeometryBenchmarkResult {
	commandCount: number;
	cloneCount: number;
	sharedCloneCount: number;
	sharedCompactGeometryBytes: number;
	estimatedFabricGeometryBytes: number;
	estimatedSavingsBytes: number;
	reductionPercent: number;
}

function createQuadraticPencilPath(commandCount: number): TSimplePathData {
	const count = Math.max(1, Math.floor(commandCount));
	const path: any[] = [["M", 120.25, 240.5]];
	for (let i = 1; i < count; i++) {
		const x = 120.25 + i * 0.75;
		const y = 240.5 + Math.sin(i / 9) * 18;
		path.push(["Q", x - 0.25, y - 0.5, x, y]);
	}
	return path as TSimplePathData;
}

function geometryReduction(savedBytes: number, fabricBytes: number): number {
	return fabricBytes > 0 ? (savedBytes / fabricBytes) * 100 : 0;
}

/** Deterministic storage benchmark; no wall-clock values, so it is CI-stable. */
export function runStrokeGeometryBenchmark(
	commandCount = 1_000,
): StrokeGeometryBenchmarkResult {
	const stroke = new OptimizedPencilStroke(
		createQuadraticPencilPath(commandCount),
		{
			fill: null,
			stroke: "#000000",
			strokeWidth: 2,
			strokeLineCap: "round",
			strokeLineJoin: "round",
		},
	);
	const storage = getObjectPathStorageMetrics(stroke);
	if (!storage || storage.mode !== "compact") {
		throw new Error("Compact pencil geometry is disabled for this benchmark");
	}
	const serializedJsonBytes = new TextEncoder().encode(
		JSON.stringify(stroke.toObject()),
	).byteLength;

	return {
		commandCount: storage.commandCount,
		coordinateCount: storage.coordinateCount,
		compactPayloadBytes: storage.payloadBytes,
		estimatedCompactResidentBytes: storage.estimatedResidentBytes,
		estimatedFabricResidentBytes: storage.estimatedFabricBytes,
		estimatedSavingsBytes: storage.estimatedSavingsBytes,
		reductionPercent: geometryReduction(
			storage.estimatedSavingsBytes,
			storage.estimatedFabricBytes,
		),
		serializedJsonBytes,
	};
}

/**
 * Models one erase gesture copied into many target clip paths. Only geometry is
 * counted: Fabric object/style/transform fields exist in both implementations.
 */
export function runEraserCloneGeometryBenchmark(
	commandCount = 250,
	cloneCount = 100,
): EraserCloneGeometryBenchmarkResult {
	const style = {
		fill: null,
		stroke: "black",
		strokeWidth: 24,
		strokeLineCap: "round",
		strokeLineJoin: "round",
		globalCompositeOperation: "destination-out",
	};
	const source = new OptimizedEraserStroke(
		createQuadraticPencilPath(commandCount),
		style,
	);
	const clones = Array.from(
		{ length: Math.max(0, Math.floor(cloneCount)) },
		() => new OptimizedEraserStroke(source, style),
	);
	const storage = getObjectPathStorageMetrics(source);
	if (!storage || storage.mode !== "compact") {
		throw new Error("Compact eraser geometry is disabled for this benchmark");
	}

	const estimatedFabricGeometryBytes =
		storage.estimatedFabricBytes * (clones.length + 1);
	const sharedCompactGeometryBytes = storage.estimatedResidentBytes;
	const estimatedSavingsBytes = Math.max(
		0,
		estimatedFabricGeometryBytes - sharedCompactGeometryBytes,
	);
	return {
		commandCount: storage.commandCount,
		cloneCount: clones.length,
		sharedCloneCount: clones.filter((clone) =>
			clone._sharesCompactPathGeometryWith(source),
		).length,
		sharedCompactGeometryBytes,
		estimatedFabricGeometryBytes,
		estimatedSavingsBytes,
		reductionPercent: geometryReduction(
			estimatedSavingsBytes,
			estimatedFabricGeometryBytes,
		),
	};
}
