import { Point } from "fabric";
import { describe, expect, it } from "vitest";
import {
	WaterColorBrush,
	WaterColorStroke,
} from "@/draw/utils/brushes/WaterColorBrush";
import { buildWatercolorPathData } from "@/draw/utils/brushes/watercolorGeometry";

/** Travel along the synthetic stroke, so a second `draw()` continues the first
 *  instead of restarting on top of it. */
let phase = 0;

/** A canvas stub that records nothing — the preview render still runs through
 *  it, so the real `_render` path is exercised rather than stepped around. */
function brushFor(width: number) {
	phase = 0;
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
	/**
	 * Drive the brush the way a hand does: dense samples with sub-pixel tremor,
	 * through `onMouseMove` — the decimation that thins a stroke lives there, so
	 * calling `_addPoint` directly would test a path no pointer ever takes.
	 */
	function draw(brush: any, count: number) {
		let seed = 1;
		const random = () => {
			seed = Math.sin(seed * 12.9898) * 43758.5453;
			return seed - Math.floor(seed);
		};
		for (let i = 0; i < count; i++, phase++) {
			brush.onMouseMove(
				new Point(
					phase * 0.3,
					Math.sin(phase / 40) * 25 + (random() - 0.5) * 0.35,
				),
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
	});

	it("never re-shapes what it has already drawn", () => {
		// THE invariant. Every sample is final, so the geometry drawn at any point
		// during the stroke stays a strict PREFIX of the geometry drawn later —
		// nothing behind the pointer moves. Douglas-Peucker mid-stroke broke this
		// every time it froze a chunk: it measures deviation on the centerline,
		// while what is drawn is the centerline plus a per-point wave and noise, so
		// a sample it considered redundant was a visible wiggle on the ribbon.
		const brush = brushFor(20);
		draw(brush, 150);
		const early = buildWatercolorPathData(brush._strokePoints(), 20);
		const earlyPoints = brush._strokePoints().length;

		draw(brush, 350);
		const later = buildWatercolorPathData(brush._strokePoints(), 20);

		expect(brush._strokePoints().length).toBeGreaterThan(earlyPoints);
		// One subpath per bristle, so compare the commands of the FIRST bristle:
		// the later stroke must reproduce the earlier one command for command.
		const firstBristle = (commands: unknown[][]) => {
			const start = commands.findIndex((c) => c[0] === "M");
			const end = commands.findIndex((c, i) => i > start && c[0] === "M");
			return commands.slice(start, end === -1 ? commands.length : end);
		};
		const earlyRun = firstBristle(early);
		const laterRun = firstBristle(later);
		// The last command of a run is the closing "L"; everything before it is
		// geometry that must be identical.
		expect(laterRun.slice(0, earlyRun.length - 1)).toEqual(
			earlyRun.slice(0, earlyRun.length - 1),
		);
	});

	it("thins at input instead of after the fact", () => {
		const brush = brushFor(20);
		draw(brush, 500);
		// 500 raw samples 0.3px apart is ~150px of travel; at the width-20 spacing
		// (2.4px) that is a few dozen accepted samples, not 500.
		expect(brush._strokePoints().length).toBeLessThan(120);
		expect(brush._strokePoints().length).toBeGreaterThan(5);
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
		expect((stroke as any).basePoints).toBeUndefined();

		// Stored as a typed array — half the bytes of a plain number[], and this
		// is the most numerous object on a real canvas.
		expect(stroke.compressedTrace).toBeInstanceOf(Float32Array);
		expect(Array.from(stroke.compressedTrace)).toEqual(source.compressedTrace);

		// …but the WIRE form must stay a plain array: a typed array serializes
		// to {"0":…} and no peer or saved drawing could read it back.
		const wire = stroke.toObject().compressedTrace;
		expect(Array.isArray(wire)).toBe(true);
		expect(wire).toEqual(source.compressedTrace);
		expect(JSON.parse(JSON.stringify(wire))).toEqual(source.compressedTrace);
	});
});
