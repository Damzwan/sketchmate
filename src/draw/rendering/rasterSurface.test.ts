import { describe, expect, it } from "vitest";
import {
	createRasterSurface,
	isDomCanvas,
	RASTER_PREFERS_DOM_CANVAS,
	releaseRasterSurface,
	snapshotRaster,
} from "./rasterSurface";

class FakeOffscreen {
	width: number;
	height: number;
	transfers = 0;
	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}
	getContext() {
		return {} as any;
	}
	transferToImageBitmap() {
		this.transfers++;
		return { __bitmap: true } as any;
	}
}

describe("rasterSurface", () => {
	it("stays on OffscreenCanvas off-DOM, so headless callers never touch document", () => {
		// The headless test environment has no `document`. Preferring a DOM canvas
		// there would make every tile bake throw rather than merely be slow.
		expect(RASTER_PREFERS_DOM_CANVAS).toBe(false);
	});

	it("classifies an OffscreenCanvas as not a DOM canvas", () => {
		expect(isDomCanvas(new FakeOffscreen(4, 4) as any)).toBe(false);
	});

	it("classifies a surface without transferToImageBitmap as a DOM canvas", () => {
		const canvas = { width: 4, height: 4, getContext: () => ({}) };
		expect(isDomCanvas(canvas as any)).toBe(true);
	});

	it("snapshots an OffscreenCanvas into a NEW bitmap the caller owns", () => {
		const surface = new FakeOffscreen(8, 8);
		const produced = snapshotRaster(surface as any);
		expect(surface.transfers).toBe(1);
		// Not the surface → the caller pools the surface and stores the bitmap.
		expect(produced).not.toBe(surface);
	});

	it("hands back the SURFACE itself when there is nothing cheaper to snapshot", () => {
		// The Gecko shape: the canvas is the tile, so the caller must adopt it
		// rather than return it to the scratch pool.
		const canvas = { width: 8, height: 8, getContext: () => ({}) };
		expect(snapshotRaster(canvas as any)).toBe(canvas);
	});

	it("reports a failed snapshot as null rather than throwing at the bake site", () => {
		const surface = {
			width: 8,
			height: 8,
			getContext: () => ({}),
			transferToImageBitmap: () => {
				throw new Error("out of memory");
			},
		};
		expect(snapshotRaster(surface as any)).toBeNull();
	});

	it("releases a backing store by zeroing it, for both surface kinds", () => {
		const surface = new FakeOffscreen(64, 64);
		releaseRasterSurface(surface as any);
		expect(surface.width).toBe(0);
		expect(surface.height).toBe(0);
	});

	it("creates an OffscreenCanvas at the requested size off-DOM", () => {
		const previous = (globalThis as any).OffscreenCanvas;
		(globalThis as any).OffscreenCanvas = FakeOffscreen;
		try {
			const surface = createRasterSurface(388, 388) as unknown as FakeOffscreen;
			expect(surface.width).toBe(388);
			expect(surface.height).toBe(388);
		} finally {
			(globalThis as any).OffscreenCanvas = previous;
		}
	});
});
