import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useInstrumentStore } from "@/draw/tools/instruments/instrument.store";

/**
 * The invariant these cover: an instrument belongs to the DRAWING. Zooming and
 * panning change how it is displayed and nothing about what it measures.
 */

function makeCanvas(size = { width: 800, height: 600 }) {
	let vpt = [1, 0, 0, 1, 0, 0];
	return {
		upperCanvasEl: {
			getBoundingClientRect: () => ({
				width: size.width,
				height: size.height,
				left: 0,
				top: 0,
			}),
		},
		getZoom: () => vpt[0],
		get viewportTransform() {
			return vpt;
		},
		setZoom(zoom: number) {
			vpt = [zoom, 0, 0, zoom, vpt[4], vpt[5]];
		},
		pan(dx: number, dy: number) {
			vpt = [vpt[0], 0, 0, vpt[3], vpt[4] + dx, vpt[5] + dy];
		},
	};
}

describe("instruments are anchored to the drawing", () => {
	let canvas: ReturnType<typeof makeCanvas>;

	beforeEach(() => {
		setActivePinia(createPinia());
		canvas = makeCanvas();
	});

	function store() {
		const instruments = useInstrumentStore();
		instruments.init(canvas as any);
		return instruments;
	}

	it("keeps a ruler's world size and place across a zoom", () => {
		const instruments = store();
		instruments.select("ruler");
		const placed = { ...instruments.geometry } as any;

		canvas.setZoom(0.25);

		// Zooming out used to grow the world length (screen size was the truth),
		// so the ruler covered a different span of the drawing than the one it was
		// lined up with.
		expect(instruments.geometry).toEqual(placed);
	});

	it("keeps the compass radius — the circle it will draw — across a zoom", () => {
		const instruments = store();
		instruments.select("compass");
		const radius = (instruments.geometry as any).radius;

		canvas.setZoom(0.2);
		expect((instruments.geometry as any).radius).toBeCloseTo(radius, 9);

		canvas.setZoom(4);
		expect((instruments.geometry as any).radius).toBeCloseTo(radius, 9);
	});

	it("snaps to the stored geometry, not to the grabbability clamp", () => {
		const instruments = store();
		instruments.select("compass");
		const { center, radius } = instruments.geometry as any;

		// Far enough out that the display floor binds and shows a bigger circle
		// than the true one.
		canvas.setZoom(0.01);
		const displayed = instruments.displayGeometry() as any;
		expect(displayed.radius).toBeGreaterThan(radius);

		// The stroke must still land on the circle the user positioned.
		const start = { x: center.x + radius, y: center.y };
		instruments.beginStroke(start);
		const snapped = instruments.constrainStroke({
			x: center.x + radius * 4,
			y: center.y,
		});
		expect(Math.hypot(snapped.x - center.x, snapped.y - center.y)).toBeCloseTo(
			radius,
			6,
		);
	});

	it("stays put when the camera pans away, and comes back on request", () => {
		const instruments = store();
		instruments.select("ruler");
		const placed = { ...(instruments.geometry as any).center };

		canvas.pan(-4000, -4000);

		// No following: the ruler holds the stroke it was lined up with.
		expect((instruments.geometry as any).center).toEqual(placed);
		expect(instruments.isOutOfView()).toBe(true);

		instruments.recenter();
		expect(instruments.isOutOfView()).toBe(false);
		expect((instruments.geometry as any).center).not.toEqual(placed);
	});

	it("resizes in world units and holds that size through a zoom", () => {
		const instruments = store();
		instruments.select("compass");

		instruments.setCompassRadius((instruments.geometry as any).radius * 2);
		const resized = (instruments.geometry as any).radius;

		canvas.setZoom(0.5);
		expect((instruments.geometry as any).radius).toBeCloseTo(resized, 9);
	});
});
