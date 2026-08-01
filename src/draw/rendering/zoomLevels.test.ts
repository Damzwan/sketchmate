import { describe, expect, it } from "vitest";
import { pickTileTier } from "./tiles/tileGeometry";
import {
	DEFAULT_OVERVIEW_TIER,
	DEFAULT_ZOOM_TIERS,
	minimumTiledZoom,
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
});
