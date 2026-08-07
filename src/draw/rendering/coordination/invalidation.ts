import type { Bounded, WorldRect } from "../committedLayer";

export function getObjectBounds(object: Bounded): WorldRect | null {
	try {
		const bounds = object.getBoundingRect();
		if (
			!Number.isFinite(bounds.left) ||
			bounds.width <= 0 ||
			bounds.height <= 0
		) {
			return null;
		}
		return {
			x: bounds.left,
			y: bounds.top,
			w: bounds.width,
			h: bounds.height,
		};
	} catch {
		return null;
	}
}

export function unionRects(a: WorldRect, b: WorldRect): WorldRect {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const right = Math.max(a.x + a.w, b.x + b.w);
	const bottom = Math.max(a.y + a.h, b.y + b.h);
	return { x, y, w: right - x, h: bottom - y };
}

export function mergeNearbyRects(
	rects: readonly WorldRect[],
	maxRects = 64,
	padding = 16,
): WorldRect[] {
	if (rects.length <= 1) return rects.map((rect) => ({ ...rect }));
	if (rects.length > maxRects) {
		return [rects.reduce(unionRects)];
	}

	const merged: WorldRect[] = [];
	for (const rect of rects) {
		const match = merged.findIndex((candidate) =>
			areRectsNear(candidate, rect, padding),
		);
		if (match === -1) merged.push({ ...rect });
		else merged[match] = unionRects(merged[match], rect);
	}
	return merged;
}

export function areRectsNear(
	a: WorldRect,
	b: WorldRect,
	padding = 16,
): boolean {
	return !(
		a.x + a.w + padding < b.x ||
		b.x + b.w + padding < a.x ||
		a.y + a.h + padding < b.y ||
		b.y + b.h + padding < a.y
	);
}
