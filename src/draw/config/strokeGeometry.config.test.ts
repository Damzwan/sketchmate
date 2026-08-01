import { describe, expect, it } from "vitest";
import { resolveCompactStrokeGeometry } from "./strokeGeometry.config";

describe("compact stroke geometry config", () => {
	it("defaults to enabled", () => {
		expect(resolveCompactStrokeGeometry("", null)).toBe(true);
	});

	it("lets the query override the persisted choice", () => {
		expect(
			resolveCompactStrokeGeometry("?compactStrokeGeometry=off", "on"),
		).toBe(false);
		expect(
			resolveCompactStrokeGeometry("?compactStrokeGeometry=on", "off"),
		).toBe(true);
	});

	it("accepts boolean and numeric kill-switch values", () => {
		expect(resolveCompactStrokeGeometry("", "false")).toBe(false);
		expect(resolveCompactStrokeGeometry("", "0")).toBe(false);
		expect(resolveCompactStrokeGeometry("", "true")).toBe(true);
		expect(resolveCompactStrokeGeometry("", "1")).toBe(true);
	});
});
