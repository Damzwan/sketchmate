// src/draw/helpers/tools/eraser.helper.ts
import type { FabricObject } from "fabric";

/**
 * Decide whether an object has been erased to the point of being effectively
 * invisible after its clipPath is applied.
 *
 * Why the previous version was wrong:
 *   - It used `toCanvasElement({ multiplier: 0.1 })` (10x downsample). Thin
 *     strokes get antialiased into transparency at that scale and produce
 *     near-zero opaque pixels even when the object still has plenty of visible
 *     material. Result: false positives → premature deletion.
 *   - It used a fixed `pixelCountThreshold: 5` regardless of object size, so
 *     a tiny dot and a 4000x4000 image were judged by the same survival count.
 *
 * What this version does:
 *   - Picks a render multiplier per object: 1.0 for small objects, scaling
 *     down only when the object's natural pixel area would exceed a memory
 *     budget. This preserves antialiasing fidelity for thin shapes.
 *   - Threshold is a percentage of the rendered area, not an absolute count.
 *     An object that would render to 200x200 needs more surviving pixels to
 *     count as "alive" than a 20x20 one does.
 *   - Fast-exits the moment enough surviving pixels are found.
 *   - Guards against zero-area renders and willReadFrequently failures.
 *
 * Tunables are conservative — we'd rather leave a barely-visible sliver than
 * delete an object the user wasn't trying to fully erase.
 */
export const isCompletelyErased = (
	obj: FabricObject,
	options?: {
		/** Pixels with alpha < this are treated as invisible. 0–255. */
		alphaThreshold?: number;
		/**
		 * Maximum fraction of rendered area allowed to be "alive" before the
		 * object is considered NOT completely erased. e.g. 0.001 = 0.1%.
		 */
		survivalRatioThreshold?: number;
		/**
		 * Absolute minimum surviving pixel count regardless of ratio. Keeps tiny
		 * thumbnails (e.g. 32x32) from being deleted on a couple of stray pixels.
		 */
		absoluteMinSurvivors?: number;
		/**
		 * Maximum render area (in pixels) we'll allocate. If the object would
		 * exceed this, we downscale uniformly. Default ~1MP (4 MB RGBA buffer).
		 */
		maxRenderPixels?: number;
	},
): boolean => {
	const alphaThreshold = options?.alphaThreshold ?? 15;
	const survivalRatioThreshold = options?.survivalRatioThreshold ?? 0.001;
	const absoluteMinSurvivors = options?.absoluteMinSurvivors ?? 20;
	const maxRenderPixels = options?.maxRenderPixels ?? 1_048_576;

	// Use the object's bounding rect to estimate the natural render size, then
	// pick a multiplier that keeps us under the budget without blowing past 1.0.
	let multiplier = 1;
	try {
		// @ts-ignore — fabric's getBoundingRect typings
		const b = (obj as any).getBoundingRect(true, true);
		const area = Math.max(1, b.width * b.height);
		if (area > maxRenderPixels) {
			multiplier = Math.sqrt(maxRenderPixels / area);
		}
		// Avoid sub-pixel rendering on objects with absurd aspect ratios — long
		// thin strokes need at least 1px of width to survive antialiasing.
		const minDim = Math.min(b.width, b.height) * multiplier;
		if (minDim < 2 && minDim > 0) {
			multiplier = Math.min(1, 2 / Math.min(b.width, b.height));
		}
	} catch {
		multiplier = 1;
	}

	let canvasEl: HTMLCanvasElement;
	try {
		// @ts-ignore — toCanvasElement exists on FabricObject
		canvasEl = obj.toCanvasElement({ multiplier });
	} catch {
		// If we can't render the object at all, don't delete it.
		return false;
	}

	const w = canvasEl.width;
	const h = canvasEl.height;
	if (w === 0 || h === 0) return true;

	const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
	if (!ctx) return false;

	let data: Uint8ClampedArray;
	try {
		data = ctx.getImageData(0, 0, w, h).data;
	} catch {
		return false;
	}

	const totalPixels = w * h;
	// Don't let the ratio threshold fall below the absolute floor.
	const survivalThreshold = Math.max(
		absoluteMinSurvivors,
		Math.ceil(totalPixels * survivalRatioThreshold),
	);

	let visible = 0;
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] >= alphaThreshold) {
			visible++;
			if (visible > survivalThreshold) return false;
		}
	}
	return true;
};
