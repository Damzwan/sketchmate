import { describe, expect, it } from "vitest";
import {
	rectangularHoleClipPath,
	snapRectToDevicePixels,
} from "./vacatedLayerMask";

describe("vacated layer mask", () => {
	it("cuts the vacated rectangle out of the committed canvas", () => {
		expect(
			rectangularHoleClipPath(
				{ width: 400, height: 300 },
				{ left: 20, top: 30, width: 100, height: 50 },
			),
		).toContain("20px 30px, 20px 80px, 120px 80px, 120px 30px, 20px 30px");
	});

	it("clips an edge-overlapping hole to the canvas", () => {
		expect(
			rectangularHoleClipPath(
				{ width: 400, height: 300 },
				{ left: -20, top: 250, width: 80, height: 100 },
			),
		).toContain("0px 250px, 0px 300px, 60px 300px, 60px 250px");
	});

	it("does not mask the canvas for an off-screen patch", () => {
		expect(
			rectangularHoleClipPath(
				{ width: 400, height: 300 },
				{ left: 500, top: 30, width: 100, height: 50 },
			),
		).toBeNull();
	});
});

describe("snapRectToDevicePixels", () => {
	it("snaps every edge INWARD onto the render pixel grid", () => {
		// Inward, never outward: the rect is a hole, and a hole wider than the
		// pixels painted behind it shows bare background as a seam.
		expect(
			snapRectToDevicePixels(
				{ left: 10.24, top: 20.26, width: 30.37, height: 40.38 },
				2,
			),
		).toEqual({ left: 10.5, top: 20.5, width: 30, height: 40 });
	});

	it("never grows the rectangle it was given", () => {
		const dpr = 3;
		for (const rect of [
			{ left: 0.9, top: 0.1, width: 10.9, height: 10.1 },
			{ left: 5.5, top: 5.5, width: 20.5, height: 20.5 },
			{ left: 12.34, top: 56.78, width: 90.12, height: 34.56 },
		]) {
			const snapped = snapRectToDevicePixels(rect, dpr);
			expect(snapped.left).toBeGreaterThanOrEqual(rect.left);
			expect(snapped.top).toBeGreaterThanOrEqual(rect.top);
			expect(snapped.left + snapped.width).toBeLessThanOrEqual(
				rect.left + rect.width,
			);
			expect(snapped.top + snapped.height).toBeLessThanOrEqual(
				rect.top + rect.height,
			);
		}
	});

	it("leaves the rectangle alone when DPR is invalid", () => {
		const rect = { left: 1.2, top: 2.3, width: 4.5, height: 6.7 };
		expect(snapRectToDevicePixels(rect, 0)).toBe(rect);
	});
});
