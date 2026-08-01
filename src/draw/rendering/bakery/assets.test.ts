import { describe, expect, it } from "vitest";
import { BakeryAssets } from "./assets";

function createAssets() {
	return new BakeryAssets(() => false);
}

describe("BakeryAssets refusal classification", () => {
	it("keeps ordinary vector objects worker-compatible", () => {
		expect(
			createAssets().refusalReason({ id: "path", type: "path" }),
		).toBeNull();
		expect(
			createAssets().refusalReason({
				id: "selected-path",
				type: "path",
				group: { type: "ActiveSelection" },
			}),
		).toBeNull();
	});

	it("identifies the worker capability an object requires", () => {
		const assets = createAssets();

		expect(assets.refusalReason({ group: {} })).toBe("grouped");
		expect(assets.refusalReason({ type: "image" })).toBe("image");
		expect(assets.refusalReason({ text: "hello", fontFamily: "Unknown" })).toBe(
			"text",
		);
		expect(
			assets.refusalReason({
				clipPath: { _objects: [{ type: "image" }] },
			}),
		).toBe("imageClip");
	});
});
