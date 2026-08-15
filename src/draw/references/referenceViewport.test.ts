import { describe, expect, it } from "vitest";
import { transformReferencePlacement } from "./referenceViewport";

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
});
