import { describe, expect, it } from "vitest";
import {
	buildWatercolorBristles,
	buildWatercolorPathData,
	decodeWatercolorTrace,
	encodeWatercolorTrace,
	traceWatercolorPath,
	watercolorComplexity,
} from "./watercolorGeometry";

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
		expect(decodeWatercolorTrace(encodeWatercolorTrace(points))).toEqual(points);
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
