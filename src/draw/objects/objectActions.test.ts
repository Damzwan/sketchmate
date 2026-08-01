import { describe, expect, it } from "vitest";
import { Rect, type Canvas } from "fabric";
import { fitAndCenterSavedObjects } from "./savedObjectPlacement";

function canvas(width: number, height: number, zoom = 1): Canvas {
	return {
		getWidth: () => width,
		getHeight: () => height,
		getZoom: () => zoom,
		viewportTransform: [zoom, 0, 0, zoom, 0, 0],
	} as unknown as Canvas;
}

function sceneBounds(objects: Rect[]) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const object of objects) {
		const bounds = object.getBoundingRect();
		minX = Math.min(minX, bounds.left);
		minY = Math.min(minY, bounds.top);
		maxX = Math.max(maxX, bounds.left + bounds.width);
		maxY = Math.max(maxY, bounds.top + bounds.height);
	}
	return {
		left: minX,
		top: minY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

describe("saved drawing placement", () => {
	it("fits and centers a detached scene without an ActiveSelection", async () => {
		const objects = [
			new Rect({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
				originX: "center",
				originY: "center",
			}),
			new Rect({
				left: 1_000,
				top: 0,
				width: 100,
				height: 100,
				originX: "center",
				originY: "center",
			}),
		];

		await fitAndCenterSavedObjects(objects, canvas(1_000, 500));

		const bounds = sceneBounds(objects);
		expect(bounds.width).toBeLessThanOrEqual(800.01);
		expect(bounds.height).toBeLessThanOrEqual(400.01);
		expect(bounds.left + bounds.width / 2).toBeCloseTo(500, 4);
		expect(bounds.top + bounds.height / 2).toBeCloseTo(250, 4);
	});

	it("preserves an object's non-uniform scale ratio", async () => {
		const object = new Rect({
			left: 0,
			top: 0,
			width: 1_000,
			height: 100,
			scaleX: 2,
			scaleY: 1,
			originX: "center",
			originY: "center",
		});
		const ratio = object.scaleX / object.scaleY;

		await fitAndCenterSavedObjects([object], canvas(500, 500));

		expect(object.scaleX / object.scaleY).toBeCloseTo(ratio, 6);
	});
});
