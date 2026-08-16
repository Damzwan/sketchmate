import { describe, expect, it } from "vitest";
import {
	compassRadiusHandlePoint,
	maxCompassRadiusPx,
	maxRulerLengthPx,
} from "@/draw/tools/instruments/instrumentViewport";

describe("instrument viewport sizing", () => {
	it("allows the ruler to span the full viewport diagonal", () => {
		const viewport = { width: 1200, height: 700 };
		expect(maxRulerLengthPx(viewport)).toBeGreaterThan(
			Math.hypot(viewport.width, viewport.height),
		);
	});

	it("allows a large compass while leaving room for its corner handle", () => {
		const viewport = { width: 1200, height: 700 };
		const radius = maxCompassRadiusPx(viewport);
		expect(radius).toBeGreaterThan(viewport.height / 2);
		expect(radius).toBeLessThan(
			Math.hypot(viewport.width / 2, viewport.height / 2),
		);
	});

	it("keeps the compass handle on the right while it fits", () => {
		expect(
			compassRadiusHandlePoint({ x: 300, y: 200 }, 100, {
				width: 600,
				height: 400,
			}),
		).toEqual({ x: 400, y: 200 });
	});

	it("moves a large compass handle onto a visible diagonal", () => {
		const viewport = { width: 600, height: 400 };
		const center = { x: 300, y: 200 };
		const radius = maxCompassRadiusPx(viewport);
		const handle = compassRadiusHandlePoint(center, radius, viewport);

		expect(Math.hypot(handle.x - center.x, handle.y - center.y)).toBeCloseTo(
			radius,
		);
		expect(handle.x).toBeGreaterThanOrEqual(24);
		expect(handle.x).toBeLessThanOrEqual(viewport.width - 24);
		expect(handle.y).toBeGreaterThanOrEqual(24);
		expect(handle.y).toBeLessThanOrEqual(viewport.height - 24);
	});
});
