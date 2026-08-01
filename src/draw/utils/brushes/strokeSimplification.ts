// strokeSimplification.ts
//
// How aggressively a freehand stroke's geometry is reduced, as a function of
// the stroke's own width and the zoom it was drawn at.
//
// WHY THIS EXISTS
//
// The pencil brush ran ONE fixed Douglas-Peucker tolerance (0.3 world units)
// for every stroke, and that interacts badly with fabric's own point capture.
// `PencilBrush.decimate` is in SCREEN pixels — it divides by zoom internally —
// while the DP tolerance is in WORLD units and did not. The two therefore pull
// in opposite directions:
//
//   zoom 0.25 : capture keeps points ≥1.2 world units apart, DP at 0.3 then has
//               almost nothing left to remove.
//   zoom 4    : capture keeps points ≥0.075 world units apart, DP at 0.3 removes
//               a large fraction of them.
//
// i.e. the engine simplified HARDEST when zoomed in (where detail is visible and
// wanted) and least when zoomed out with a fat brush (where it is invisible and
// the point count is pure cost). Users filling large areas with a wide pencil —
// common now that layers make block-filling worthwhile — paid the worst case of
// both: thousands of retained segments per stroke, each one re-stroked per tile,
// per bake, forever.
//
// TWO TERMS, JUSTIFIED SEPARATELY
//
// 1. WIDTH. Douglas-Peucker's tolerance is the maximum distance a dropped point
//    may sit from the retained line. That deviation is invisible while it stays
//    small relative to the stroke's own width: a 40-unit-wide stroke hides a
//    1-unit deviation completely, a 0.5-unit hairline hides nothing. This term
//    is zoom-INDEPENDENT on purpose — the geometry is permanent, so a stroke
//    must not end up coarse forever because of the viewport it happened to be
//    drawn at.
//
// 2. INPUT RESOLUTION. A finger cannot express detail finer than one screen
//    pixel, so at zoom z there is no real information below 1/z world units.
//    Retaining points below that is storing digitiser noise. This term IS
//    zoom-derived, and it is a FLOOR rather than a multiplier — it never
//    discards detail the user could actually see and place, it only declines to
//    keep detail they could not have produced. Same reasoning fabric already
//    applies to `decimate`.
//
// The two are combined with `max`, not multiplied: each is independently a
// reason the extra points are worthless.

/**
 * Tolerance as a fraction of stroke width.
 *
 * Anchored so the default brush reproduces the previous behaviour exactly:
 * BASE_BRUSH_SIZE (10) × 0.03 = 0.3, the old hard-coded constant. Every change
 * in behaviour is therefore relative to width, not a blanket shift.
 */
const WIDTH_TOLERANCE_RATIO = 0.03;

/**
 * Input-resolution floor, in SCREEN pixels, converted to world units by the
 * caller's zoom. Matches `PencilBrush.decimate`'s default order of magnitude so
 * DP never targets detail the capture stage already refused to record.
 *
 * Chosen to coincide with the width term at the default brush and zoom 1
 * (10 × 0.03 = 0.3), so the anchor case is exactly the old constant no matter
 * which of the two terms wins.
 */
const SCREEN_TOLERANCE_PX = 0.3;

/** Below this DP is a no-op in practice and only costs a pass over the points. */
const MIN_TOLERANCE = 0.05;

/**
 * Hard ceiling, in world units.
 *
 * Without it a very wide brush would simplify a curve into visible straight
 * segments: the deviation stays invisible against the stroke body, but the
 * stroke's own OUTLINE starts to show corners, which reads as a rendering bug
 * rather than as compression.
 */
const MAX_TOLERANCE = 2.5;

/**
 * Douglas-Peucker tolerance in WORLD units for one stroke.
 *
 * @param strokeWidth brush width in world units.
 * @param zoom viewport zoom the stroke was drawn at.
 */
export function strokeSimplifyTolerance(
	strokeWidth: number,
	zoom: number,
): number {
	const width = Number.isFinite(strokeWidth) ? Math.max(0, strokeWidth) : 0;
	const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

	const widthTerm = width * WIDTH_TOLERANCE_RATIO;
	const inputTerm = SCREEN_TOLERANCE_PX / safeZoom;

	return Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, widthTerm, inputTerm));
}

/**
 * Capture-time decimation distance, in SCREEN pixels (fabric divides by zoom
 * itself, so this must NOT be pre-divided).
 *
 * Dropping a point here is strictly better than dropping it in DP afterwards:
 * it never enters `_points`, is never stroked onto the live overlay, and never
 * reaches `convertPointsToSVGPath`. Scaled by the stroke's on-screen width for
 * the same perceptual reason as the tolerance above.
 *
 * Capped low on purpose. `decimate` also governs the LIVE preview drawn on the
 * top context while the finger is down, so a large value makes the stroke look
 * angular as it is being drawn even though the committed path is fine. The
 * conservative value here leaves most of the reduction to DP, which runs once,
 * after the stroke is complete, where angularity costs nothing.
 */
export function strokeDecimateDistance(
	strokeWidth: number,
	zoom: number,
): number {
	const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
	const screenWidth = Math.max(0, strokeWidth) * safeZoom;
	return Math.min(2, Math.max(0.3, screenWidth * 0.02));
}
