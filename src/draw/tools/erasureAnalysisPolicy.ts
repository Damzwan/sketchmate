export const MAX_PRECISE_ERASURE_PIXELS = 1_048_576;
export const MAX_RESIDUAL_ALPHA = 64;
export const MAX_RESIDUAL_ALPHA_MASS = 16;
export const MAX_RESIDUAL_RATIO = 0.005;

export interface AlphaCoverage {
	alphaMass: number;
	maxAlpha: number;
}

export function measureAlphaCoverage(pixels: ArrayLike<number>): AlphaCoverage {
	let alphaMass = 0;
	let maxAlpha = 0;
	for (let index = 3; index < pixels.length; index += 4) {
		const alpha = pixels[index];
		alphaMass += alpha / 255;
		maxAlpha = Math.max(maxAlpha, alpha);
	}
	return { alphaMass, maxAlpha };
}

export function hasVisibleAlpha(
	pixels: ArrayLike<number>,
	minimumAlpha = 0,
): boolean {
	for (let index = 3; index < pixels.length; index += 4) {
		if (pixels[index] > minimumAlpha) return true;
	}
	return false;
}

export function canRunPreciseErasureCheck(
	width: number,
	height: number,
): boolean {
	return preciseErasureMultiplier(width, height) !== null;
}

export function preciseErasureMultiplier(
	width: number,
	height: number,
): number | null {
	const validDimensions =
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0;
	if (!validDimensions) return null;

	const pixelsAtOneX = Math.ceil(width) * Math.ceil(height);
	if (pixelsAtOneX > MAX_PRECISE_ERASURE_PIXELS) return null;
	return Math.min(4, Math.sqrt(MAX_PRECISE_ERASURE_PIXELS / pixelsAtOneX));
}

export function confirmsEffectiveErasure(
	clipped: AlphaCoverage | null,
	unerased: AlphaCoverage | null,
): boolean {
	if (!clipped || !unerased || unerased.alphaMass <= 0) return false;
	return (
		clipped.maxAlpha <= MAX_RESIDUAL_ALPHA &&
		clipped.alphaMass <= MAX_RESIDUAL_ALPHA_MASS &&
		clipped.alphaMass / unerased.alphaMass <= MAX_RESIDUAL_RATIO
	);
}
