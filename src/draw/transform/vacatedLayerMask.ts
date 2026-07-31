interface Size {
	width: number;
	height: number;
}

interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Keep clip edges on physical pixels so translucent layers never blend at a
 * fractional CSS-pixel boundary. */
export function snapRectToDevicePixels(rect: Rect, dpr: number): Rect {
	if (!Number.isFinite(dpr) || dpr <= 0) return rect;
	const left = Math.round(rect.left * dpr) / dpr;
	const top = Math.round(rect.top * dpr) / dpr;
	const right = Math.round((rect.left + rect.width) * dpr) / dpr;
	const bottom = Math.round((rect.top + rect.height) * dpr) / dpr;
	if (right <= left || bottom <= top) return rect;
	return { left, top, width: right - left, height: bottom - top };
}

export function rectangularHoleClipPath(
	canvas: Size,
	hole: Rect,
): string | null {
	const x0 = clamp(hole.left, 0, canvas.width);
	const y0 = clamp(hole.top, 0, canvas.height);
	const x1 = clamp(hole.left + hole.width, 0, canvas.width);
	const y1 = clamp(hole.top + hole.height, 0, canvas.height);
	if (x1 <= x0 || y1 <= y0) return null;

	return `polygon(evenodd, 0px 0px, ${px(canvas.width)} 0px, ${px(canvas.width)} ${px(canvas.height)}, 0px ${px(canvas.height)}, 0px 0px, ${px(x0)} ${px(y0)}, ${px(x0)} ${px(y1)}, ${px(x1)} ${px(y1)}, ${px(x1)} ${px(y0)}, ${px(x0)} ${px(y0)})`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function px(value: number): string {
	return `${Math.round(value * 1000) / 1000}px`;
}
