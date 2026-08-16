import type { InstrumentPoint } from "@/draw/tools/instruments/instrumentGeometry";

export interface InstrumentViewportSize {
	width: number;
	height: number;
}

const RULER_OVERSCAN = 1.06;
const COMPASS_HANDLE_MARGIN_PX = 24;

/**
 * A little more than the viewport diagonal lets a centred ruler reach across
 * every pair of corners, even after accounting for its rounded ends.
 */
export function maxRulerLengthPx(viewport: InstrumentViewportSize): number {
	return Math.max(
		120,
		Math.hypot(viewport.width, viewport.height) * RULER_OVERSCAN,
	);
}

/**
 * The largest useful centred circle: its radius handle can still fit at a
 * padded viewport corner. This is much larger than the old min-dimension cap,
 * without allowing a circle whose entire circumference is off screen.
 */
export function maxCompassRadiusPx(viewport: InstrumentViewportSize): number {
	return Math.max(
		36,
		Math.hypot(
			Math.max(1, viewport.width / 2 - COMPASS_HANDLE_MARGIN_PX),
			Math.max(1, viewport.height / 2 - COMPASS_HANDLE_MARGIN_PX),
		),
	);
}

/**
 * Keep the compass radius handle visible. It stays on the familiar right-hand
 * side while that fits, then follows the nearest viable diagonal toward a
 * padded corner as the circle grows.
 */
export function compassRadiusHandlePoint(
	center: InstrumentPoint,
	radius: number,
	viewport: InstrumentViewportSize,
): InstrumentPoint {
	const minX = COMPASS_HANDLE_MARGIN_PX;
	const maxX = Math.max(minX, viewport.width - COMPASS_HANDLE_MARGIN_PX);
	const minY = COMPASS_HANDLE_MARGIN_PX;
	const maxY = Math.max(minY, viewport.height - COMPASS_HANDLE_MARGIN_PX);

	if (center.x + radius <= maxX) {
		return { x: center.x + radius, y: center.y };
	}

	const corners = [
		{ x: maxX, y: minY },
		{ x: maxX, y: maxY },
		{ x: minX, y: minY },
		{ x: minX, y: maxY },
	]
		.map((corner) => {
			const dx = corner.x - center.x;
			const dy = corner.y - center.y;
			return {
				corner,
				dx,
				dy,
				distance: Math.hypot(dx, dy),
				angle: Math.abs(Math.atan2(dy, dx)),
			};
		})
		.filter((candidate) => candidate.distance >= radius)
		.sort((a, b) => a.angle - b.angle);

	const target = corners[0];
	if (!target || target.distance <= 0) {
		return { x: center.x + radius, y: center.y };
	}
	const scale = radius / target.distance;
	return {
		x: center.x + target.dx * scale,
		y: center.y + target.dy * scale,
	};
}
