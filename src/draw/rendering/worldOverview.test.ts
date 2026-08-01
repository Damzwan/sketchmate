import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldOverview } from "./worldOverview";

class FakeOffscreenCanvas {
	width: number;
	height: number;
	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}
	getContext() {
		return {
			setTransform: vi.fn(),
			clearRect: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			rect: vi.fn(),
			clip: vi.fn(),
			drawImage: vi.fn(),
		};
	}
}

describe("WorldOverview backing-store lifecycle", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("shrinks replaced and reset overview canvases immediately", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const overview = new WorldOverview(
			{ query: () => [] },
			() => {},
			{ px: 64 },
		) as any;
		const yielder = { reset: vi.fn(), maybeYield: vi.fn(async () => {}) };
		const bounds = { x: 0, y: 0, w: 100, h: 100 };

		await overview.rebuildIfNeeded(bounds, yielder, new AbortController().signal);
		const first = overview.canvas as FakeOffscreenCanvas;
		expect(first.width).toBeGreaterThan(0);

		overview.markDirty();
		await overview.rebuildIfNeeded(bounds, yielder, new AbortController().signal);
		const second = overview.canvas as FakeOffscreenCanvas;
		expect(second).not.toBe(first);
		expect(first).toMatchObject({ width: 0, height: 0 });

		overview.reset();
		expect(second).toMatchObject({ width: 0, height: 0 });
	});

	it("snaps localized patch boundaries to overview pixels", () => {
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview(
			{ query: () => [] },
			() => {},
			{ px: 100 },
		) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;

		expect(overview.patchRect({ x: 10.25, y: 20.75, w: 10, h: 8 })).toBe(
			true,
		);
		expect(overview.ctx.clearRect).toHaveBeenCalledWith(8, 18, 15, 13);
		expect(overview.ctx.rect).toHaveBeenCalledWith(8, 18, 15, 13);
	});

	it("never samples transparent pixels beyond the overview bounds", () => {
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview(
			{ query: () => [] },
			() => {},
			{ px: 100 },
		) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;
		const ctx = canvas.getContext() as any;

		overview.composite(
			ctx,
			[1, 0, 0, 1, 0.25, 0.25],
			{ w: 101, h: 101 },
			1,
			{ x: 0, y: 0, w: 100, h: 100 },
		);

		const [, sx, sy, sw, sh] = ctx.drawImage.mock.calls[0];
		expect(sx).toBeGreaterThanOrEqual(0);
		expect(sy).toBeGreaterThanOrEqual(0);
		expect(sx + sw).toBeLessThanOrEqual(canvas.width);
		expect(sy + sh).toBeLessThanOrEqual(canvas.height);
	});
});
