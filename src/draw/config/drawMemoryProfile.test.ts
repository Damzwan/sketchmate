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
