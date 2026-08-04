import { describe, expect, it } from "vitest";
import { pickTileTier } from "./tiles/tileGeometry";
import {
	DEFAULT_OVERVIEW_TIER,
	DEFAULT_ZOOM_TIERS,
	clampToViewportZoom,
	minimumTiledZoom,
	minimumViewportZoom,
	minimumViewportZoomFor,
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

	it("keeps the ladder's bottom rung inside the overview-only range", () => {
		expect(minimumViewportZoom()).toBe(0.125);
		expect(clampToViewportZoom(0.01, 16)).toBe(0.125);
		expect(clampToViewportZoom(0.125, 16)).toBe(0.125);
		for (const renderScale of [1, 1.5, 2]) {
			expect(
				pickTileTier(minimumViewportZoom(), renderScale, DEFAULT_ZOOM_TIERS),
			).toBeLessThanOrEqual(DEFAULT_OVERVIEW_TIER);
		}
	});

	it("clamps against an explicit floor below the ladder", () => {
		// The big-board case: the engine's floor sits under 0.125 and a
		// fit-to-content must be allowed to land there.
		expect(clampToViewportZoom(0.02, 16, DEFAULT_ZOOM_TIERS, 0.02)).toBe(0.02);
		expect(clampToViewportZoom(0.005, 16, DEFAULT_ZOOM_TIERS, 0.02)).toBe(0.02);
	});
});

describe("content-derived zoom floor", () => {
	const RENDER_SCALE = 2;
	const TILED = minimumTiledZoom(RENDER_SCALE); // 0.25
	const DENSITY = 0.04; // a budget-capped bitmap over a ~20k-unit lobby

	it("stops at the tiled tier for a drawing that already fits", () => {
		// A normal drawing fits on screen well above the tiled floor. Nothing is
		// gained by going further out, so this is the pre-existing behaviour.
		expect(minimumViewportZoomFor(1, 0.5, RENDER_SCALE)).toBe(TILED);
		expect(minimumViewportZoomFor(TILED, 0.5, RENDER_SCALE)).toBe(TILED);
	});

	it("reaches the fit zoom on a board too big for the tiled floor", () => {
		// The lobby case: ~20k world units on a ~1000 px screen fits around 0.04,
		// far below the 0.25 tiled floor.
		expect(minimumViewportZoomFor(0.05, DENSITY, RENDER_SCALE)).toBeCloseTo(
			0.05,
		);
	});

	it("goes below the tier ladder entirely when the content needs it", () => {
		expect(
			minimumViewportZoomFor(0.02, DENSITY, RENDER_SCALE),
		).toBeLessThan(minimumViewportZoom());
	});

	it("does not shorten the reach of a coarse overview", () => {
		// Zooming out LOWERS the pixels the screen asks for, so a sparse bitmap is
		// at its best here, not its worst. Density must not gate the floor — that
		// reading is what closed the band on big boards in the first place.
		for (const density of [0.001, 0.04, 4]) {
			expect(minimumViewportZoomFor(0.01, density, RENDER_SCALE)).toBe(0.01);
		}
	});

	it("stays on tiles with no bitmap or no content bounds yet", () => {
		expect(minimumViewportZoomFor(0.01, 0, RENDER_SCALE)).toBe(TILED);
		expect(minimumViewportZoomFor(0.01, Number.NaN, RENDER_SCALE)).toBe(TILED);
		expect(
			minimumViewportZoomFor(Number.POSITIVE_INFINITY, 0.5, RENDER_SCALE),
		).toBe(TILED);
		expect(minimumViewportZoomFor(Number.NaN, 0.5, RENDER_SCALE)).toBe(TILED);
		expect(minimumViewportZoomFor(0, 0.5, RENDER_SCALE)).toBe(TILED);
	});

	it("never returns a floor above the old one, at any scale", () => {
		// The regression this replaces RAISED the floor. Swept guarantee that the
		// new one cannot: it is always the tiled tier or further out.
		for (const renderScale of [1, 1.5, 2]) {
			for (const density of [0, 0.02, 0.1, 0.25, 0.5, 1, 4]) {
				for (const fit of [0.001, 0.02, 0.125, 0.5, 4]) {
					expect(
						minimumViewportZoomFor(fit, density, renderScale),
					).toBeLessThanOrEqual(minimumTiledZoom(renderScale));
				}
			}
		}
	});

	it("never demands more zoom-out than the content actually needs", () => {
		for (const fit of [0.001, 0.02, 0.125, 0.5, 4]) {
			for (const density of [0.02, 0.5, 4]) {
				expect(minimumViewportZoomFor(fit, density, 2)).toBeGreaterThanOrEqual(
					Math.min(fit, minimumTiledZoom(2)),
				);
			}
		}
	});
});
