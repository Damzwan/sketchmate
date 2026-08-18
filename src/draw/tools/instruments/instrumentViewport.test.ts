import { describe, expect, it } from "vitest";
import {
	compassCenterMarginPx,
	compassDragRadiusPx,
	compassRadiusHandlePoint,
	maxCompassRadiusPx,
	maxRulerLengthPx,
	rulerCenterMarginPx,
	rulerHandleOffsets,
} from "@/draw/tools/instruments/instrumentViewport";

describe("instrument viewport sizing", () => {
	it("lets the ruler grow well past the viewport diagonal", () => {
		const viewport = { width: 1200, height: 700 };
		expect(maxRulerLengthPx(viewport)).toBeGreaterThan(
			Math.hypot(viewport.width, viewport.height) * 2,
		);
	});

	it("lets the compass grow past the viewport, like the ruler", () => {
		const viewport = { width: 1200, height: 700 };
		const radius = maxCompassRadiusPx(viewport);
		expect(radius).toBeGreaterThan(
			Math.hypot(viewport.width, viewport.height) * 2,
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
		// Still reaches the circumference: this radius is wider than the viewport
		// is on the x axis, but a corner is further away than the radius.
		const radius = 320;
		const handle = compassRadiusHandlePoint(center, radius, viewport);

		expect(Math.hypot(handle.x - center.x, handle.y - center.y)).toBeCloseTo(
			radius,
		);
		expect(handle.x).toBeGreaterThanOrEqual(24);
		expect(handle.x).toBeLessThanOrEqual(viewport.width - 24);
		expect(handle.y).toBeGreaterThanOrEqual(24);
		expect(handle.y).toBeLessThanOrEqual(viewport.height - 24);
	});

	it("keeps the handle on screen when the circle encloses the viewport", () => {
		const viewport = { width: 600, height: 400 };
		const center = { x: 300, y: 200 };
		const handle = compassRadiusHandlePoint(center, 4000, viewport);

		expect(handle.x).toBeGreaterThanOrEqual(0);
		expect(handle.x).toBeLessThanOrEqual(viewport.width);
		expect(handle.y).toBeGreaterThanOrEqual(0);
		expect(handle.y).toBeLessThanOrEqual(viewport.height);
		// And far enough from the centre that it is not sitting on the drag puck.
		expect(
			Math.hypot(handle.x - center.x, handle.y - center.y),
		).toBeGreaterThan(compassDragRadiusPx(4000));
	});
});

describe("compass sizing helpers", () => {
	it("drags from the whole interior while the circle is small", () => {
		expect(compassDragRadiusPx(90)).toBe(66);
	});

	it("caps the drag puck so a huge circle cannot swallow the canvas", () => {
		expect(compassDragRadiusPx(4000)).toBe(140);
	});

	it("never collapses the puck below a touch target", () => {
		expect(compassDragRadiusPx(10)).toBe(40);
	});

	it("asks only enough centre margin to keep the puck reachable", () => {
		// The regression this guards: a margin that tracked the full radius made
		// the allowed centre range empty for any circle wider than the viewport,
		// pinning the compass to the middle of the screen.
		expect(compassCenterMarginPx(4000)).toBe(164);
		expect(compassCenterMarginPx(4000)).toBeLessThan(200);
	});
});

describe("ruler centre margin", () => {
	// The regression this exists to prevent: a margin that varies with the angle
	// makes every rotation re-clamp the centre, i.e. rotation that translates.
	it("depends on the ruler width and nothing else", () => {
		expect(rulerCenterMarginPx(60)).toBe(54);
		expect(rulerCenterMarginPx(60)).toBe(rulerCenterMarginPx(60));
		expect(rulerCenterMarginPx(0)).toBeLessThan(rulerCenterMarginPx(96));
	});
});

describe("rulerHandleOffsets", () => {
	const viewport = { width: 800, height: 600 };
	const center = { x: 400, y: 300 };

	it("sits at the tips while the whole ruler is on screen", () => {
		const offsets = rulerHandleOffsets(center, 0, 300, viewport);
		expect(offsets).toEqual({ start: -128, end: 128 });
	});

	it("pulls a longer-than-viewport ruler's handles back into view", () => {
		const offsets = rulerHandleOffsets(center, 0, 4000, viewport);

		expect(offsets.end).toBeLessThan(2000);
		expect(center.x + offsets.end).toBeLessThanOrEqual(viewport.width);
		expect(center.x + offsets.start).toBeGreaterThanOrEqual(0);
	});

	it("keeps both handles reachable when the centre is near an edge", () => {
		const offsets = rulerHandleOffsets({ x: 30, y: 300 }, 0, 4000, viewport);

		expect(offsets.start).toBeLessThanOrEqual(-34);
		expect(offsets.end).toBeGreaterThanOrEqual(34);
	});

	it("follows the ruler's own direction, not the screen axes", () => {
		const horizontal = rulerHandleOffsets(center, 0, 4000, viewport);
		const vertical = rulerHandleOffsets(center, Math.PI / 2, 4000, viewport);

		// The viewport is wider than it is tall, so a vertical ruler runs out of
		// room sooner.
		expect(vertical.end).toBeLessThan(horizontal.end);
	});

	it("stays symmetric about a centred ruler however it is turned", () => {
		for (const angle of [0, 0.3, Math.PI / 4, 1.9, Math.PI]) {
			const offsets = rulerHandleOffsets(center, angle, 4000, viewport);
			expect(offsets.end).toBeCloseTo(-offsets.start, 6);
		}
	});
});
