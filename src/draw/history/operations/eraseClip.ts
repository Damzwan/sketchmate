/**
 * Pure clip-stroke surgery for erase history. Deliberately a LEAF module: no
 * canvas, no stores, no fabric imports — so it stays unit-testable without
 * dragging the whole engine (and the DOM) into the test environment.
 */

interface ClipCarrier {
	clipPath?: any;
	set: (key: any, value?: any) => void;
}

/**
 * Drop every clip child whose stroke id is in `strokeIds`.
 *
 * Used on objects revived from a deletion snapshot. The snapshot carries the
 * clip the object had when the fully-erased sweep removed it, which can include
 * erases that have since been undone — restoring it verbatim silently
 * re-applies them. Clearing the clip entirely when nothing is left keeps the
 * object cheap to render and worker-shippable.
 */
export function stripClipStrokes(
	obj: ClipCarrier,
	strokeIds: Set<string>,
): void {
	const clip = obj.clipPath;
	if (!clip?._objects || !Array.isArray(clip._objects)) return;
	const stale = clip._objects.filter((o: any) => o?.id && strokeIds.has(o.id));
	if (!stale.length) return;
	if (stale.length === clip._objects.length) {
		obj.set({ clipPath: undefined });
	} else {
		clip.remove(...stale);
		clip.set?.("dirty", true);
	}
	obj.set("dirty", true);
}
