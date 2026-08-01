import type { TSimplePathData } from "fabric";

/** Approximate fixed cost of the geometry object and two typed-array views. */
const COMPACT_GEOMETRY_OVERHEAD_BYTES = 128;

export interface CompactPathStorageInfo {
	commandCount: number;
	coordinateCount: number;
	payloadBytes: number;
	geometryIdentity?: object;
}

export interface PathStorageMetrics extends CompactPathStorageInfo {
	mode: "compact" | "fabric";
	estimatedResidentBytes: number;
	estimatedFabricBytes: number;
	estimatedSavingsBytes: number;
}

export interface PathStorageSummary {
	pathObjectCount: number;
	compactPathCount: number;
	uniqueGeometryCount: number;
	estimatedResidentBytes: number;
	estimatedFabricBytes: number;
	estimatedSavingsBytes: number;
}

/**
 * Estimate a Fabric path's V8 heap footprint from its shape.
 *
 * Fabric stores one mixed command array per segment. In V8 that normally means
 * an outer array slot, an inner JSArray/backing-store pair, tagged element
 * slots, and boxed HeapNumbers because the command string makes the inner array
 * heterogeneous. Exact headers vary by V8 build, so this is deliberately
 * labelled an estimate; it is useful for relative board-level comparisons.
 */
export function estimateFabricPathBytes(
	commandCount: number,
	coordinateCount: number,
): number {
	if (commandCount <= 0) return 0;
	return 16 + commandCount * 48 + coordinateCount * 24;
}

export function countPathCoordinates(path: TSimplePathData): number {
	let coordinates = 0;
	for (const command of path) coordinates += Math.max(0, command.length - 1);
	return coordinates;
}

export function compactPathStorageInfo(
	commandCount: number,
	coordinateCount: number,
	geometryIdentity?: object,
): CompactPathStorageInfo {
	return {
		commandCount,
		coordinateCount,
		geometryIdentity,
		// Uint8 command code + Float32 coordinates.
		payloadBytes:
			commandCount + coordinateCount * Float32Array.BYTES_PER_ELEMENT,
	};
}

export function getObjectPathStorageMetrics(
	object: any,
): PathStorageMetrics | null {
	const compact = object?.getCompactPathStorageInfo?.() as
		| CompactPathStorageInfo
		| null
		| undefined;
	if (compact) {
		const estimatedFabricBytes = estimateFabricPathBytes(
			compact.commandCount,
			compact.coordinateCount,
		);
		const estimatedResidentBytes =
			compact.payloadBytes + COMPACT_GEOMETRY_OVERHEAD_BYTES;
		return {
			...compact,
			geometryIdentity: compact.geometryIdentity ?? compact,
			mode: "compact",
			estimatedResidentBytes,
			estimatedFabricBytes,
			estimatedSavingsBytes: Math.max(
				0,
				estimatedFabricBytes - estimatedResidentBytes,
			),
		};
	}

	const path = object?.path;
	if (!Array.isArray(path)) return null;
	const commandCount = path.length;
	const coordinateCount = countPathCoordinates(path as TSimplePathData);
	const estimatedFabricBytes = estimateFabricPathBytes(
		commandCount,
		coordinateCount,
	);
	return {
		mode: "fabric",
		commandCount,
		coordinateCount,
		geometryIdentity: path,
		// This is not a contiguous payload, so use the same V8 estimate.
		payloadBytes: estimatedFabricBytes,
		estimatedResidentBytes: estimatedFabricBytes,
		estimatedFabricBytes,
		estimatedSavingsBytes: 0,
	};
}

/**
 * Count path geometry in a scene graph, including group and clipPath children.
 * Shared compact buffers contribute resident bytes once but contribute one
 * Fabric-equivalent path per clip clone — the multiplier eraser migration fixes.
 */
export function summarizeObjectPathStorage(
	roots: readonly any[],
): PathStorageSummary {
	const seenObjects = new WeakSet<object>();
	const seenGeometry = new WeakSet<object>();
	const summary: PathStorageSummary = {
		pathObjectCount: 0,
		compactPathCount: 0,
		uniqueGeometryCount: 0,
		estimatedResidentBytes: 0,
		estimatedFabricBytes: 0,
		estimatedSavingsBytes: 0,
	};

	const visit = (object: any) => {
		if (!object || typeof object !== "object" || seenObjects.has(object))
			return;
		seenObjects.add(object);

		const storage = getObjectPathStorageMetrics(object);
		if (storage) {
			summary.pathObjectCount++;
			if (storage.mode === "compact") summary.compactPathCount++;
			summary.estimatedFabricBytes += storage.estimatedFabricBytes;

			const identity = storage.geometryIdentity;
			if (!identity || !seenGeometry.has(identity)) {
				if (identity) seenGeometry.add(identity);
				summary.uniqueGeometryCount++;
				summary.estimatedResidentBytes += storage.estimatedResidentBytes;
			}
		}

		if (Array.isArray(object._objects)) {
			for (const child of object._objects) visit(child);
		}
		visit(object.clipPath);
	};

	for (const root of roots) visit(root);
	summary.estimatedSavingsBytes = Math.max(
		0,
		summary.estimatedFabricBytes - summary.estimatedResidentBytes,
	);
	return summary;
}
