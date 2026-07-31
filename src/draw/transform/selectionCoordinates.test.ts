import { ActiveSelection, FabricObject, Rect } from "fabric";
import { describe, expect, it } from "vitest";

describe("pure ActiveSelection translation", () => {
	it("translates child scene coordinates without recomputing child-local coordinates", () => {
		const child = new Rect({ left: 10, top: 20, width: 30, height: 40 });
		const other = new Rect({ left: 100, top: 80, width: 20, height: 10 });
		const selection = new ActiveSelection([child, other]);
		selection.setCoords();
		const childLocalCoords = child.aCoords;
		const before = child.getCoords();

		selection.left = (selection.left ?? 0) + 50;
		selection.top = (selection.top ?? 0) + 25;
		FabricObject.prototype.setCoords.call(selection);
		const after = child.getCoords();

		expect(child.aCoords).toBe(childLocalCoords);
		expect(
			after.map((point, index) => ({
				x: point.x - before[index].x,
				y: point.y - before[index].y,
			})),
		).toEqual([
			{ x: 50, y: 25 },
			{ x: 50, y: 25 },
			{ x: 50, y: 25 },
			{ x: 50, y: 25 },
		]);
	});
});
