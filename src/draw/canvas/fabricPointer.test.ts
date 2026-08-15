import { describe, expect, it, vi } from "vitest";
import { resolveFabricViewportPoint } from "./fabricPointer";

describe("resolveFabricViewportPoint", () => {
	it("uses Fabric 7's viewportPoint", () => {
		const getViewportPoint = vi.fn();
		const point = resolveFabricViewportPoint(
			{ getViewportPoint },
			{ viewportPoint: { x: 12, y: 34 }, e: {} },
		);

		expect(point).toEqual({ x: 12, y: 34 });
		expect(getViewportPoint).not.toHaveBeenCalled();
	});

	it("falls back to deriving the point from the native event", () => {
		const nativeEvent = {};
		const getViewportPoint = vi.fn(() => ({ x: 5, y: 8 }));

		expect(
			resolveFabricViewportPoint(
				{ getViewportPoint },
				{ pointer: undefined, e: nativeEvent },
			),
		).toEqual({ x: 5, y: 8 });
		expect(getViewportPoint).toHaveBeenCalledWith(nativeEvent);
	});

	it("declines malformed events instead of dereferencing undefined", () => {
		expect(
			resolveFabricViewportPoint(
				{ getViewportPoint: vi.fn() },
				{ pointer: undefined },
			),
		).toBeNull();
	});
});
