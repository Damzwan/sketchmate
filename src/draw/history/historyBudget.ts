const OBJECT_IDS_PER_WEIGHT_UNIT = 64;

/**
 * History memory is dominated by serialized Fabric objects. Erase targets are
 * only UUID references, so charge them in small batches instead of treating
 * every ID like a retained object snapshot.
 */
export function eraseHistoryWeight(
	targetCount: number,
	deletedObjectCount: number,
): number {
	const referenceWeight = Math.ceil(
		Math.max(0, targetCount) / OBJECT_IDS_PER_WEIGHT_UNIT,
	);
	return 1 + referenceWeight + Math.max(0, deletedObjectCount);
}

export function referenceHistoryWeight(referenceCount: number): number {
	return (
		1 + Math.ceil(Math.max(0, referenceCount) / OBJECT_IDS_PER_WEIGHT_UNIT)
	);
}
