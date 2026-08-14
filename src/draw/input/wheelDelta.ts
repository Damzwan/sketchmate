/**
 * A wheel event's vertical delta, in PIXELS, whatever unit it arrived in.
 *
 * Blink always reports `deltaMode: 0` (pixels) and ~100 px per mouse notch, so
 * reading `deltaY` raw happens to work there. Gecko reports a real mouse wheel
 * in `DOM_DELTA_LINE` — 3 LINES per notch — so the same expression fed
 * `Math.exp(-3 / 300)`: a 1% zoom step against Blink's ~28%.
 *
 * That is not merely "zoom is slow on Firefox". A wheel event opens a viewport
 * gesture, and every subsequent event pushes back the timer that closes it.
 * While a gesture is open the render engine aborts bakes, refuses to start new
 * ones, and caps the composite's cross-tier fallback search at a single tier.
 * Needing ~40x the events to reach the same zoom therefore pinned the renderer
 * in that degraded interactive mode for as long as the user kept scrolling —
 * which is the flashing, and the tiles that only sharpen once you stop.
 *
 * Kept in its own module, free of imports, so it is testable without dragging
 * the fabric canvas and the object manager into a headless environment.
 */

/** 32 px/line puts one Gecko notch (3 lines) at ~96 px, i.e. Blink's ~100. */
const WHEEL_PIXELS_PER_LINE = 32;

/** Roughly a screenful. Only Windows "scroll one page per notch" produces it. */
const WHEEL_PIXELS_PER_PAGE = 400;

export function wheelDeltaPixels(e: {
	deltaY: number;
	deltaMode: number;
}): number {
	if (e.deltaMode === 1) return e.deltaY * WHEEL_PIXELS_PER_LINE;
	if (e.deltaMode === 2) return e.deltaY * WHEEL_PIXELS_PER_PAGE;
	return e.deltaY;
}
