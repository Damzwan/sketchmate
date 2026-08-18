import { describe, expect, it } from "vitest";
import {
	fitBitmapDimensions,
	resolveDrawMemoryProfile,
} from "./drawMemoryProfile";

describe("draw memory profile", () => {
	it("uses the smallest main-thread profile for a 2 GB phone", () => {
		const profile = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: true,
			deviceMemoryGB: 2,
			hardwareConcurrency: 4,
		});
		expect(profile).toMatchObject({
			tileBudgetMB: 24,
			overviewPx: 768,
			tilePoolMax: 2,
			transformMaxPixels: 500_000,
			overviewWorkBudgetMs: 3,
		});
	});

	it("keeps a less aggressive but bounded 4 GB profile", () => {
		const profile = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: true,
			deviceMemoryGB: 4,
			hardwareConcurrency: 8,
		});
		expect(profile).toMatchObject({
			tileBudgetMB: 32,
			overviewPx: 768,
			transformMaxPixels: 750_000,
			overviewWorkBudgetMs: 4,
		});
	});

	it("keeps even a high-end mobile drag preview below desktop texture size", () => {
		const profile = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: false,
			deviceMemoryGB: 8,
			hardwareConcurrency: 8,
		});
		expect(profile).toMatchObject({
			transformMaxPixels: 1_250_000,
			transformMaxDimension: 1536,
		});
	});

	it("leaves a phone-sized screen on its device-class overview budget", () => {
		// A capped-DPR phone asks for well under 768/1024 px of overview, so the
		// screen floor must not move anything here.
		expect(
			resolveDrawMemoryProfile({
				mobile: true,
				lowEnd: true,
				deviceMemoryGB: 2,
				hardwareConcurrency: 4,
				screenEdgePx: 412 * 1.5,
			}).overviewPx,
		).toBe(768);
		expect(
			resolveDrawMemoryProfile({
				mobile: true,
				lowEnd: false,
				deviceMemoryGB: 8,
				hardwareConcurrency: 8,
				screenEdgePx: 430 * 2,
			}).overviewPx,
		).toBe(1024);
	});

	it("raises the overview budget for a screen the bitmap cannot fill", () => {
		// A tablet at 1024 CSS px x DPR 2 would otherwise show a 2x-upscaled
		// overview at full zoom-out, which pushes the zoom floor back up.
		const tablet = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: false,
			deviceMemoryGB: 8,
			hardwareConcurrency: 8,
			screenEdgePx: 1024 * 2,
		});
		expect(tablet.overviewPx).toBe(1280); // 2048 / 1.6
	});

	it("caps the screen-derived floor so it cannot run away", () => {
		const huge = resolveDrawMemoryProfile({
			mobile: false,
			lowEnd: false,
			deviceMemoryGB: 16,
			hardwareConcurrency: 16,
			screenEdgePx: 100_000,
		});
		expect(huge.overviewPx).toBe(2560);
	});

	it("ignores an unusable screen measurement", () => {
		for (const screenEdgePx of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				resolveDrawMemoryProfile({
					mobile: false,
					lowEnd: false,
					deviceMemoryGB: 16,
					hardwareConcurrency: 16,
					screenEdgePx,
				}).overviewPx,
			).toBe(2048);
		}
	});

	it("caps bitmap area as well as its longest edge", () => {
		const fitted = fitBitmapDimensions(2048, 2048, 2048, 1_000_000);
		expect(fitted.width * fitted.height).toBeLessThanOrEqual(1_000_000);
		expect(fitted.width).toBe(fitted.height);
		expect(fitted.factor).toBeLessThan(0.5);
	});
});

