import { describe, expect, it } from "vitest";
import { wheelDeltaPixels } from "./wheelDelta";

const wheel = (deltaY: number, deltaMode: number) => ({ deltaY, deltaMode });

/** What the zoom handler actually computes from the normalized delta. */
const zoomFactor = (e: { deltaY: number; deltaMode: number }) =>
	Math.exp(-wheelDeltaPixels(e) / 300);

describe("wheel delta normalization", () => {
	it("passes pixel deltas through untouched", () => {
		// Blink always reports pixels, and trackpads report pixels everywhere —
		// neither may change behaviour.
		expect(wheelDeltaPixels(wheel(-100, 0))).toBe(-100);
		expect(wheelDeltaPixels(wheel(53.2, 0))).toBe(53.2);
	});

	it("converts Gecko's line deltas to a comparable zoom step", () => {
		// One notch: Blink ~100 px, Gecko 3 lines. Raw, that was exp(-3/300) — a
		// 1% step against Blink's 28% — so a user had to keep the wheel (and the
		// viewport gesture, and therefore the bake freeze) going ~40x longer.
		const blink = zoomFactor(wheel(-100, 0));
		const gecko = zoomFactor(wheel(-3, 1));
		expect(gecko).toBeGreaterThan(1);
		expect(gecko / blink).toBeGreaterThan(0.9);
		expect(gecko / blink).toBeLessThan(1.1);
	});

	it("scales page deltas without letting one event swallow the range", () => {
		expect(wheelDeltaPixels(wheel(-1, 2))).toBe(-400);
	});

	it("keeps the sign, so direction never inverts per engine", () => {
		expect(wheelDeltaPixels(wheel(3, 1))).toBeGreaterThan(0);
		expect(wheelDeltaPixels(wheel(-3, 1))).toBeLessThan(0);
	});
});
