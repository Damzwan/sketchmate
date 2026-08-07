import { describe, expect, it } from "vitest";
import {
	buildWatercolorBristles,
	buildWatercolorPathData,
	decodeWatercolorTrace,
	encodeWatercolorTrace,
	simplifyWatercolorPoints,
	traceWatercolorPath,
	watercolorComplexity,
	watercolorSimplifyTolerance,
} from "./watercolorGeometry";

describe("watercolor simplification", () => {
	/** A hand stroke as the brush actually captures it: 0.3px spacing + tremor. */
	function capturedStroke(lengthPx: number) {
		const points: { x: number; y: number }[] = [];
		let seed = 1;
		const random = () => {
			seed = Math.sin(seed * 12.9898) * 43758.5453;
			return seed - Math.floor(seed);
		};
		for (let d = 0; d < lengthPx; d += 0.3) {
			points.push({
				x: d,
				y: Math.sin(d / 40) * 25 + (random() - 0.5) * 0.35,
			});
		}
		return points;
	}

	it("collapses sub-pixel sampling without moving the stroke", () => {
		const points = capturedStroke(250);
		const tolerance = watercolorSimplifyTolerance(20);
		const simplified = simplifyWatercolorPoints(points, tolerance);

		// The captured density is the problem: every point costs THREE path
		// commands, one per bristle.
		expect(points.length).toBeGreaterThan(800);
		expect(simplified.length).toBeLessThan(points.length / 20);

		// Endpoints are exact, so the stroke still starts and ends where drawn.
		expect(simplified[0]).toEqual(points[0]);
		expect(simplified.at(-1)).toEqual(points.at(-1));

		// And nothing kept has moved — DP only ever drops points.
		for (const point of simplified) expect(points).toContainEqual(point);
	});

	it("is idempotent, so re-loading a drawing cannot keep shrinking it", () => {
		const tolerance = watercolorSimplifyTolerance(20);
		const once = simplifyWatercolorPoints(capturedStroke(250), tolerance);
		const twice = simplifyWatercolorPoints(once, tolerance);
		expect(twice).toEqual(once);
	});

	it("leaves a tap or a two-point dab alone", () => {
		const dab = [
			{ x: 1, y: 1 },
			{ x: 2, y: 2 },
		];
		expect(simplifyWatercolorPoints(dab, 5)).toEqual(dab);
		expect(simplifyWatercolorPoints([{ x: 1, y: 1 }], 5)).toHaveLength(1);
	});

	it("widens the tolerance for wide washes only", () => {
		expect(watercolorSimplifyTolerance(10)).toBe(0.3);
		expect(watercolorSimplifyTolerance(40)).toBeCloseTo(0.8);
	});
});

describe("watercolor geometry", () => {
	it("decodes delta-compressed points without mutating the source", () => {
		const trace = [100, 200, 5, -10, 15, 20];
		const before = [...trace];
		expect(decodeWatercolorTrace(trace)).toEqual([
			{ x: 10, y: 20 },
			{ x: 10.5, y: 19 },
			{ x: 12, y: 21 },
		]);
		expect(trace).toEqual(before);
	});

	it("round-trips points through the compact trace", () => {
		const points = [
			{ x: 10, y: 20 },
			{ x: 10.5, y: 19 },
			{ x: 12, y: 21 },
		];
		expect(decodeWatercolorTrace(encodeWatercolorTrace(points))).toEqual(
			points,
		);
	});

	it("builds the same three-subpath command shape", () => {
		const commands = buildWatercolorPathData(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 5 },
				{ x: 20, y: 0 },
			],
			8,
		);
		expect(commands.filter((command) => command[0] === "M")).toHaveLength(3);
		expect(commands.filter((command) => command[0] === "Q")).toHaveLength(6);
		expect(commands.filter((command) => command[0] === "L")).toHaveLength(3);
	});

	it("culls distant curve runs while retaining one path operation", () => {
		const bristles = buildWatercolorBristles(
			Array.from({ length: 100 }, (_, i) => ({ x: i * 10, y: 0 })),
			8,
		);
		const calls: string[] = [];
		const ctx = {
			beginPath: () => calls.push("B"),
			moveTo: () => calls.push("M"),
			lineTo: () => calls.push("L"),
			quadraticCurveTo: () => calls.push("Q"),
		};
		traceWatercolorPath(
			ctx,
			bristles,
			{ x: 0, y: 0 },
			{ x: 450, y: -20, w: 100, h: 40 },
			8,
		);
		expect(calls.filter((call) => call === "B")).toHaveLength(1);
		expect(calls.filter((call) => call === "Q").length).toBeLessThan(60);
		expect(calls.filter((call) => call === "Q").length).toBeGreaterThan(0);
	});

	it("weights watercolor by generated curve count", () => {
		expect(watercolorComplexity({ compressedTrace: new Array(200) })).toBe(300);
	});
});
