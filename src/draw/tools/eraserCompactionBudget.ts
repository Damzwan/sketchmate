import {
	DRAW_DEVICE_MEMORY_GB,
	IS_LOW_END_DEVICE,
} from "@/draw/config/renderQuality.config";

const IS_MOBILE_ERASER_BUDGET =
	typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

/** CPU-side RGBA alone is 4 bytes/pixel; WebView/GPU copies can multiply it. */
export const MAX_SESSION_BAKED_MASK_PIXELS = IS_LOW_END_DEVICE
	? 3 * 1024 * 1024
	: IS_MOBILE_ERASER_BUDGET
		? 8 * 1024 * 1024
		: 32 * 1024 * 1024;

/**
 * Ceiling on ONE flattened clip mask.
 *
 * Each bake allocates a fresh canvas of this many pixels — an accelerated,
 * GPU-backed surface that then stays resident for as long as the object does.
 * A flat 4 MP is 16 MB of RGBA before the driver's own copies, which is a
 * different proposition on a 2 GB Android 9 phone (`deviceMemoryGB: 2`,
 * `lowEnd: true` — the device class in the `gsl_syncobj_destroy` and
 * `glDrawElementsInstanced` GPU-driver crashes) than on a desktop.
 *
 * Lowering it does not lose erase strokes or change what is erased: the bake
 * only compacts already-applied clip strokes, and a smaller multiplier costs
 * mask sharpness at extreme zoom, nothing else. Under the cap the flatten is
 * skipped and the strokes stay as vectors.
 */
export const MAX_BAKED_MASK_PIXELS =
	IS_LOW_END_DEVICE || DRAW_DEVICE_MEMORY_GB <= 2
		? 1024 * 1024
		: 4 * 1024 * 1024;
export const MAX_SESSION_RETAINED_CLIP_STROKES = IS_MOBILE_ERASER_BUDGET
	? 2_048
	: 8_192;

export function allowedCompactionPixels(
	otherSessionPixels: number,
	requestedPixels: number,
	sessionLimit = MAX_SESSION_BAKED_MASK_PIXELS,
): number {
	return Math.max(
		0,
		Math.min(requestedPixels, sessionLimit - Math.max(0, otherSessionPixels)),
	);
}

export function canRetainCompactedStrokes(
	otherSessionRetained: number,
	nextObjectRetained: number,
	sessionLimit = MAX_SESSION_RETAINED_CLIP_STROKES,
): boolean {
	return otherSessionRetained + nextObjectRetained <= sessionLimit;
}

function walkSceneObjects(roots: any[], visit: (object: any) => void): void {
	const pending = [...roots];
	const seen = new Set<any>();
	while (pending.length) {
		const object = pending.pop();
		if (!object || seen.has(object)) continue;
		seen.add(object);
		visit(object);
		const children = object.getObjects?.();
		if (Array.isArray(children)) pending.push(...children);
	}
}

export function pruneExpiredRetainedClipStrokes(
	roots: any[],
	isUndoable: ((strokeId: string) => boolean) | undefined,
): void {
	if (!isUndoable) return;
	walkSceneObjects(roots, (object) => {
		const retained = object.__bakedClipStrokes;
		if (!Array.isArray(retained) || retained.length === 0) return;
		const keep = retained.filter(
			(stroke: any) => !!stroke?.id && isUndoable(stroke.id),
		);
		if (keep.length === retained.length) return;
		const keepSet = new Set(keep);
		for (const stroke of retained) {
			if (!keepSet.has(stroke)) stroke?.dispose?.();
		}
		object.__bakedClipStrokes = keep;
	});
}

export function measureEraserCompactionUsage(
	roots: any[],
	excludeObject?: any,
): { bakedPixels: number; retainedStrokes: number } {
	let bakedPixels = 0;
	let retainedStrokes = 0;
	walkSceneObjects(roots, (object) => {
		if (object === excludeObject) return;
		const retained = object.__bakedClipStrokes;
		if (Array.isArray(retained)) retainedStrokes += retained.length;
		const children = object.clipPath?._objects;
		if (!Array.isArray(children)) return;
		for (const child of children) {
			if (child?.type !== "image") continue;
			const element = child.getElement?.();
			const width = Number(element?.width ?? child.width ?? 0);
			const height = Number(element?.height ?? child.height ?? 0);
			if (width > 0 && height > 0) bakedPixels += width * height;
		}
	});
	return { bakedPixels, retainedStrokes };
}
