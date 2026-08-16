import { describe, expect, it } from "vitest";
import {
	applyPatchAlpha,
	clampBounds,
	fitPatchRaster,
	growBounds,
	smudgeSpacing,
	smudgeStampAlpha,
	stampPositions,
	unionBounds,
} from "@/draw/utils/brushes/smudgePatch";

const pixels = (values: number[][]) =>
	new Uint8ClampedArray(values.flat()) as Uint8ClampedArray;

describe("bounds", () => {
	it("grows around a stamp and unions with previous stamps", () => {
		const first = growBounds(null, 10, 10, 4);
		expect(first).toEqual({ minX: 6, minY: 6, maxX: 14, maxY: 14 });

		const both = unionBounds(first, growBounds(null, 30, 5, 2));
		expect(both).toEqual({ minX: 6, minY: 3, maxX: 32, maxY: 14 });
	});

	it("snaps outward and clips to the surface", () => {
		expect(clampBounds({ minX: -3.7, minY: 1.2, maxX: 4.1, maxY: 9.9 }, 5, 8)) //
			.toEqual({ minX: 0, minY: 1, maxX: 5, maxY: 8 });
	});

	it("reports a box entirely off the surface as empty", () => {
		expect(
			clampBounds({ minX: 40, minY: 40, maxX: 50, maxY: 50 }, 20, 20),
		).toBeNull();
		expect(clampBounds(null, 20, 20)).toBeNull();
	});
});

describe("stamp placement", () => {
	it("spaces stamps with the tip, never below a pixel", () => {
		expect(smudgeSpacing(100)).toBeCloseTo(22);
		expect(smudgeSpacing(0.5)).toBe(1);
	});

	it("walks the segment and always lands on the destination", () => {
		const steps = stampPositions(0, 0, 10, 0, 2);
		expect(steps).toHaveLength(5);
		expect(steps.at(-1)).toEqual({ x: 10, y: 0 });
	});

	it("stamps once when the pointer has not moved", () => {
		expect(stampPositions(4, 4, 4, 4, 2)).toEqual([{ x: 4, y: 4 }]);
	});

	it("caps a teleporting pointer instead of stamping thousands of times", () => {
		expect(stampPositions(0, 0, 100000, 0, 1).length).toBe(64);
	});
});

describe("fitPatchRaster", () => {
	it("keeps a normal patch at full resolution", () => {
		expect(fitPatchRaster(400, 300)).toEqual({
			scale: 1,
			width: 400,
			height: 300,
		});
	});

	it("scales an oversized patch down instead of failing", () => {
		const raster = fitPatchRaster(4000, 3000)!;
		expect(raster.scale).toBeLessThan(1);
		expect(raster.width).toBeLessThanOrEqual(1600);
		expect(raster.width * raster.height).toBeLessThanOrEqual(
			1024 * 1024 + 1024,
		);
	});

	it("refuses a degenerate box", () => {
		expect(fitPatchRaster(0, 10)).toBeNull();
	});
});

describe("applyPatchAlpha", () => {
	it("erases pixels the smudge did not change", () => {
		const smudged = pixels([[10, 20, 30, 255]]);
		const kept = applyPatchAlpha(smudged, pixels([[10, 20, 30, 255]]));

		expect(kept).toBe(0);
		expect(smudged[3]).toBe(0);
	});

	it("keeps a strongly changed pixel fully opaque, colour untouched", () => {
		const smudged = pixels([[200, 0, 0, 255]]);
		const kept = applyPatchAlpha(smudged, pixels([[0, 0, 0, 255]]));

		expect(kept).toBe(1);
		expect([...smudged]).toEqual([200, 0, 0, 255]);
	});

	it("feathers a barely changed pixel rather than dropping or keeping it whole", () => {
		const smudged = pixels([[11, 0, 0, 255]]);
		applyPatchAlpha(smudged, pixels([[0, 0, 0, 255]]));

		expect(smudged[3]).toBeGreaterThan(0);
		expect(smudged[3]).toBeLessThan(255);
	});

	it("never makes a smear more opaque than the colour it carried", () => {
		// Smudging into empty canvas: the smear itself is half transparent, and
		// the patch must not turn that into a solid mark.
		const smudged = pixels([[255, 0, 0, 40]]);
		applyPatchAlpha(smudged, pixels([[0, 0, 0, 0]]));

		expect(smudged[3]).toBe(40);
	});
});

describe("smudgeStampAlpha", () => {
	it("rises with strength and stays inside a usable range", () => {
		expect(smudgeStampAlpha(0)).toBeCloseTo(0.12);
		expect(smudgeStampAlpha(100)).toBeCloseTo(0.62);
		expect(smudgeStampAlpha(50)).toBeGreaterThan(smudgeStampAlpha(10));
	});

	it("clamps out-of-range dials", () => {
		expect(smudgeStampAlpha(-50)).toBeCloseTo(0.12);
		expect(smudgeStampAlpha(500)).toBeCloseTo(0.62);
	});
});
