// @vitest-environment jsdom
//
// renderQuality.config reads `@ionic/vue`'s isPlatform at module scope, which
// touches `window`. The sizing maths itself is pure.
import { describe, expect, it } from "vitest";
import { MAX_RENDER_SCALE } from "@/draw/config/renderQuality.config";
import {
	FLATTENED_LAYER_MAX_DIMENSION,
	FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION,
	flattenRasterSize,
} from "./savedObjectFlatten";

const MAX_DIM = FLATTENED_LAYER_MAX_DIMENSION;

describe("flatten raster sizing", () => {
	it("renders small content at full render scale", () => {
		// The "draw a couple of lines and they get worse" case: at scale 1 the
		// raster carries fewer pixels than the vector strokes it replaced, because
		// the canvas paints it onto a MAX_RENDER_SCALE backing store.
		const extent = 400;
		expect(flattenRasterSize(extent, MAX_DIM) / extent).toBe(MAX_RENDER_SCALE);
	});

	it("never upscales past the render scale", () => {
		// More pixels than the compositor can show is pure cost.
		for (const extent of [10, 100, 800]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeLessThanOrEqual(
				extent * MAX_RENDER_SCALE,
			);
		}
	});

	it("caps a big drawing at the ceiling rather than growing without bound", () => {
		// Staying ONE object means a big drawing does lose some resolution — the
		// trade the flatten confirmation warns about. What must not happen is an
		// unbounded canvas allocation.
		for (const extent of [4_000, 20_000, 100_000]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeLessThanOrEqual(MAX_DIM);
		}
	});

	it("keeps a room flatten inside the wire budget", () => {
		// A replicated raster crosses the wire on the add and inside every undo of
		// it, so a room trades resolution for a bounded payload.
		const size = flattenRasterSize(4_000, FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION);
		expect(size).toBeLessThanOrEqual(FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION);
	});

	it("always produces a positive size for real content", () => {
		for (const extent of [1, 50, 4_000, 100_000]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeGreaterThan(0);
		}
	});
});
