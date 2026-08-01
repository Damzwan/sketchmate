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

	it("caps bitmap area as well as its longest edge", () => {
		const fitted = fitBitmapDimensions(2048, 2048, 2048, 1_000_000);
		expect(fitted.width * fitted.height).toBeLessThanOrEqual(1_000_000);
		expect(fitted.width).toBe(fitted.height);
		expect(fitted.factor).toBeLessThan(0.5);
	});
});
