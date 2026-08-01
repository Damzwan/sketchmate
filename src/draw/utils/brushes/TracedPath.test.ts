import { describe, expect, it } from "vitest";
import { Path, type TSimplePathData } from "fabric";
import { OptimizedPencilStroke } from "./CustomPencilBrush";
import { TracedPath } from "./TracedPath";

const PATH_DATA: TSimplePathData = [
	["M", 2.25, 3.5],
	["L", 12.75, 9.25],
	["Q", 18.5, -2.25, 24.5, 7.75],
	["C", 28.25, 10.5, 31.75, 14.25, 36.5, 5.5],
	["Z"],
];

function commandRecorder() {
	const calls: unknown[][] = [];
	const context = {
		beginPath: () => calls.push(["beginPath"]),
		moveTo: (...args: number[]) => calls.push(["moveTo", ...args]),
		lineTo: (...args: number[]) => calls.push(["lineTo", ...args]),
		quadraticCurveTo: (...args: number[]) =>
			calls.push(["quadraticCurveTo", ...args]),
		bezierCurveTo: (...args: number[]) =>
			calls.push(["bezierCurveTo", ...args]),
		closePath: () => calls.push(["closePath"]),
	} as unknown as CanvasRenderingContext2D;
	return { calls, context };
}

describe("TracedPath", () => {
	it("matches Fabric rendering, bounds, complexity and SVG output", () => {
		const fabricPath = new Path(PATH_DATA, { strokeWidth: 6 });
		const tracedPath = new TracedPath(PATH_DATA, { strokeWidth: 6 });

		expect(tracedPath.width).toBeCloseTo(fabricPath.width, 5);
		expect(tracedPath.height).toBeCloseTo(fabricPath.height, 5);
		expect(tracedPath.pathOffset.x).toBeCloseTo(fabricPath.pathOffset.x, 5);
		expect(tracedPath.pathOffset.y).toBeCloseTo(fabricPath.pathOffset.y, 5);
		expect(tracedPath.complexity()).toBe(fabricPath.complexity());
		expect(tracedPath.toSVG()).toBe(fabricPath.toSVG());

		const expected = commandRecorder();
		const actual = commandRecorder();
		fabricPath._renderPathCommands(expected.context);
		tracedPath._renderPathCommands(actual.context);
		expect(actual.calls).toEqual(expected.calls);
	});

	it("materializes detached compatibility data without retaining a path field", () => {
		const tracedPath = new TracedPath(PATH_DATA, {});
		expect(Object.hasOwn(tracedPath, "path")).toBe(false);

		const first = tracedPath.path;
		(first[0] as ["M", number, number])[1] = 999;

		expect(tracedPath.path[0][1]).toBeCloseTo(2.25, 5);
		expect(Object.hasOwn(tracedPath, "path")).toBe(false);
	});
});

describe("OptimizedPencilStroke compact geometry", () => {
	it("serializes directly to the existing compressed trace format", async () => {
		const path: TSimplePathData = [
			["M", 1.2, 3.4],
			["Q", 2.2, 4.4, 5.6, 7.8],
			["L", 9.1, 10.2],
		];
		const stroke = new OptimizedPencilStroke(path, {
			fill: null,
			stroke: "#123456",
			strokeWidth: 4,
		});

		const serialized = stroke.toObject();
		expect(serialized.path).toBeUndefined();
		expect(serialized.compressedTrace).toEqual([
			"M",
			12,
			34,
			"Q",
			10,
			10,
			44,
			44,
			"L",
			35,
			24,
		]);
		expect(Object.hasOwn(stroke, "path")).toBe(false);

		const restored = await OptimizedPencilStroke.fromObject(serialized);
		expect(restored.path).toEqual(stroke.path);
		expect(restored.width).toBeCloseTo(stroke.width, 5);
		expect(restored.height).toBeCloseTo(stroke.height, 5);
	});
});
