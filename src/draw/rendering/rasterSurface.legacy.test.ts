import { afterEach, describe, expect, it, vi } from "vitest";

const originalDocument = globalThis.document;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;

afterEach(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		writable: true,
		value: originalDocument,
	});
	Object.defineProperty(globalThis, "OffscreenCanvas", {
		configurable: true,
		writable: true,
		value: originalOffscreenCanvas,
	});
	vi.resetModules();
});

describe("legacy raster surface", () => {
	it("uses a detached DOM canvas when OffscreenCanvas is unavailable", async () => {
		const canvas = { width: 0, height: 0 };
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			writable: true,
			value: { createElement: vi.fn(() => canvas) },
		});
		Object.defineProperty(globalThis, "OffscreenCanvas", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		vi.resetModules();

		const { createRasterSurface, RASTER_PREFERS_DOM_CANVAS } = await import(
			"./rasterSurface"
		);
		const surface = createRasterSurface(320, 240);

		expect(RASTER_PREFERS_DOM_CANVAS).toBe(true);
		expect(surface).toBe(canvas);
		expect(canvas).toMatchObject({ width: 320, height: 240 });
	});
});
