/**
 * Read ONE pixel off the live drawing canvas without reading the live drawing
 * canvas.
 *
 * `getImageData` on the fabric canvas is a readback of an ACCELERATED surface,
 * and Chromium's readback heuristic answers repeated reads by dropping that
 * canvas to software for the rest of its life. Here that canvas is the whole
 * drawing, so a handful of colour picks could quietly halve render performance
 * for the session — and on the Adreno/Mali stacks in the `gsl_syncobj_destroy`
 * and `glDrawElementsInstanced` crash clusters, every readback is also a driver
 * fence.
 *
 * Blitting the one pixel into a 1×1 canvas declared `willReadFrequently` moves
 * the read onto a surface that is meant to be read. The source snapshot still
 * happens, so this is not free — pair it with sampling no more than once per
 * frame (see the eyedropper's scheduleProbe).
 *
 * The scratch is rebuilt on demand: `drawImage` from a tainted source taints it
 * permanently, so a SecurityError drops it rather than poisoning every later
 * read.
 */

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchContext: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
	if (scratchContext) return scratchContext;
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	scratchContext = canvas.getContext("2d", {
		willReadFrequently: true,
	}) as CanvasRenderingContext2D | null;
	scratchCanvas = scratchContext ? canvas : null;
	return scratchContext;
}

/**
 * The RGBA at (x, y) of `source`, or null if it could not be read there —
 * callers that must have an answer can fall back to reading `source` directly.
 */
export function readCanvasPixel(
	source: CanvasImageSource,
	x: number,
	y: number,
): Uint8ClampedArray | null {
	const scratch = context();
	if (!scratch) return null;
	try {
		scratch.clearRect(0, 0, 1, 1);
		scratch.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
		return scratch.getImageData(0, 0, 1, 1).data;
	} catch {
		scratchCanvas = null;
		scratchContext = null;
		return null;
	}
}
