import { describe, expect, it } from "vitest";
import {
	overlayResized,
	transformReferencePlacement,
} from "./referenceViewport";

describe("reference viewport placement", () => {
	it("keeps the image registered to the board while zooming and panning", () => {
		const original = { x: 200, y: 100, width: 300 };
		const identity = [1, 0, 0, 1, 0, 0] as const;
		const zoomed = [2, 0, 0, 2, -100, -50] as const;

		const transformed = transformReferencePlacement(original, identity, zoomed);
		expect(transformed).toEqual({ x: 300, y: 188, width: 600 });
		expect(transformReferencePlacement(transformed, zoomed, identity)).toEqual(
			original,
		);
	});

	it("treats a hide-and-restore round trip as no resize", () => {
		const size = { width: 390, height: 844 };
		expect(overlayResized(null, size)).toBe(true);
		expect(overlayResized(size, { width: 390.4, height: 843.7 })).toBe(false);
		expect(overlayResized(size, { width: 844, height: 390 })).toBe(true);
	});
});
