import type { FabricObject } from "fabric";
import { describe, expect, it } from "vitest";
import { ExplicitZIndex } from "./zIndex";

function object(id: string): FabricObject {
	return { id } as FabricObject;
}

describe("ExplicitZIndex", () => {
	it("places restored objects between their canvas neighbors", () => {
		const back = object("back");
		const front = object("front");
		const restored = object("restored");
		const canvas = [back, front];
		const objects = new Map([
			[back.id, back],
			[front.id, front],
		]);
		const zIndex = new ExplicitZIndex(() => canvas, objects);
		zIndex.seed(canvas);

		canvas.splice(1, 0, restored);
		objects.set(restored.id, restored);
		zIndex.assignOnAdd(restored);

		expect(zIndex.get(["back", "restored", "front"])).toEqual([0, 0.5, 1]);
	});

	it("keeps selected objects in relative order during layer changes", () => {
		const objects = ["a", "b", "c", "d"].map(object);
		const byId = new Map(objects.map((item) => [item.id, item]));
		const zIndex = new ExplicitZIndex(() => objects, byId);
		zIndex.seed(objects);

		zIndex.toFront(["b", "c"]);
		expect(zIndex.get(["a", "d", "b", "c"])).toEqual([0, 3, 4, 5]);

		zIndex.downOne(["b", "c"]);
		expect(zIndex.get(["a", "b", "c", "d"])).toEqual([0, 3, 4, 5]);
	});

	it("updates object stamps without rebuilding a clean map", () => {
		const first = object("first");
		const second = object("second");
		const canvas = [first];
		const objects = new Map([[first.id, first]]);
		const zIndex = new ExplicitZIndex(() => canvas, objects);
		zIndex.seed(canvas);
		void zIndex.objectMap;

		canvas.push(second);
		objects.set(second.id, second);
		zIndex.assignOnAdd(second);

		expect((second as any).__z).toBe(1);
		expect(zIndex.objectMap.get(second)).toBe(1);
	});
});
