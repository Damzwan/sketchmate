// rasterSurface.ts
//
// ONE decision, in one place: what kind of canvas the engine rasterizes into on
// the MAIN thread — an `OffscreenCanvas`, or a detached DOM `<canvas>`.
//
// WHY THIS EXISTS
//
// Gecko does not GPU-accelerate a main-thread `OffscreenCanvas` 2D context. It
// accelerates a DOM `<canvas>` (attached or not), and it accelerates an
// `OffscreenCanvas` transferred INTO a worker — but a 2D context obtained from
// an `OffscreenCanvas` on the main thread falls back to the software backend.
// The whole tile pipeline runs there, so on Firefox every tile bake and the
// whole overview rebuild were rasterizing in software.
//
// Measured on Firefox 153 / macOS, one dense 516² tile (300 stroked paths),
// end-to-end including the first `drawImage` that forces the flush:
//
//                                        Firefox 153     Chromium 148
//   OffscreenCanvas + transferToImageBitmap   9.87 ms        0.72 ms
//   DOM <canvas> kept as the tile surface     0.43 ms        0.61 ms
//
// A 40-tile bake pass is therefore ~0.4 s of main-thread rasterization on
// Chrome and ~4 s on Firefox — which is the whole reported symptom set: tiles
// that fill in "way later", a viewport that flashes through the fallback ladder
// while zooming, and an overview (the ONLY source at minimum zoom) that is
// still building, or repeatedly aborted by the next gesture, so parts of the
// board never appear.
//
// `transferToImageBitmap` is a second, smaller tax on the same path: it is
// zero-copy in Chromium and a real copy in Gecko (~0.39 ms per 516² tile). So
// where a DOM canvas is preferred we do not snapshot at all — the canvas
// ITSELF becomes the tile surface. The tile cache already supports that:
// `TileSurface` has always been `ImageBitmap | canvas` for the hot-tile path,
// `drawImage` takes either, and a canvas-backed tile can additionally be
// stamped in place, which removes the texture churn too.
//
// THE COST, AND WHY THE BUDGET MOVES WITH IT
//
// Gecko keeps only a bounded number of canvases accelerated and silently drops
// the overflow to software. The knee is a COUNT — ~100 live canvases, at 516²,
// 384² and 256² alike — not a size, so shrinking tiles buys nothing and costs
// screen coverage. `ImageBitmap`s are not on that budget (bake cost stayed flat
// with 232 of them, 235 MB, alive).
//
// So tiles are baked as canvases and the COLD ones are demoted back to bitmaps
// (`TileStamps.demoteHotTiles`), leaving only a bounded working set holding
// surfaces — `DrawMemoryProfile.hotTileMax`, which on this path means the
// viewport working set rather than a small optimisation quota. Do not raise
// that without re-measuring the pool.

import { getDrawRasterMode } from "@/draw/config/rasterMode.config";

/** A main-thread rasterization target. `drawImage` accepts both. */
export type RasterSurface = OffscreenCanvas | HTMLCanvasElement;

/** The 2D context of a `RasterSurface`. */
export type RasterContext =
	| OffscreenCanvasRenderingContext2D
	| CanvasRenderingContext2D;

/**
 * Is this a Gecko engine, i.e. one where a main-thread `OffscreenCanvas` 2D
 * context is not accelerated?
 *
 * Deliberately an ENGINE check, not a version check: the behaviour is a
 * property of Gecko's canvas backend, and there is no feature bit that exposes
 * "this context is accelerated". A timing probe at start-up was the alternative
 * and is worse — it costs start-up time and is unreliable on a busy main thread.
 *
 * Three independent Gecko markers, because any single one may be retired:
 * `-moz-appearance` was already dropped from `element.style` by Firefox 153 but
 * still answers `CSS.supports`. Getting this wrong is not a correctness bug in
 * either direction — it only picks the slower surface for that engine.
 */
function isGecko(): boolean {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return false;
	}
	try {
		if (
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("-moz-appearance", "none")
		) {
			return true;
		}
	} catch {
		/* CSS.supports with a vendor property must never break canvas creation */
	}
	if (typeof (window as any).mozInnerScreenX === "number") return true;
	return (
		typeof navigator !== "undefined" &&
		/\bFirefox\/\d/.test(navigator.userAgent)
	);
}

