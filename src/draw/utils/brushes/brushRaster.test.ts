import { describe, expect, it } from "vitest";
import {
	fitTextureRaster,
	TEXTURE_SUPERSAMPLE,
} from "@/draw/utils/brushes/brush.helpers";

const MAX_PIXELS = 2048 * 2048;
const MAX_DIMENSION = 4096;

describe("procedural brush raster budget", () => {
	it("leaves an ordinary stroke bit-identical to the unclamped behaviour", () => {
		// The common case must not change: same supersample, same dimensions the
		// old `Math.ceil(w * dpr)` produced.
		const r = fitTextureRaster(300, 180)!;
		expect(r.scale).toBe(TEXTURE_SUPERSAMPLE);
		expect(r.width).toBe(Math.ceil(300 * TEXTURE_SUPERSAMPLE));
		expect(r.height).toBe(Math.ceil(180 * TEXTURE_SUPERSAMPLE));
	});

	it("keeps a full-quality stroke up to the budget edge", () => {
		const r = fitTextureRaster(1024, 1024)!;
		expect(r.scale).toBe(TEXTURE_SUPERSAMPLE);
		expect(r.width * r.height).toBeLessThanOrEqual(MAX_PIXELS + 4096);
	});

	it("degrades sharpness instead of failing on a huge stroke", () => {
		// 5000 x 5000 world units asked for 10000² RGBA = 400 MB, past the
		// browser's own canvas limits — a dead stroke, not a slow one.
		const r = fitTextureRaster(5000, 5000)!;
		expect(r.scale).toBeLessThan(TEXTURE_SUPERSAMPLE);
		expect(r.width).toBeLessThanOrEqual(MAX_DIMENSION);
		expect(r.height).toBeLessThanOrEqual(MAX_DIMENSION);
		expect(r.width * r.height).toBeLessThanOrEqual(MAX_PIXELS + MAX_DIMENSION);
	});

	it("bounds a long thin stroke by DIMENSION, not just by area", () => {
		// A 20,000 x 40 unit swipe is only 800k world px, so an area-only budget
		// would pass it — and then ask for a 40,000 px wide canvas.
		const r = fitTextureRaster(20000, 40)!;
		expect(r.width).toBeLessThanOrEqual(MAX_DIMENSION);
		expect(r.height).toBeGreaterThanOrEqual(1);
	});

	it("never returns a zero-sized backing store", () => {
		// A hairline stroke clamped hard must still be drawable; a 0-wide canvas
		// throws on drawImage.
		const r = fitTextureRaster(100000, 0.5)!;
		expect(r.width).toBeGreaterThanOrEqual(1);
		expect(r.height).toBeGreaterThanOrEqual(1);
	});

	it("refuses a degenerate or non-finite box the way callers expect", () => {
		expect(fitTextureRaster(0, 10)).toBeNull();
		expect(fitTextureRaster(10, -1)).toBeNull();
		expect(fitTextureRaster(Number.NaN, 10)).toBeNull();
		expect(fitTextureRaster(Number.POSITIVE_INFINITY, 10)).toBeNull();
	});

	it("preserves aspect ratio when it clamps, so the stroke is not distorted", () => {
		// `scaleX = scaleY = 1 / scale` at every call site, so a non-uniform
		// clamp would stretch the art.
		const r = fitTextureRaster(4000, 2000)!;
		expect(r.width / r.height).toBeCloseTo(2, 1);
	});
});
