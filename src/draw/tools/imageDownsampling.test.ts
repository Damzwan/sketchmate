import { describe, expect, it } from "vitest";
import {
	containImageDimensions,
	FLATTENED_IMAGE_MAX_DIMENSION,
	imageMaxDimensionFor,
	INSERTED_IMAGE_MAX_DIMENSION,
} from "./imageDownsampling";

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

	it("keeps inserted photos on the small bound", () => {
		expect(imageMaxDimensionFor({ type: "image" })).toBe(
			INSERTED_IMAGE_MAX_DIMENSION,
		);
		expect(imageMaxDimensionFor(undefined)).toBe(INSERTED_IMAGE_MAX_DIMENSION);
	});

	it("keeps a produced raster at full resolution", () => {
		// A flattened layer IS the drawing. Restoring a draft ran it through the
		// 256px inserted-photo bound and handed back a thumbnail.
		expect(imageMaxDimensionFor({ type: "image", flattened: true })).toBe(
			FLATTENED_IMAGE_MAX_DIMENSION,
		);
		// Derived from the constant, never literals: the bound is tuned for device
		// memory and a pinned number here just fails first when it moves.
		const max = FLATTENED_IMAGE_MAX_DIMENSION;
		expect(containImageDimensions(max, max / 2, max)).toEqual({
			width: max,
			height: max / 2,
		});
		expect(containImageDimensions(max * 2, max, max)).toEqual({
			width: max,
			height: max / 2,
		});
	});
});
