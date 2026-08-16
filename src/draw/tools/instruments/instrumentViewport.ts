import type { InstrumentPoint } from "@/draw/tools/instruments/instrumentGeometry";

export interface InstrumentViewportSize {
	width: number;
	height: number;
}

/**
 * A ruler may run well past the edges of the screen.
 *
 * The cap used to be the viewport diagonal, on the reasoning that a ruler you
 * cannot see the ends of is not useful. In practice the opposite is true: you
 * zoom in to draw an accurate line, and a ruler that can only ever be as long
 * as the current view cannot rule a line longer than the current view. Three
 * diagonals is still bounded — it keeps the SVG geometry and the tick loop
 * finite — while being far more than any single stroke needs.
 *
 * The ends going off screen is handled, not prevented: see
 * `rulerHandleOffsets`, which keeps the grab handles reachable.
 */
const RULER_OVERSCAN = 3;
const COMPASS_HANDLE_MARGIN_PX = 24;

/** Distance from a handle's centre to the ruler tip, in screen pixels. */
const RULER_HANDLE_INSET_PX = 22;
/** Never collapse both handles onto the midpoint controls. */
const MIN_RULER_HANDLE_OFFSET_PX = 34;

export function maxRulerLengthPx(viewport: InstrumentViewportSize): number {
	return Math.max(
		120,
		Math.hypot(viewport.width, viewport.height) * RULER_OVERSCAN,
	);
}

/**
 * How far the ruler's centre must stay inside the viewport, in screen pixels.
 *
 * DELIBERATELY INDEPENDENT OF ANGLE AND LENGTH. The previous rule clamped the
 * ruler's rotated bounding box into the viewport, so its half-extents changed
 * as the ruler turned — and `setRulerAngle` re-clamps on every frame of a
 * rotation. Rotating therefore SHOVED the ruler sideways, a little more with
 * every degree, which is the "rotating also translates" bug.
 *
 * Anchoring the rule to the centre alone makes the clamp rotation-invariant:
 * spinning the ruler cannot change the constraint, so it cannot move it. The
 * margin still scales with the ruler's WIDTH — which rotation does not change —
 * so the body under the centre, and with it the drag surface, stays grabbable.
 */
export function rulerCenterMarginPx(widthPx: number): number {
	return 24 + Math.max(0, widthPx) / 2;
}

/**
 * Where to put the two length/rotation handles, as offsets along the ruler from
 * its centre (negative for the start end, positive for the end end).
 *
 * A ruler longer than the viewport puts its tips off screen, and a handle you
 * cannot reach is a ruler you cannot shrink. So each handle slides inward to
 * the last visible point on its own side, and only sits at the tip when the tip
 * is actually on screen. Dragging is measured from the CENTRE, not from the
 * handle, so moving the grab point changes nothing about the resulting size.
 */
export function rulerHandleOffsets(
	center: InstrumentPoint,
	angle: number,
	lengthPx: number,
	viewport: InstrumentViewportSize,
): { start: number; end: number } {
	const tip = Math.max(0, lengthPx / 2 - RULER_HANDLE_INSET_PX);
	const direction = { x: Math.cos(angle), y: Math.sin(angle) };
	const reach = (sign: 1 | -1) => {
		const visible =
			distanceToViewportEdge(
				center,
				{ x: direction.x * sign, y: direction.y * sign },
				viewport,
			) - RULER_HANDLE_INSET_PX;
		return sign * Math.min(tip, Math.max(MIN_RULER_HANDLE_OFFSET_PX, visible));
	};
	return { start: reach(-1), end: reach(1) };
}

/**
 * How far a ray from `origin` travels inside `viewport` before leaving it.
 * `origin` is assumed to be inside; a degenerate direction answers 0.
 */
function distanceToViewportEdge(
	origin: InstrumentPoint,
	direction: InstrumentPoint,
	viewport: InstrumentViewportSize,
): number {
	const limits: number[] = [];
	if (Math.abs(direction.x) > 1e-6) {
		limits.push(
			((direction.x > 0 ? viewport.width : 0) - origin.x) / direction.x,
		);
	}
	if (Math.abs(direction.y) > 1e-6) {
		limits.push(
			((direction.y > 0 ? viewport.height : 0) - origin.y) / direction.y,
		);
	}
	if (limits.length === 0) return 0;
	return Math.max(0, Math.min(...limits));
}

