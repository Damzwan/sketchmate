import type { Canvas } from "fabric";

/**
 * Browsers refuse a custom cursor image above roughly 128×128 (Chrome silently
 * falls back to the default; some Android WebViews drop it entirely), and the
 * image is rebuilt through `toDataURL` on every size change.
 *
 * The old code passed `size * zoom` straight through, so a 50-wide brush at 3x
 * zoom already produced a 150px cursor that simply did not render — the brush
 * appeared to lose its size indicator at high zoom. Raising the width cap to 120
 * would have made that the common case rather than an edge one.
 *
 * Clamping keeps a valid cursor at every size. Past the clamp the circle stops
 * tracking the true brush size, which is the correct trade: an approximate
 * indicator beats no indicator, and at that point the brush is wider than the
 * cursor could usefully depict anyway.
 */
const MAX_CURSOR_PX = 128;
const cursorCache = new WeakMap<Canvas, { key: string; cursor: string }>();

export function updateFreeDrawingCursor(
	c: Canvas,
	size: number,
	color: string,
	eraser = false,
) {
	const adjustedSize = Math.max(
		1,
		Math.min(MAX_CURSOR_PX, Math.round(size * c.getZoom())),
	);
	const cacheKey = `${adjustedSize}|${color}|${eraser}`;
	const cached = cursorCache.get(c);
	if (cached?.key === cacheKey) {
		c.freeDrawingCursor = cached.cursor;
		c.setCursor(cached.cursor);
		return;
	}

	const canvas: HTMLCanvasElement = document.createElement("canvas");
	canvas.width = adjustedSize;
	canvas.height = adjustedSize;
	const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");

	if (!ctx) {
		throw new Error("Failed to get canvas rendering context.");
	}

	// Draw the circle in the center
	ctx.beginPath();
	ctx.arc(
		adjustedSize / 2,
		adjustedSize / 2,
		adjustedSize / 2,
		0,
		2 * Math.PI,
		false,
	);
	ctx.fillStyle = color;
	ctx.fill();

	if (eraser) {
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 2; // Adjust this value for border thickness
		ctx.stroke();
	}

	// Convert to data URL
	const url = canvas.toDataURL("image/png");
	c.freeDrawingCursor = `url(${url}) ${adjustedSize / 2} ${adjustedSize / 2}, crosshair`;
	cursorCache.set(c, { key: cacheKey, cursor: c.freeDrawingCursor });
	c.setCursor(c.freeDrawingCursor);
}
