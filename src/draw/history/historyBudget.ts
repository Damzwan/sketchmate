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

/**
 * Weight for an entry whose per-object payload is a REFERENCE, not a snapshot:
 * a UUID, a transform delta (five numbers), a style patch, a stack position.
 *
 * `actionWeight` falls back to counting array elements, which silently treats
 * every one of these as a retained object — so moving a 200-object selection
 * was charged the same 200 units as deleting 200 strokes, and a handful of
 * ordinary moves blew the whole mobile budget (400) and evicted the rest of the
 * undo stack down to MIN_ACTIONS. Undo then could not walk back to where the
 * drawing started, which is exactly what the stack exists for. Anything storing
 * references per object must precompute `__w` with this.
 */
export function referenceHistoryWeight(referenceCount: number): number {
	return (
		1 + Math.ceil(Math.max(0, referenceCount) / OBJECT_IDS_PER_WEIGHT_UNIT)
	);
}
