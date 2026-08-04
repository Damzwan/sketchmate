import { describe, expect, it } from "vitest";
import { pickTileTier } from "./tiles/tileGeometry";
import {
	DEFAULT_OVERVIEW_TIER,
	DEFAULT_ZOOM_TIERS,
	clampToViewportZoom,
	minimumTiledZoom,
	minimumViewportZoom,
	sharpMinimumViewportZoom,
} from "./zoomLevels";

describe("render zoom levels", () => {
	it.each([
		1, 1.5, 2,
	])("starts on a tile-backed tier at render scale %s", (renderScale) => {
		const minZoom = minimumTiledZoom(renderScale);
		const tier = pickTileTier(minZoom, renderScale, DEFAULT_ZOOM_TIERS);

		expect(tier).toBeGreaterThan(DEFAULT_OVERVIEW_TIER);
	});

	it("uses viewport zoom 0.25 at render scale 2", () => {
		expect(minimumTiledZoom(2)).toBe(0.25);
	});

	it("allows the viewport into the overview-only range", () => {
		expect(minimumViewportZoom()).toBe(0.125);
		expect(clampToViewportZoom(0.01, 16)).toBe(0.125);
		expect(clampToViewportZoom(0.125, 16)).toBe(0.125);
		for (const renderScale of [1, 1.5, 2]) {
			expect(
				pickTileTier(minimumViewportZoom(), renderScale, DEFAULT_ZOOM_TIERS),
			).toBeLessThanOrEqual(DEFAULT_OVERVIEW_TIER);
		}
	});
});

describe("sharp zoom floor", () => {
	const RENDER_SCALE = 2;
	const TILED = minimumTiledZoom(RENDER_SCALE); // 0.25

	it("keeps the full zoom-out range when the overview can serve it", () => {
		// A normal drawing: the bitmap holds >= the pixels the screen asks for all
		// the way up to the first tiled tier, so nothing is taken away.
		const density = TILED * RENDER_SCALE; // exactly enough
		expect(sharpMinimumViewportZoom(density, RENDER_SCALE)).toBe(
			minimumViewportZoom(),
		);
		expect(sharpMinimumViewportZoom(density * 4, RENDER_SCALE)).toBe(
			minimumViewportZoom(),
		);
	});

	it("stops at the tiled tier when the overview would be upscaled", () => {
		// The massive-lobby case. ~0.1 px per world unit against a top-of-range
		// demand of 0.5 is the ~5x upscale users see as blur; the floor rises so it
		// is simply not reachable.
		expect(sharpMinimumViewportZoom(0.1, RENDER_SCALE)).toBe(TILED);
		expect(sharpMinimumViewportZoom(TILED * RENDER_SCALE * 0.5, RENDER_SCALE)).toBe(
			TILED,
		);
	});

	it("stays on tiles before the first bitmap exists", () => {
		expect(sharpMinimumViewportZoom(0, RENDER_SCALE)).toBe(TILED);
		expect(sharpMinimumViewportZoom(Number.NaN, RENDER_SCALE)).toBe(TILED);
	});

	it("never returns a zoom that is served by an upscaled overview", () => {
		// The guarantee itself, swept: whatever the floor is, at that zoom either
		// tiles serve it or the bitmap has the pixels for it.
		for (const renderScale of [1, 1.5, 2]) {
			for (const density of [0, 0.02, 0.1, 0.25, 0.5, 1, 4]) {
				const floor = sharpMinimumViewportZoom(density, renderScale);
				const tiled = minimumTiledZoom(renderScale);
				const servedByTiles = floor >= tiled;
				const servedSharply = density >= floor * renderScale;
				expect(servedByTiles || servedSharply).toBe(true);
			}
		}
	});

	it("only ever restricts, never opens the range wider than before", () => {
		for (const density of [0, 0.1, 0.5, 10]) {
			expect(
				sharpMinimumViewportZoom(density, 2),
			).toBeGreaterThanOrEqual(minimumViewportZoom());
		}
	});
});
