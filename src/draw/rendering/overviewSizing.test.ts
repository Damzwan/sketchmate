import { describe, expect, it } from "vitest";
import { chooseOverviewDimensions } from "./overviewSizing";

describe("overview sizing", () => {
	it("renders a small board at the requested density", () => {
		expect(
			chooseOverviewDimensions({ x: 0, y: 0, w: 1000, h: 500 }, 0.5, 1024),
		).toEqual({ width: 500, height: 250 });
	});

	it("preserves aspect ratio while staying inside the pixel budget", () => {
		const size = chooseOverviewDimensions(
			{ x: 0, y: 0, w: 8000, h: 2000 },
			0.5,
			1024,
		);

		expect(size).toEqual({ width: 2048, height: 512 });
		expect(size.width * size.height).toBeLessThanOrEqual(1024 ** 2);
	});

	it("caps extreme long edges", () => {
		const size = chooseOverviewDimensions(
			{ x: 0, y: 0, w: 100_000, h: 100 },
			0.5,
			2048,
		);

		expect(size.width).toBe(4096);
		expect(size.height).toBeGreaterThan(0);
		expect(size.width * size.height).toBeLessThanOrEqual(2048 ** 2);
	});
});
