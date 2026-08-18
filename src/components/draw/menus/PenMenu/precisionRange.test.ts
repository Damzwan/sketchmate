import { describe, expect, it } from "vitest";
import {
	normFromValue,
	rangeNormAtClientX,
	rangeValueAtClientX,
	STROKE_WIDTH_CURVE,
	snapRangeValue,
	snapStrokeWidth,
	strokeWidthStep,
	valueFromNorm,
} from "@/components/draw/menus/PenMenu/precisionRange";

describe("precision range math", () => {
	it("keeps a linear track linear from minimum to maximum", () => {
		expect(rangeValueAtClientX(9, 0, 218, 0.1, 120, 0.1)).toBe(0.1);
		expect(rangeValueAtClientX(109, 0, 218, 0.1, 120, 0.1)).toBe(60.1);
		expect(rangeValueAtClientX(209, 0, 218, 0.1, 120, 0.1)).toBe(120);
	});

	it("gives the drawing range most of a log track", () => {
		// 0.1–20 is where strokes are drawn; above it the brush is a fill tool.
		expect(normFromValue(20, 0.1, 120, "log")).toBeGreaterThan(0.7);
		expect(normFromValue(20, 0.1, 120, "linear")).toBeLessThan(0.2);
	});

	it("spends the stroke-width track on 5–20, not on 0.1–1", () => {
		const share = (low: number, high: number) =>
			normFromValue(high, 0.1, 120, STROKE_WIDTH_CURVE) -
			normFromValue(low, 0.1, 120, STROKE_WIDTH_CURVE);

		expect(share(5, 20)).toBeCloseTo(0.45, 2);
		expect(share(0.1, 1)).toBeCloseTo(0.1, 2);
		// The log curve is the thing being corrected: it gave 0.1–1 a third.
		expect(
			normFromValue(1, 0.1, 120, "log") - normFromValue(0.1, 0.1, 120, "log"),
		).toBeGreaterThan(0.3);
	});

	it("round-trips anchored positions and stays monotonic", () => {
		for (const value of [0.1, 0.5, 1, 3, 5, 12, 20, 35, 50, 90, 120]) {
			const norm = normFromValue(value, 0.1, 120, STROKE_WIDTH_CURVE);
			expect(valueFromNorm(norm, 0.1, 120, STROKE_WIDTH_CURVE)).toBeCloseTo(
				value,
				6,
			);
		}
		let previous = -1;
		for (let t = 0; t <= 1.0001; t += 0.02) {
			const value = valueFromNorm(t, 0.1, 120, STROKE_WIDTH_CURVE);
			expect(value).toBeGreaterThan(previous);
			previous = value;
		}
	});

	it("round-trips a log position back to its value", () => {
		for (const value of [0.1, 0.4, 1, 4.5, 20, 119, 120]) {
			const norm = normFromValue(value, 0.1, 120, "log");
			expect(valueFromNorm(norm, 0.1, 120, "log")).toBeCloseTo(value, 6);
		}
	});

	it("keeps every log pixel the same percentage change", () => {
		const step = 0.01;
		const low =
			valueFromNorm(0.2 + step, 0.1, 120, "log") /
			valueFromNorm(0.2, 0.1, 120, "log");
		const high =
			valueFromNorm(0.8 + step, 0.1, 120, "log") /
			valueFromNorm(0.8, 0.1, 120, "log");
		expect(low).toBeCloseTo(high, 6);
	});

	it("scales the snap step with the magnitude being edited", () => {
		expect(strokeWidthStep(1.4)).toBe(0.1);
		expect(strokeWidthStep(24)).toBe(0.5);
		expect(strokeWidthStep(90)).toBe(1);
		expect(snapStrokeWidth(4.26, 0.1, 120)).toBe(4.3);
		expect(snapStrokeWidth(23.4, 0.1, 120)).toBe(23.5);
		expect(snapStrokeWidth(90.4, 0.1, 120)).toBe(90);
	});

	it("snaps cleanly to tenths and clamps at both ends", () => {
		expect(snapRangeValue(4.26, 0.1, 120, 0.1)).toBe(4.3);
		expect(snapRangeValue(-10, 0.1, 120, 0.1)).toBe(0.1);
		expect(snapRangeValue(500, 0.1, 120, 0.1)).toBe(120);
	});

	it("clamps track positions to the usable width", () => {
		expect(rangeNormAtClientX(-50, 0, 218)).toBe(0);
		expect(rangeNormAtClientX(500, 0, 218)).toBe(1);
		expect(rangeNormAtClientX(109, 0, 218)).toBeCloseTo(0.5, 2);
	});
});
