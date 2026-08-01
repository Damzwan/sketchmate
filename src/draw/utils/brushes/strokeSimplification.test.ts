import { describe, expect, it } from "vitest";
import {
	strokeDecimateDistance,
	strokeSimplifyTolerance,
} from "./strokeSimplification";
import { simplifyPathDouglasPeucker } from "./brush.helpers";
import { BASE_BRUSH_SIZE } from "@/draw/config/canvas.config";

describe("strokeSimplifyTolerance", () => {
	it("reproduces the previous fixed tolerance at the default brush size", () => {
		// The old hard-coded value was 0.3, and BASE_BRUSH_SIZE is the width most
		// strokes are drawn at. Anchoring here means every behaviour change is
		// relative to width rather than a blanket shift for everyone.
		expect(strokeSimplifyTolerance(BASE_BRUSH_SIZE, 1)).toBeCloseTo(0.3, 5);
	});

	it("scales with stroke width, independently of zoom", () => {
		// Zoom is transient, geometry is permanent: a stroke must not be coarse
		// forever because of the viewport it happened to be drawn at.
		const wide = strokeSimplifyTolerance(100, 1);
		const narrow = strokeSimplifyTolerance(10, 1);
		expect(wide).toBeGreaterThan(narrow);
		expect(strokeSimplifyTolerance(100, 1)).toBe(
			strokeSimplifyTolerance(100, 8),
		);
	});

	it("keeps MORE detail for a thin stroke zoomed in than the old constant did", () => {
		// This is the half of the change that improves quality rather than cost.
		expect(strokeSimplifyTolerance(1, 4)).toBeLessThan(0.3);
	});

	it("raises the floor when zoomed out, where input cannot express detail", () => {
		// At zoom 0.1 one screen pixel is 10 world units; retaining sub-unit
		// geometry there is storing digitiser noise.
		expect(strokeSimplifyTolerance(1, 0.1)).toBeGreaterThan(
			strokeSimplifyTolerance(1, 1),
		);
	});

	it("clamps both ends", () => {
		expect(strokeSimplifyTolerance(0.1, 100)).toBeGreaterThanOrEqual(0.05);
		// A very wide brush must not simplify a curve into visible straight
		// segments — the stroke's own outline would show corners.
		expect(strokeSimplifyTolerance(10_000, 1)).toBeLessThanOrEqual(2.5);
	});

	it("survives degenerate width and zoom", () => {
		for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			const t = strokeSimplifyTolerance(10, zoom);
			expect(Number.isFinite(t)).toBe(true);
			expect(t).toBeGreaterThan(0);
		}
		expect(Number.isFinite(strokeSimplifyTolerance(Number.NaN, 1))).toBe(true);
	});
});

describe("strokeDecimateDistance", () => {
	it("is expressed in SCREEN pixels — fabric divides by zoom itself", () => {
		// Pre-dividing here would apply the zoom correction twice.
		expect(strokeDecimateDistance(10, 4)).toBeGreaterThan(
			strokeDecimateDistance(10, 1),
		);
	});

	it("stays small enough that the live preview does not look angular", () => {
		// `decimate` also governs the stroke drawn on the top context while the
		// finger is down, so the bulk of the reduction is left to DP.
		expect(strokeDecimateDistance(120, 8)).toBeLessThanOrEqual(2);
		expect(strokeDecimateDistance(0.1, 0.1)).toBeGreaterThanOrEqual(0.3);
	});
});

describe("end-to-end point reduction", () => {
	/** A noisy near-straight drag, the shape a finger actually produces. */
	function noisyStroke(points: number): any[] {
		const path: any[] = [["M", 0, 0]];
		for (let i = 1; i < points; i++) {
			path.push(["L", i, Math.sin(i * 1.7) * 0.4]);
		}
		return path;
	}

	it("drops far more points for a wide fill stroke than for a hairline", () => {
		const raw = noisyStroke(400);
		const wide = simplifyPathDouglasPeucker(
			raw as any,
			strokeSimplifyTolerance(100, 1),
		);
		const thin = simplifyPathDouglasPeucker(
			raw as any,
			strokeSimplifyTolerance(1, 1),
		);
		expect(wide.length).toBeLessThan(thin.length / 4);
	});

	it("never drops the first or last point", () => {
		const raw = noisyStroke(200);
		const out = simplifyPathDouglasPeucker(
			raw as any,
			strokeSimplifyTolerance(120, 1),
		);
		expect(out[0]).toEqual(raw[0]);
		expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
	});
});
