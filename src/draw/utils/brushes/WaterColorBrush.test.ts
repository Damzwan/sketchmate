import { describe, expect, it } from "vitest";
import {
	SIMPLIFY_CHUNK,
	WaterColorBrush,
	WaterColorStroke,
} from "@/draw/utils/brushes/WaterColorBrush";
import { Point } from "fabric";

/** A canvas stub that records nothing — the preview render still runs through
 *  it, so the real `_render` path is exercised rather than stepped around. */
function brushFor(width: number) {
	const ctx = {
		save: () => {},
		restore: () => {},
		transform: () => {},
		beginPath: () => {},
		moveTo: () => {},
		lineTo: () => {},
		quadraticCurveTo: () => {},
		stroke: () => {},
	};
	const brush = new WaterColorBrush({
		contextTop: ctx,
		viewportTransform: [1, 0, 0, 1, 0, 0],
		clearContext: () => {},
	} as any);
	brush.width = width;
	brush.onMouseDown(new Point(0, 0));
	return brush as any;
}

describe("WaterColorBrush preview/commit agreement", () => {
	/** Drive the brush the way a hand does: dense samples with sub-pixel tremor. */
	function draw(brush: any, count: number) {
		let seed = 1;
		const random = () => {
			seed = Math.sin(seed * 12.9898) * 43758.5453;
			return seed - Math.floor(seed);
		};
		for (let i = 0; i < count; i++) {
			brush._addPoint(
				new Point(i * 0.3, Math.sin(i / 40) * 25 + (random() - 0.5) * 0.35),
			);
		}
	}

	it("previews the exact points it will commit", () => {
		const brush = brushFor(20);
		draw(brush, 400);

		// What the preview drew last, and what a release would commit, are the
		// same array — the release cannot change the stroke's shape.
		const previewed = brush._strokePoints();
		const committed = brush._strokePoints();
		expect(committed).toEqual(previewed);
		expect(previewed.length).toBeLessThan(100);
	});

	it("keeps the frozen prefix stable as the stroke grows", () => {
		const brush = brushFor(20);
		draw(brush, 200);
		const early = brush._strokePoints();
		const frozenCount = brush._frozen.length;
		draw(brush, 200);
		const later = brush._strokePoints();

		// Everything already frozen is final: the preview never re-flows behind
		// the pointer, which is what makes incremental simplification safe.
		expect(later.slice(0, frozenCount)).toEqual(early.slice(0, frozenCount));
		expect(brush._frozen.length).toBeGreaterThan(frozenCount);
	});

	it("bounds the work per pointer move", () => {
		const brush = brushFor(20);
		draw(brush, 500);
		// The tail is what gets re-simplified on every move; the prefix never is.
		expect(brush._tail.length).toBeLessThanOrEqual(SIMPLIFY_CHUNK + 1);
	});
});

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