/**
 * Should main-thread rasterization use a DOM `<canvas>` rather than an
 * `OffscreenCanvas`? This is required when OffscreenCanvas is unavailable and
 * preferred on Gecko for performance.
 *
 * Resolved once. A mid-session flip would leave tiles of both kinds in the
 * cache, which is harmless (both composite) but makes the memory budget — sized
 * for one of them — meaningless.
 */
export const RASTER_PREFERS_DOM_CANVAS: boolean =
	typeof document !== "undefined" &&
	typeof document.createElement === "function" &&
	// Older Android System WebViews have no OffscreenCanvas at all. A detached
	// DOM canvas is slower than the modern worker path, but it keeps the main
	// renderer functional instead of throwing on every tile/overview bake.
	(typeof OffscreenCanvas !== "function" ||
		// Off-DOM — the headless test environment, and the bakery worker if this
		// module ever reaches it — there is no DOM canvas to prefer, and an
		// `OffscreenCanvas` inside a worker is accelerated on Gecko anyway.
		isGecko());

/** Is this surface a DOM canvas rather than an `OffscreenCanvas`? */
export function isDomCanvas(
	surface: RasterSurface,
): surface is HTMLCanvasElement {
	return (
		typeof (surface as OffscreenCanvas).transferToImageBitmap !== "function"
	);
}

/**
 * Should tile rasterization use the CPU backend? See
 * `config/rasterMode.config.ts` for the whole argument.
 *
 * Resolved once, like `RASTER_PREFERS_DOM_CANVAS` and for the same reason: a
 * mid-session flip would leave surfaces of both kinds in one cache, sized
 * against a budget that assumed one of them.
 */
export const RASTER_SOFTWARE: boolean = getDrawRasterMode() === "cpu";

/**
 * The 2D context attributes every raster surface is created with.
 *
 * `willReadFrequently` is Chromium's switch for the software (Skia CPU) canvas
 * backend. It is named for pixel reads, but the backend it selects is the point
 * here — see `rasterMode.config.ts`.
 */
export const RASTER_CONTEXT_ATTRS: CanvasRenderingContext2DSettings = {
	willReadFrequently: RASTER_SOFTWARE,
};

/**
 * Bind the 2D context at creation time.
 *
 * Context attributes are honoured on the FIRST `getContext` call for a canvas
 * and ignored on every later one, which is what makes this the only place the
 * raster backend has to be chosen. The bake and stamp paths call
 * `surface.getContext("2d")` bare, all over the engine, and still get the
 * backend selected here.
 *
 * Nothing is lost by doing it eagerly: every surface this factory produces has
 * its context taken immediately by its caller.
 */
function primeContext(surface: RasterSurface): void {
	try {
		surface.getContext("2d", RASTER_CONTEXT_ATTRS);
	} catch {
		// A context that cannot be created here will fail again, visibly, at the
		// call site that actually needs it. Do not turn it into a factory throw.
	}
}

export function createRasterSurface(
	width: number,
	height: number,
): RasterSurface {
	if (RASTER_PREFERS_DOM_CANVAS) {
		// Never appended to the document: an attached canvas would be laid out and
		// composited by the page, and Gecko accelerates a detached one just the
		// same (that is the case measured above).
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		primeContext(canvas);
		return canvas;
	}
	if (typeof OffscreenCanvas !== "function") {
		throw new Error(
			"No canvas raster surface is available in this environment",
		);
	}
	const surface = new OffscreenCanvas(width, height);
	primeContext(surface);
	return surface;
}

/**
 * Free a surface's backing store NOW rather than at some later GC. Both kinds
 * release on a zero resize, and both are reusable afterwards.
 */
export function releaseRasterSurface(surface: RasterSurface): void {
	surface.width = 0;
	surface.height = 0;
}

export function rasterContext(surface: RasterSurface): RasterContext | null {
	return (
		(surface.getContext("2d", RASTER_CONTEXT_ATTRS) as RasterContext | null) ??
		null
	);
}

/**
 * Take the finished pixels off a scratch surface.
 *
 * Returns EITHER a new `ImageBitmap` (the surface is now blank and the caller
 * keeps ownership of it — pool it), OR the surface itself (the caller must hand
 * ownership to the tile and must NOT pool it). Callers distinguish with
 * `result === surface`; `null` means the snapshot failed and the surface is
 * still the caller's.
 */
export function snapshotRaster(
	surface: RasterSurface,
): ImageBitmap | RasterSurface | null {
	if (isDomCanvas(surface)) return surface;
	try {
		return surface.transferToImageBitmap();
	} catch {
		return null;
	}
}
