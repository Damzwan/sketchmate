export const PRECISION_RANGE_INSET_PX = 9;
export const PRECISION_DRAG_THRESHOLD_PX = 28;
export const PRECISION_DRAG_RELEASE_PX = 18;
/** Log tracks already give small values a lot of room, so the away-from-track
 *  refinement only has to tame the top of the range. */
export const FINE_DRAG_SENSITIVITY = 0.25;

/** Track fraction → value. Anchors interpolate linearly between each pair. */
export interface RangeAnchor {
	at: number;
	value: number;
}

export type RangeCurve = "linear" | "log" | RangeAnchor[];

/**
 * Track budget spent where the strokes are. A log curve is even in *ratio*, so
 * it hands 0.1–1 a third of the track — a decade almost nobody draws in — while
 * 5–20, where most strokes live, gets squeezed. These anchors give 5–20 nearly
 * half the track and still reach 120 for fills.
 */
export const STROKE_WIDTH_CURVE: RangeAnchor[] = [
	{ at: 0, value: 0.1 },
	{ at: 0.1, value: 1 },
	{ at: 0.25, value: 5 },
	{ at: 0.7, value: 20 },
	{ at: 0.88, value: 50 },
	{ at: 1, value: 120 },
];

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function decimalPlaces(value: number): number {
	const fraction = String(value).split(".")[1];
	return fraction?.length ?? 0;
}

export function snapRangeValue(
	value: number,
	min: number,
	max: number,
	step: number,
): number {
	const safeStep = Math.max(Number.EPSILON, step);
	// Grid anchored at zero, not at `min`: anchoring at 0.1 put a half-unit step
	// on 23.6 / 24.1 instead of the round numbers people expect to land on.
	const snapped = Math.round(value / safeStep) * safeStep;
	return Number(
		clamp(snapped, min, max).toFixed(
			Math.max(decimalPlaces(min), decimalPlaces(max), decimalPlaces(step)),
		),
	);
}

/**
 * Step that matches how the value is read at that magnitude: tenths where a
 * liner is being tuned, halves and units where the brush is a fill tool. A
 * single step across 0.1–120 is either too coarse to pick 1.4 or so fine that
 * the top of the range needs a thousand of them.
 */
export function strokeWidthStep(value: number): number {
	if (value < 10) return 0.1;
	if (value < 40) return 0.5;
	return 1;
}

export function snapStrokeWidth(
	value: number,
	min: number,
	max: number,
): number {
	return snapRangeValue(value, min, max, strokeWidthStep(value));
}

/**
 * Track position (0–1) for a value. The log curve spends track proportionally
 * to *ratio* rather than to difference, so every pixel is the same percentage
 * change: 0.1–20 — where drawing happens — takes ~75% of a 0.1–120 track, and
 * the fill widths above it stay reachable in one short flick.
 */
export function normFromValue(
	value: number,
	min: number,
	max: number,
	curve: RangeCurve = "linear",
): number {
	if (max <= min) return 0;
	if (Array.isArray(curve)) {
		const points = anchorPoints(curve, min, max);
		for (let i = 1; i < points.length; i++) {
			const previous = points[i - 1];
			const current = points[i];
			if (value <= current.value) {
				const span = current.value - previous.value || 1;
				return clamp(
					previous.at +
						((value - previous.value) / span) * (current.at - previous.at),
					0,
					1,
				);
			}
		}
		return 1;
	}
	if (curve === "log" && min > 0) {
		return clamp(Math.log(value / min) / Math.log(max / min), 0, 1);
	}
	return clamp((value - min) / (max - min), 0, 1);
}

export function valueFromNorm(
	norm: number,
	min: number,
	max: number,
	curve: RangeCurve = "linear",
): number {
	const t = clamp(norm, 0, 1);
	if (Array.isArray(curve)) {
		const points = anchorPoints(curve, min, max);
		for (let i = 1; i < points.length; i++) {
			const previous = points[i - 1];
			const current = points[i];
			if (t <= current.at) {
				const span = current.at - previous.at || 1;
				return (
					previous.value +
					((t - previous.at) / span) * (current.value - previous.value)
				);
			}
		}
		return max;
	}
	if (curve === "log" && min > 0) return min * (max / min) ** t;
	return min + t * (max - min);
}

/** Anchors sorted and pinned to the track ends, so a curve can omit either. */
function anchorPoints(
	anchors: RangeAnchor[],
	min: number,
	max: number,
): RangeAnchor[] {
	const points = [...anchors].sort((a, b) => a.at - b.at);
	if (points[0]?.at !== 0) points.unshift({ at: 0, value: min });
	if (points[points.length - 1]?.at !== 1) points.push({ at: 1, value: max });
	return points;
}

/** Normalised track position of a client X coordinate, inset-aware. */
export function rangeNormAtClientX(
	clientX: number,
	trackLeft: number,
	trackWidth: number,
): number {
	const inset = Math.min(PRECISION_RANGE_INSET_PX, trackWidth / 2);
	const usableWidth = Math.max(1, trackWidth - inset * 2);
	return clamp((clientX - trackLeft - inset) / usableWidth, 0, 1);
}

export function rangeUsableWidth(trackWidth: number): number {
	return Math.max(
		1,
		trackWidth - Math.min(PRECISION_RANGE_INSET_PX, trackWidth / 2) * 2,
	);
}

export function rangeValueAtClientX(
	clientX: number,
	trackLeft: number,
	trackWidth: number,
	min: number,
	max: number,
	step: number,
	curve: RangeCurve = "linear",
): number {
	const norm = rangeNormAtClientX(clientX, trackLeft, trackWidth);
	return snapRangeValue(valueFromNorm(norm, min, max, curve), min, max, step);
}
