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
	it("snaps every edge to the render pixel grid", () => {
		expect(
			snapRectToDevicePixels(
				{ left: 10.24, top: 20.26, width: 30.37, height: 40.38 },
				2,
			),
		).toEqual({ left: 10, top: 20.5, width: 30.5, height: 40 });
	});

	it("leaves the rectangle alone when DPR is invalid", () => {
		const rect = { left: 1.2, top: 2.3, width: 4.5, height: 6.7 };
		expect(snapRectToDevicePixels(rect, 0)).toBe(rect);
	});
});