describe("canvas-backed tile surfaces", () => {
	const desktop = {
		mobile: false,
		lowEnd: false,
		deviceMemoryGB: 8,
		hardwareConcurrency: 8,
		screenEdgePx: 3024,
	};

	it("leaves the bitmap profile untouched when tiles are ImageBitmaps", () => {
		const profile = resolveDrawMemoryProfile(desktop);
		expect(profile.tileBudgetMB).toBe(128);
		expect(profile.hotTileMax).toBe(6);
	});

	it("caps tiles by SURFACE COUNT, not by shrinking them, when tiles are canvases", () => {
		const profile = resolveDrawMemoryProfile({
			...desktop,
			canvasTileSurfaces: true,
		});
		// Gecko's knee is ~100 live canvases whatever they weigh, so the working
		// set is bounded and everything colder demotes to an ImageBitmap, which
		// is not on that budget at all.
		expect(profile.hotTileMax).toBe(0);
		expect(profile.tilePoolMax).toBeLessThanOrEqual(4);
		// Bytes are the secondary constraint only.
		expect(profile.tileBudgetMB).toBe(96);
	});

	it("keeps the overview at full size — it is ONE surface, not a count problem", () => {
		const profile = resolveDrawMemoryProfile({
			...desktop,
			canvasTileSurfaces: true,
		});
		expect(profile.overviewPx).toBe(
			resolveDrawMemoryProfile(desktop).overviewPx,
		);
	});

	it("keeps resident tiles between the viewport working set and the surface knee", () => {
		// Both bounds matter and they squeeze from opposite sides. Too few tiles
		// and the cache cannot hold what one bake pass covers, so every pass
		// evicts what the next frame needs — thrash, which reads as the picture
		// flipping between sharp and blurred. Too many and Gecko drops the
		// overflow canvases to software, which is the original bug.
		const profile = resolveDrawMemoryProfile({
			...desktop,
			canvasTileSurfaces: true,
		});
		const tileBytes = 516 * 516 * 4;
		const overviewBytes = profile.overviewPx ** 2 * 4;
		const poolBytes = profile.tilePoolMax * tileBytes;
		const residentTiles = Math.floor(
			(profile.tileBudgetMB * 1024 * 1024 - overviewBytes - poolBytes) /
				tileBytes,
		);

		// A 3024x1800 render-pixel viewport is 6x4 cells, and a bake pass pads by
		// a one-tile ring: 8x6 = 48 at the active tier alone.
		expect(residentTiles).toBeGreaterThan(48);

		// Everything else on the page draws on the same pool.
		const OTHER_SURFACES = profile.tilePoolMax + 1 + 2 + 2;
		const MEASURED_KNEE = 96;
		expect(residentTiles + OTHER_SURFACES).toBeLessThan(MEASURED_KNEE);
	});

	it("takes the caller's severe verdict over its own memory/core rule", () => {
		// A weak-GPU phone with 4 GB and 8 cores passes neither local test, but
		// renderQuality.config classes it severe from the GPU family.
		const device = {
			mobile: true,
			lowEnd: true,
			deviceMemoryGB: 4,
			hardwareConcurrency: 8,
		};
		expect(resolveDrawMemoryProfile(device).tileBudgetMB).toBe(32);
		expect(
			resolveDrawMemoryProfile({ ...device, severelyConstrained: true })
				.tileBudgetMB,
		).toBe(24);
	});

	it("lets the caller clear a severe verdict the local rule would set", () => {
		const profile = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: true,
			deviceMemoryGB: 2,
			hardwareConcurrency: 4,
			severelyConstrained: false,
		});
		expect(profile.tileBudgetMB).toBe(32);
	});

	it("never raises a small device byte budget to the desktop cap", () => {
		const phone = resolveDrawMemoryProfile({
			mobile: true,
			lowEnd: true,
			deviceMemoryGB: 2,
			hardwareConcurrency: 4,
			canvasTileSurfaces: true,
		});
		expect(phone.hotTileMax).toBe(0);
		// And its byte budget is still its own, never raised to the desktop cap.
		expect(phone.tileBudgetMB).toBe(24);
	});
});