/**
 * The compass may be larger than the screen, for the same reason the ruler may
 * be longer than it: an arc you can only draw at the size of the current view
 * is not much of an arc. The cap is a bound against absurd geometry, not a
 * statement about what fits.
 */
const COMPASS_OVERSCAN = 3;

export function maxCompassRadiusPx(viewport: InstrumentViewportSize): number {
	return Math.max(
		36,
		Math.hypot(viewport.width, viewport.height) * COMPASS_OVERSCAN,
	);
}

/**
 * Radius of the compass's central drag puck, in screen pixels.
 *
 * It used to be the whole inside of the circle (`radius - 24`). Once a circle
 * can be bigger than the viewport that surface covers the ENTIRE screen — and
 * it is a pointer-capturing element sitting above the canvas, so the compass
 * would silently eat every stroke the user tried to draw inside it. Capping the
 * puck keeps the tool draggable while leaving the rest of the circle's interior
 * to the brush, which is where drawing with a compass actually happens.
 *
 * Small circles are unaffected: below ~120px the cap never binds and the whole
 * interior still drags, exactly as before.
 */
export function compassDragRadiusPx(radiusPx: number): number {
	return Math.max(28, Math.min(radiusPx - 24, 96));
}

/**
 * How far the compass centre must stay inside the viewport.
 *
 * Enough to keep the drag puck fully reachable, and no more. The old rule kept
 * the whole CIRCUMFERENCE on screen, which for any circle wider than the
 * viewport collapsed the allowed range to a single point — the compass could
 * not be moved at all, only grown and shrunk.
 */
export function compassCenterMarginPx(radiusPx: number): number {
	return COMPASS_HANDLE_MARGIN_PX + compassDragRadiusPx(radiusPx);
}

/**
 * Keep the compass radius handle visible. It stays on the familiar right-hand
 * side while that fits, then follows the nearest viable diagonal toward a
 * padded corner as the circle grows — and once the circle is larger than the
 * screen entirely, it slides down the most open direction to the last visible
 * point, the same way the ruler's end handles do.
 *
 * In that last case the handle no longer sits ON the circumference. It does not
 * need to: dragging is measured from the centre, so the handle is a grip for
 * the radius, not a point on it.
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

	const candidates = [
		{ x: maxX, y: minY },
		{ x: maxX, y: maxY },
		{ x: minX, y: minY },
		{ x: minX, y: maxY },
	].map((corner) => {
		const dx = corner.x - center.x;
		const dy = corner.y - center.y;
		return { dx, dy, distance: Math.hypot(dx, dy) };
	});

	const onCircumference = candidates
		.filter((candidate) => candidate.distance >= radius)
		.sort(
			(a, b) =>
				Math.abs(Math.atan2(a.dy, a.dx)) - Math.abs(Math.atan2(b.dy, b.dx)),
		)[0];

	if (onCircumference && onCircumference.distance > 0) {
		const scale = radius / onCircumference.distance;
		return {
			x: center.x + onCircumference.dx * scale,
			y: center.y + onCircumference.dy * scale,
		};
	}

	// The circle encloses the viewport: no direction reaches the circumference
	// on screen. Grip it along the most open one instead.
	const widest = candidates.reduce((best, candidate) =>
		candidate.distance > best.distance ? candidate : best,
	);
	if (widest.distance <= 0) return { x: center.x + radius, y: center.y };
	const direction = {
		x: widest.dx / widest.distance,
		y: widest.dy / widest.distance,
	};
	const reach =
		distanceToViewportEdge(center, direction, viewport) -
		COMPASS_HANDLE_MARGIN_PX;
	const offset = Math.min(
		radius,
		Math.max(compassDragRadiusPx(radius) + 20, reach),
	);
	return {
		x: center.x + direction.x * offset,
		y: center.y + direction.y * offset,
	};
}
