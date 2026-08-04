// @vitest-environment jsdom
//
// renderQuality.config reads `@ionic/vue`'s isPlatform at module scope, which
// touches `window`. The sizing maths itself is pure.
import { describe, expect, it, vi } from "vitest";
import { MAX_RENDER_SCALE } from "@/draw/config/renderQuality.config";
import {
	FLATTENED_LAYER_MAX_DIMENSION,
	FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION,
	flattenRasterSize,
	rasterizeObjectsToImages,
} from "./savedObjectFlatten";

const RASTER_PX = 256;

// PARTIAL mock: the rest of the draw module imports fabric at module scope
// (brushes subclass BaseBrush), so replacing the whole module breaks the import
// graph before any test runs. Only the raster's output container is stubbed.
vi.mock("fabric", async (importOriginal) => ({
	...((await importOriginal()) as object),
	Image: {
		fromURL: vi.fn(async () => {
			const props: Record<string, any> = {};
			return {
				width: RASTER_PX,
				height: RASTER_PX,
				props,
				set: (p: Record<string, any>) => Object.assign(props, p),
				setCoords: () => {},
			};
		}),
	},
}));

vi.mock("@/draw/document/export", () => ({
	computeBounds: (_objects: any[], padding: number) => ({
		minX: 100 - padding,
		minY: 200 - padding,
		width: 400 + padding * 2,
		height: 400 + padding * 2,
	}),
	exportBoundingBoxImage: vi.fn(async () => ({
		img: "data:image/png;base64,x",
	})),
}));

const MAX_DIM = FLATTENED_LAYER_MAX_DIMENSION;

describe("flatten raster sizing", () => {
	it("renders small content at full render scale", () => {
		// The "draw a couple of lines and they get worse" case: at scale 1 the
		// raster carries fewer pixels than the vector strokes it replaced, because
		// the canvas paints it onto a MAX_RENDER_SCALE backing store.
		const extent = 400;
		expect(flattenRasterSize(extent, MAX_DIM) / extent).toBe(MAX_RENDER_SCALE);
	});

	it("never upscales past the render scale", () => {
		// More pixels than the compositor can show is pure cost.
		for (const extent of [10, 100, 800]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeLessThanOrEqual(
				extent * MAX_RENDER_SCALE,
			);
		}
	});

	it("caps a big drawing at the ceiling rather than growing without bound", () => {
		// Staying ONE object means a big drawing does lose some resolution — the
		// trade the flatten confirmation warns about. What must not happen is an
		// unbounded canvas allocation.
		for (const extent of [4_000, 20_000, 100_000]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeLessThanOrEqual(MAX_DIM);
		}
	});

	it("keeps a room flatten inside the wire budget", () => {
		// A replicated raster crosses the wire on the add and inside every undo of
		// it, so a room trades resolution for a bounded payload.
		const size = flattenRasterSize(4_000, FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION);
		expect(size).toBeLessThanOrEqual(FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION);
	});

	it("always produces a positive size for real content", () => {
		for (const extent of [1, 50, 4_000, 100_000]) {
			expect(flattenRasterSize(extent, MAX_DIM)).toBeGreaterThan(0);
		}
	});
});

describe("flatten placement", () => {
	const raster = async () => {
		const [image] = (await rasterizeObjectsToImages([{} as any], {
			maxDimension: MAX_DIM,
		})) as any[];
		return image.props;
	};

	it("uses the document's centre origin", async () => {
		// `InteractiveFabricObject.ownDefaults` (fabricSetup.ts) makes EVERY object
		// centre-origin, and fabric rotates/scales about the origin. A left/top
		// raster in a centre-origin scene swings around its top-left corner under
		// the rotate gesture instead of turning in place.
		const props = await raster();
		expect(props.originX).toBe("center");
		expect(props.originY).toBe("center");
	});

	it("still covers exactly the padded content box", async () => {
		// The origin change must move coordinates, not the artwork.
		const props = await raster();
		const width = props.scaleX * RASTER_PX;
		const height = props.scaleY * RASTER_PX;

		expect(props.left - width / 2).toBe(50); // minX: 100 - 50 padding
		expect(props.top - height / 2).toBe(150); // minY: 200 - 50 padding
		expect(width).toBe(500); // 400 + 2 x 50 padding
		expect(height).toBe(500);
	});
});
