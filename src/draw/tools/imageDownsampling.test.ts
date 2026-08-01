import { describe, expect, it } from "vitest";
import { containImageDimensions } from "./imageDownsampling";

describe("image downsampling", () => {
	it("contains landscape and portrait images without distortion", () => {
		expect(containImageDimensions(4_000, 2_000, 256)).toEqual({
			width: 256,
			height: 128,
		});
		expect(containImageDimensions(1_000, 4_000, 256)).toEqual({
			width: 64,
			height: 256,
		});
	});

	it("does not upscale a small image", () => {
		expect(containImageDimensions(80, 40, 256)).toEqual({
			width: 80,
			height: 40,
		});
	});
});
