import { describe, expect, it, vi } from "vitest";
import { toObjectWithoutSrc } from "@/draw/utils/brushes/brush.helpers";

/**
 * The procedural stroke classes (Crayon, Neon, Spray) are FabricImage
 * subclasses backed by a CANVAS. `Image.toObject()` reads `getSrc()`, which
 * PNG-encodes that canvas synchronously — and every one of those classes then
 * deleted the result. That encode is one atomic main-thread block per stroke on
 * every save/sync/history snapshot, which is the ANR shape we are fixing.
 */
describe("stroke serialization without the bitmap encode", () => {
	it("never calls getSrc while the base toObject runs", () => {
		const encode = vi.fn(() => "data:image/png;base64,AAAA");
		const stroke: any = { getSrc: undefined };
		Object.setPrototypeOf(stroke, { getSrc: encode });

		const out = toObjectWithoutSrc(
			stroke,
			(props) => ({ src: stroke.getSrc(), props }),
			["color"],
		);

		expect(encode).not.toHaveBeenCalled();
		expect(out.src).toBeUndefined();
		expect(out.props).toEqual(["color"]);
	});

	it("restores the prototype method, leaving no stub behind", () => {
		const encode = vi.fn(() => "encoded");
		const stroke: any = {};
		Object.setPrototypeOf(stroke, { getSrc: encode });

		toObjectWithoutSrc(stroke, () => ({}));

		expect(Object.hasOwn(stroke, "getSrc")).toBe(false);
		expect(stroke.getSrc()).toBe("encoded");
	});

	it("restores an OWN getSrc override (the eraser's memoized clip source)", () => {
		const own = vi.fn(() => "memoized");
		const stroke: any = { getSrc: own };

		toObjectWithoutSrc(stroke, () => ({}));

		expect(stroke.getSrc).toBe(own);
		expect(stroke.getSrc()).toBe("memoized");
	});

	it("restores getSrc even when the base toObject throws", () => {
		const encode = vi.fn(() => "encoded");
		const stroke: any = {};
		Object.setPrototypeOf(stroke, { getSrc: encode });

		expect(() =>
			toObjectWithoutSrc(stroke, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");
		expect(Object.hasOwn(stroke, "getSrc")).toBe(false);
	});
});
