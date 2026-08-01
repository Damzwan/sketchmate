import { ActiveSelection, Rect } from "fabric";
import { describe, expect, it, vi } from "vitest";
import { setLiveTransformCoords } from "./liveTransformCoords";

describe("setLiveTransformCoords", () => {
	it("updates an ActiveSelection wrapper without walking its children", () => {
		const first = new Rect({ width: 10, height: 10 });
		const second = new Rect({ left: 20, width: 10, height: 10 });
		const selection = new ActiveSelection([first, second]);
		const firstCoords = vi.spyOn(first, "setCoords");
		const secondCoords = vi.spyOn(second, "setCoords");

		selection.left += 5;
		setLiveTransformCoords(selection);

		expect(firstCoords).not.toHaveBeenCalled();
		expect(secondCoords).not.toHaveBeenCalled();
		expect(selection.aCoords).toBeDefined();
	});

	it("keeps the normal coordinate path for a single object", () => {
		const rect = new Rect({ width: 10, height: 10 });
		const setCoords = vi.spyOn(rect, "setCoords");

		setLiveTransformCoords(rect);

		expect(setCoords).toHaveBeenCalledOnce();
	});
});
