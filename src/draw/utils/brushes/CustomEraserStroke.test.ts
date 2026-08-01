import { describe, expect, it } from "vitest";
import { Rect, type TSimplePathData } from "fabric";
import { eraseObject, OptimizedEraserStroke } from "./CustomEraserBrush";

const ERASER_PATH: TSimplePathData = [
	["M", 10.2, 20.4],
	["Q", 14.2, 24.4, 18.6, 28.8],
	["L", 22.1, 30.2],
];

const STYLE = {
	fill: null,
	stroke: "black",
	strokeWidth: 12,
	strokeLineCap: "round" as const,
	strokeLineJoin: "round" as const,
	globalCompositeOperation: "destination-out" as const,
};

describe("OptimizedEraserStroke compact geometry", () => {
	it("shares immutable geometry between per-target clones", () => {
		const source = new OptimizedEraserStroke(ERASER_PATH, {
			...STYLE,
			left: 40,
			top: 50,
		});
		const clone = new OptimizedEraserStroke(source, {
			...STYLE,
			left: source.left,
			top: source.top,
		});

		expect(clone._sharesCompactPathGeometryWith(source)).toBe(true);
		expect(clone.path).toEqual(source.path);
		expect(clone.width).toBeCloseTo(source.width, 5);
		expect(clone.height).toBeCloseTo(source.height, 5);
		expect(clone.pathOffset.x).toBeCloseTo(source.pathOffset.x, 5);
		expect(clone.pathOffset.y).toBeCloseTo(source.pathOffset.y, 5);

		const detached = clone.path;
		(detached[0] as ["M", number, number])[1] = 999;
		expect(source.path[0][1]).toBeCloseTo(10.2, 5);
	});

	it("uses the shared geometry clone in the real erase commit path", async () => {
		const source = new OptimizedEraserStroke(ERASER_PATH, STYLE);
		const target = new Rect({
			left: 10,
			top: 10,
			width: 100,
			height: 100,
			fill: "red",
		});

		const clone = (await eraseObject(target, source)) as OptimizedEraserStroke;

		expect(clone._sharesCompactPathGeometryWith(source)).toBe(true);
		expect((target.clipPath as any)._objects).toContain(clone);
	});

	it("preserves compressed serialization without retaining the loaded trace", async () => {
		const source = new OptimizedEraserStroke(ERASER_PATH, STYLE);
		const serialized = source.toObject();

		expect(serialized.path).toBeUndefined();
		expect(serialized.compressedTrace).toEqual([
			"M",
			102,
			204,
			"Q",
			40,
			40,
			84,
			84,
			"L",
			35,
			14,
		]);

		const restored = await OptimizedEraserStroke.fromObject(serialized);
		expect(restored.path).toEqual(source.path);
		expect(restored.globalCompositeOperation).toBe("destination-out");
		expect(Object.hasOwn(restored, "compressedTrace")).toBe(false);
	});
});
