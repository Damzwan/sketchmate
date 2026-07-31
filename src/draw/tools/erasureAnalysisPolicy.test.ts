import { describe, expect, it } from "vitest";
import {
	canRunPreciseErasureCheck,
	confirmsEffectiveErasure,
	hasVisibleAlpha,
	MAX_PRECISE_ERASURE_PIXELS,
	measureAlphaCoverage,
	preciseErasureMultiplier,
} from "./erasureAnalysisPolicy";

describe("erasure analysis policy", () => {
	it("keeps an object when even one low-alpha pixel remains", () => {
		const pixels = new Uint8ClampedArray(40 * 4);
		pixels[3] = 1;

		expect(hasVisibleAlpha(pixels)).toBe(true);
	});

	it("removes only faint remnants that are negligible relative to the object", () => {
		const faintRemainder = measureAlphaCoverage(alphaPixels(100, 8));
		const largeObject = measureAlphaCoverage(alphaPixels(1_000, 255));
		const smallObject = measureAlphaCoverage(alphaPixels(100, 255));

		expect(confirmsEffectiveErasure(faintRemainder, largeObject)).toBe(true);
		expect(confirmsEffectiveErasure(faintRemainder, smallObject)).toBe(false);
	});

	it("keeps a strongly visible pixel regardless of relative area", () => {
		const opaquePixel = measureAlphaCoverage(alphaPixels(1, 255));
		const largeObject = measureAlphaCoverage(alphaPixels(10_000, 255));

		expect(confirmsEffectiveErasure(opaquePixel, largeObject)).toBe(false);
	});

	it("requires proof that the object renders without erasing", () => {
		const empty = measureAlphaCoverage(alphaPixels(1, 0));

		expect(confirmsEffectiveErasure(empty, empty)).toBe(false);
		expect(
			confirmsEffectiveErasure(null, { alphaMass: 100, maxAlpha: 255 }),
		).toBe(false);
	});

	it("refuses precise checks that exceed the worker memory budget", () => {
		expect(canRunPreciseErasureCheck(1024, 1024)).toBe(true);
		expect(canRunPreciseErasureCheck(MAX_PRECISE_ERASURE_PIXELS + 1, 1)).toBe(
			false,
		);
	});

	it("checks small objects at higher resolution without exceeding the budget", () => {
		expect(preciseErasureMultiplier(100, 100)).toBe(4);
		expect(preciseErasureMultiplier(1024, 1024)).toBe(1);
	});
});

function alphaPixels(count: number, alpha: number): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(count * 4);
	for (let index = 3; index < pixels.length; index += 4) pixels[index] = alpha;
	return pixels;
}
