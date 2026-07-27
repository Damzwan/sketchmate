import { describe, expect, it } from "vitest";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";

describe("WaterColorStroke compact rehydration", () => {
	it("does not expand or mutate the source JSON", async () => {
		const source: any = {
			type: "WaterColorStroke",
			compressedTrace: [100, 200, 10, 5, 10, 5],
			stroke: "#123456",
			strokeWidth: 8,
			fill: "",
			width: 3,
			height: 2,
			pathOffset: { x: 11, y: 21 },
		};
		const original = JSON.parse(JSON.stringify(source));

		const stroke = await WaterColorStroke.fromObject(source);

		expect(source).toEqual(original);
		expect(source.path).toBeUndefined();
		expect(stroke.path.length).toBeGreaterThan(0);
		expect(stroke.compressedTrace).toBe(source.compressedTrace);
		expect((stroke as any).basePoints).toBeUndefined();
		expect(stroke.toObject().compressedTrace).toBe(stroke.compressedTrace);
	});
});
