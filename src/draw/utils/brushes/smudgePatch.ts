/**
 * The pixel maths behind the smudge brush, kept free of canvas/DOM so it can be
 * reasoned about (and tested) on its own.
 *
 * The brush works on a snapshot of the visible canvas, smears pixels around
 * inside it, and then has to hand the result back to the document as ONE
 * object. Everything tricky about that lives here.
 */

/** An axis-aligned box in device pixels, or `null` for "nothing touched yet". */
export interface PixelBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function growBounds(
	bounds: PixelBounds | null,
	x: number,
	y: number,
	radius: number,
): PixelBounds {
	const minX = x - radius;
	const minY = y - radius;
	const maxX = x + radius;
	const maxY = y + radius;
	if (!bounds) return { minX, minY, maxX, maxY };
	return {
		minX: Math.min(bounds.minX, minX),
		minY: Math.min(bounds.minY, minY),
		maxX: Math.max(bounds.maxX, maxX),
		maxY: Math.max(bounds.maxY, maxY),
	};
}

export function unionBounds(
	a: PixelBounds | null,
	b: PixelBounds | null,
): PixelBounds | null {
	if (!a) return b;
	if (!b) return a;
	return {
		minX: Math.min(a.minX, b.minX),
		minY: Math.min(a.minY, b.minY),
		maxX: Math.max(a.maxX, b.maxX),
		maxY: Math.max(a.maxY, b.maxY),
	};
}

/** Snap outward to whole pixels and clip to the surface. `null` if empty. */
export function clampBounds(
	bounds: PixelBounds | null,
	surfaceWidth: number,
	surfaceHeight: number,
): PixelBounds | null {
	if (!bounds) return null;
	const minX = Math.max(0, Math.floor(bounds.minX));
	const minY = Math.max(0, Math.floor(bounds.minY));
	const maxX = Math.min(surfaceWidth, Math.ceil(bounds.maxX));
	const maxY = Math.min(surfaceHeight, Math.ceil(bounds.maxY));
	if (maxX <= minX || maxY <= minY) return null;
	return { minX, minY, maxX, maxY };
}

/**
 * Distance between stamps along the stroke, in device pixels.
 *
 * Proportional to the tip, never below one pixel: a fixed spacing either leaves
 * a dotted trail on a big tip or lays hundreds of overlapping stamps per
 * centimetre on a small one. Tying it to the radius keeps the per-length cost
 * roughly constant instead of exploding as the brush grows.
 */
export function smudgeSpacing(radius: number): number {
	return Math.max(1, radius * 0.22);
}

/**
 * Sample positions from `from` (exclusive) to `to` (inclusive).
 *
 * Capped: a pointer that teleports across the screen — a dropped frame, a
 * palm-rejected finger reappearing elsewhere — must not turn into thousands of
 * stamps on one move event.
 */
export function stampPositions(
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	spacing: number,
	maxSteps = 64,
): { x: number; y: number }[] {
	const dx = toX - fromX;
	const dy = toY - fromY;
	const distance = Math.hypot(dx, dy);
	if (!Number.isFinite(distance) || distance <= 0) return [{ x: toX, y: toY }];

	const steps = Math.min(maxSteps, Math.max(1, Math.round(distance / spacing)));
	const out: { x: number; y: number }[] = [];
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		out.push({ x: fromX + dx * t, y: fromY + dy * t });
	}
	return out;
}

/**
 * Backing-store size for the committed patch.
 *
 * The patch is a bitmap that goes into the document, the draft, the history
 * entry and — in a room — over the wire, so it cannot be "however many pixels
 * the viewport happened to have". Past the budget it loses SHARPNESS instead of
 * failing, which for a smeared region is close to invisible. Mirrors the same
 * reasoning as `fitTextureRaster` in brush.helpers.
 */
const MAX_PATCH_PIXELS = 1024 * 1024;
const MAX_PATCH_DIMENSION = 1600;

export function fitPatchRaster(
	width: number,
	height: number,
): { scale: number; width: number; height: number } | null {
	if (!(width > 0) || !(height > 0)) return null;
	const scale = Math.min(
		1,
		MAX_PATCH_DIMENSION / width,
		MAX_PATCH_DIMENSION / height,
		Math.sqrt(MAX_PATCH_PIXELS / (width * height)),
	);
	return {
		scale,
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/** Below this much change a pixel counts as untouched. */
const DEAD_ZONE = 2;
/** Change (0-255) at which the patch becomes fully opaque. */
const FULL_ALPHA_AT = 20;

/**
 * Turn "the smudged snapshot" into "only what the smudge CHANGED", in place.
 *
 * The brush smears a copy of the composited canvas, background included. Laying
 * that copy down as-is would work visually and be wrong in every other way: it
 * bakes the background colour into an opaque rectangle, and every
 * semi-transparent stroke underneath would be drawn a second time through it
 * (the 0.45 → 0.70 doubling the engine's invariant #4 is about).
 *
 * So each pixel's alpha becomes how far it moved from the original. Untouched
 * pixels drop to fully transparent — no rectangle, no doubling, nothing baked —
 * and the edge of the smear feathers out on its own.
 *
 * The blend that results is `original*(1-a) + smudged*a` rather than the
 * smudged value exactly, but the error is bounded by `(1-a) * FULL_ALPHA_AT`,
 * i.e. a couple of levels out of 255 at its worst, and zero wherever the smudge
 * actually did something.
 *
 * @returns how many pixels survived; 0 means the stroke changed nothing.
 */
export function applyPatchAlpha(
	smudged: Uint8ClampedArray,
	original: Uint8ClampedArray,
): number {
	let kept = 0;
	for (let i = 0; i < smudged.length; i += 4) {
		const difference = Math.max(
			Math.abs(smudged[i] - original[i]),
			Math.abs(smudged[i + 1] - original[i + 1]),
			Math.abs(smudged[i + 2] - original[i + 2]),
			Math.abs(smudged[i + 3] - original[i + 3]),
		);
		const ramp = (difference - DEAD_ZONE) / (FULL_ALPHA_AT - DEAD_ZONE);
		const alpha = Math.round(Math.max(0, Math.min(1, ramp)) * 255);
		// Never louder than the smear itself: a smudge into empty canvas must stay
		// as transparent as the pixels it carried there.
		smudged[i + 3] = Math.min(smudged[i + 3], alpha);
		if (smudged[i + 3] > 0) kept++;
	}
	return kept;
}

/** Per-stamp opacity for a 0-100 strength dial. */
export function smudgeStampAlpha(strength: number): number {
	const clamped = Math.max(0, Math.min(100, strength)) / 100;
	return 0.12 + clamped * 0.5;
}
