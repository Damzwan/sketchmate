import { describe, expect, it } from "vitest";
import {
	charcoalTextureDimension,
	charcoalTextureSupersample,
} from "./CharcoalBrush";

describe("charcoal texture resolution", () => {
	it("sharpens common widths without increasing the old maximum stamp size", () => {
		expect(charcoalTextureSupersample(3)).toBe(4);
		expect(charcoalTextureSupersample(25)).toBeCloseTo(2.56);
		expect(charcoalTextureSupersample(50)).toBe(2);

		for (let widthTenths = 1; widthTenths <= 500; widthTenths++) {
			expect(charcoalTextureDimension(widthTenths / 10)).toBeLessThanOrEqual(
				200,
			);
		}
	});
});
