import { describe, expect, it } from "vitest";
import {
	buildWatercolorBristles,
	buildWatercolorPathData,
	decodeWatercolorTrace,
	encodeWatercolorTrace,
	thinLegacyWatercolorTrace,
	traceWatercolorPath,
	watercolorComplexity,
	watercolorSampleSpacing,
} from "./watercolorGeometry";

describe("watercolor thinning", () => {
	/** A hand stroke as the OLD brush captured it: 0.3px spacing + tremor. */
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

	/** Uniformly spaced, the way the brush now samples. */
	function sampledStroke(lengthPx: number, spacing: number) {
		const points: { x: number; y: number }[] = [];
		for (let d = 0; d < lengthPx; d += spacing) {
			points.push({ x: d, y: Math.sin(d / 40) * 25 });
		}
		return points;
	}

	it("scales the sample spacing with brush width", () => {
		// Thin strokes keep detail, wide washes stop paying for detail they
		// cannot show, and both stay inside the clamp.
		expect(watercolorSampleSpacing(4)).toBe(1.5);
		expect(watercolorSampleSpacing(20)).toBeCloseTo(2.4);
		expect(watercolorSampleSpacing(120)).toBe(6);
	});

	it("thins a legacy sub-pixel trace", () => {
		const points = capturedStroke(250);
		const spacing = watercolorSampleSpacing(20);
		const thinned = thinLegacyWatercolorTrace(points, spacing);

		expect(points.length).toBeGreaterThan(800);
		expect(thinned.length).toBeLessThan(points.length / 5);
		// Endpoints exact, so the stroke still starts and ends where it was drawn.
		expect(thinned[0]).toEqual(points[0]);
		expect(thinned.at(-1)).toEqual(points.at(-1));
		// Only ever DROPS points — nothing kept has moved.
		for (const point of thinned) expect(points).toContainEqual(point);
	});

	it("leaves a trace the current brush produced untouched", () => {
		// THE reason this replaced Douglas-Peucker on the load path: a stroke must
		// rebuild exactly as it was drawn, and DP could not tell "already thinned"
		// from "captured at 0.3px".
		const spacing = watercolorSampleSpacing(20);
		const points = sampledStroke(250, spacing);
		expect(thinLegacyWatercolorTrace(points, spacing)).toEqual(points);
	});

	it("is idempotent, so re-loading cannot keep shrinking a drawing", () => {
		const spacing = watercolorSampleSpacing(20);
		const once = thinLegacyWatercolorTrace(capturedStroke(250), spacing);
		const twice = thinLegacyWatercolorTrace(once, spacing);
		expect(twice).toEqual(once);
	});

	it("leaves a tap or a two-point dab alone", () => {
		const dab = [
			{ x: 1, y: 1 },
			{ x: 2, y: 2 },
		];
		expect(thinLegacyWatercolorTrace(dab, 5)).toEqual(dab);
		expect(thinLegacyWatercolorTrace([{ x: 1, y: 1 }], 5)).toHaveLength(1);
	});

	it("puts bristles in the same place at any sampling density", () => {
		// Every bristle term is a function of the point's own coordinates, so a
		// point that survives thinning lands exactly where it did before. This is
		// what makes thinning a stored trace safe at all.
		const spacing = watercolorSampleSpacing(20);
		const points = capturedStroke(250);
		const thinned = thinLegacyWatercolorTrace(points, spacing);

		const dense = buildWatercolorBristles(points, 20);
		const sparse = buildWatercolorBristles(thinned, 20);

		let denseIndex = 0;
		for (let i = 0; i < thinned.length; i++) {
			while (
				points[denseIndex].x !== thinned[i].x ||
				points[denseIndex].y !== thinned[i].y
			) {
				denseIndex++;
			}
			for (let bristle = 0; bristle < 3; bristle++) {
				expect(sparse[bristle][i * 2]).toBe(dense[bristle][denseIndex * 2]);
				expect(sparse[bristle][i * 2 + 1]).toBe(
					dense[bristle][denseIndex * 2 + 1],
				);
			}
		}
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
