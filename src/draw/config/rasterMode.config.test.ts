import { describe, expect, it } from "vitest";
import {
	DRAW_RASTER_MODE_QUERY_KEY,
	resolveDrawRasterMode,
} from "./rasterMode.config";

describe("draw raster mode", () => {
	it("keeps the GPU as the safe default", () => {
		expect(resolveDrawRasterMode("", null)).toBe("gpu");
	});

	it("allows CPU rasterization only as a persisted experiment", () => {
		expect(resolveDrawRasterMode("", "cpu")).toBe("cpu");
		expect(resolveDrawRasterMode("", "gpu")).toBe("gpu");
	});

	it("lets the query parameter override persistence", () => {
		expect(
			resolveDrawRasterMode(`?${DRAW_RASTER_MODE_QUERY_KEY}=gpu`, "cpu"),
		).toBe("gpu");
	});

	it("ignores invalid values and falls back to the GPU", () => {
		expect(
			resolveDrawRasterMode(`?${DRAW_RASTER_MODE_QUERY_KEY}=soft`, null),
		).toBe("gpu");
		expect(resolveDrawRasterMode("", "soft")).toBe("gpu");
	});
});
