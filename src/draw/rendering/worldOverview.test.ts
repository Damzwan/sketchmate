import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldOverview } from "./worldOverview";

class FakeOffscreenCanvas {
	static instances: FakeOffscreenCanvas[] = [];
	width: number;
	height: number;
	readonly context = {
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		transform: vi.fn(),
		drawImage: vi.fn(),
		fillStyle: "",
		imageSmoothingEnabled: false,
		imageSmoothingQuality: "low",
	};
	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		FakeOffscreenCanvas.instances.push(this);
	}
	getContext() {
		return this.context;
	}
	convertToBlob() {
		return Promise.resolve(new Blob(["preview"], { type: "image/webp" }));
	}
}

describe("WorldOverview backing-store lifecycle", () => {
	afterEach(() => {
		FakeOffscreenCanvas.instances = [];
		vi.unstubAllGlobals();
	});

	it("shrinks replaced and reset overview canvases immediately", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 64,
		}) as any;
		const yielder = { reset: vi.fn(), maybeYield: vi.fn(async () => {}) };
		const bounds = { x: 0, y: 0, w: 100, h: 100 };

		await overview.rebuildIfNeeded(
			bounds,
			yielder,
			new AbortController().signal,
		);
		const first = overview.canvas as FakeOffscreenCanvas;
		expect(first.width).toBeGreaterThan(0);

		overview.markDirty();
		await overview.rebuildIfNeeded(
			bounds,
			yielder,
			new AbortController().signal,
		);
		const second = overview.canvas as FakeOffscreenCanvas;
		expect(second).not.toBe(first);
		expect(first).toMatchObject({ width: 0, height: 0 });

		overview.reset();
		expect(second).toMatchObject({ width: 0, height: 0 });
	});

	it("snaps localized patch boundaries to overview pixels", () => {
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;

		expect(overview.patchRect({ x: 10.25, y: 20.75, w: 10, h: 8 })).toBe(true);
		expect(overview.ctx.clearRect).toHaveBeenCalledWith(8, 18, 15, 13);
		// Empty old footprints need no Fabric render and stay synchronous.
		expect(overview.ctx.rect).not.toHaveBeenCalled();
	});

	it("renders non-empty localized patches off-screen and commits once", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const object = {
			id: "heavy",
			getBoundingRect: () => ({ left: 10, top: 20, width: 10, height: 8 }),
		};
		const render = vi.fn();
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview({ query: () => [object] }, render, {
			px: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;
		const yielder = {
			maybeYield: vi.fn(async () => {}),
			reset: vi.fn(),
			shouldYield: vi.fn(() => false),
			yield: vi.fn(async () => {}),
		};

		// Any object makes the synchronous API decline before it clears pixels.
		expect(overview.patchRect({ x: 10, y: 20, w: 10, h: 8 }, 8)).toBe(false);
		expect(canvas.context.clearRect).not.toHaveBeenCalled();

		const patched = await overview.patchRectYielded(
			{ x: 10, y: 20, w: 10, h: 8 },
			8,
			yielder,
			new AbortController().signal,
		);

		expect(patched).toBe(true);
		expect(render).toHaveBeenCalledOnce();
		expect(yielder.maybeYield).toHaveBeenCalledOnce();
		// The live overview is touched only at final commit, never half-painted.
		expect(canvas.context.clearRect).toHaveBeenCalledOnce();
		expect(canvas.context.drawImage).toHaveBeenCalledOnce();
	});

	it("never commits a localized patch that is aborted after rendering", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const ctrl = new AbortController();
		const object = {
			id: "heavy",
			getBoundingRect: () => ({ left: 10, top: 20, width: 10, height: 8 }),
		};
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview({ query: () => [object] }, vi.fn(), {
			px: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;
		const yielder = {
			reset: vi.fn(),
			maybeYield: vi.fn(async () => ctrl.abort()),
		};

		await expect(
			overview.patchRectYielded(
				{ x: 10, y: 20, w: 10, h: 8 },
				8,
				yielder,
				ctrl.signal,
			),
		).resolves.toBe(false);
		expect(canvas.context.clearRect).not.toHaveBeenCalled();
		expect(canvas.context.drawImage).not.toHaveBeenCalled();
	});

	it("keeps the reusable patch surface within its pixel budget", () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const overview = new WorldOverview({ query: () => [] }, vi.fn(), {
			px: 768,
		}) as any;

		const scratch = overview.acquirePatchCanvas(768, 48) as FakeOffscreenCanvas;
		expect(scratch.width * scratch.height).toBe(192 * 192);
		expect(overview.acquirePatchCanvas(48, 768)).toBe(scratch);
		expect(scratch.width * scratch.height).toBe(192 * 192);
	});

	it("declines an expensive synchronous eraser stamp", () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const render = vi.fn();
		const canvas = new FakeOffscreenCanvas(100, 100);
		const object = {
			id: "clipped",
			__hasImageClip: true,
			getBoundingRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
		};
		const overview = new WorldOverview({ query: () => [object] }, render, {
			px: 100,
			syncCostBudget: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };

		expect(overview.eraseObject(object)).toBe(false);
		expect(render).not.toHaveBeenCalled();
	});

	it("yields and aborts while filtering cached bounds on a massive scene", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const entries = Array.from({ length: 600 }, (_, id) => ({
			obj: {
				id: String(id),
				getBoundingRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
			},
			bounds: { x: 0, y: 0, w: 10, h: 10 },
		}));
		const render = vi.fn();
		const overview = new WorldOverview(
			{
				query: () => entries.map((entry) => entry.obj),
				queryBounds: () => entries,
			},
			render,
			{ px: 64 },
		) as any;
		const ctrl = new AbortController();
		const yielder = {
			reset: vi.fn(),
			maybeYield: vi.fn(async () => ctrl.abort()),
		};

		await overview.rebuildIfNeeded(
			{ x: 0, y: 0, w: 100, h: 100 },
			yielder,
			ctrl.signal,
		);

		expect(yielder.maybeYield).toHaveBeenCalledOnce();
		expect(render).not.toHaveBeenCalled();
		expect(overview.canvas).toBeNull();
	});

	it("never samples transparent pixels beyond the overview bounds", () => {
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;
		const ctx = canvas.getContext() as any;

		overview.composite(ctx, [1, 0, 0, 1, 0.25, 0.25], { w: 101, h: 101 }, 1, {
			x: 0,
			y: 0,
			w: 100,
			h: 100,
		});

		const [, sx, sy, sw, sh] = ctx.drawImage.mock.calls[0];
		expect(sx).toBeGreaterThanOrEqual(0);
		expect(sy).toBeGreaterThanOrEqual(0);
		expect(sx + sw).toBeLessThanOrEqual(canvas.width);
		expect(sy + sh).toBeLessThanOrEqual(canvas.height);
	});

	it("creates a thumbnail from the existing overview without touching objects", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const query = vi.fn(() => []);
		const render = vi.fn();
		const source = new FakeOffscreenCanvas(1000, 500);
		const overview = new WorldOverview({ query }, render, { px: 1000 }) as any;
		overview.canvas = source;
		overview.ctx = source.getContext();
		overview.bounds = { x: 0, y: 0, w: 200, h: 100 };
		overview.sx = 5;
		overview.sy = 5;

		// 880 source px across the framed region, so 64 is a downscale — the case
		// the bitmap copy exists for.
		const blob = await overview.createThumbnailBlob(
			{ x: 20, y: 10, w: 160, h: 80 },
			64,
			0.72,
			"#f5e6d3",
		);

		expect(blob).toBeInstanceOf(Blob);
		expect(query).not.toHaveBeenCalled();
		expect(render).not.toHaveBeenCalled();
		const output = FakeOffscreenCanvas.instances.at(-1)!;
		expect(output).not.toBe(source);
		expect(output.context.fillStyle).toBe("#f5e6d3");
		expect(output.context.drawImage).toHaveBeenCalledOnce();
		expect(output).toMatchObject({ width: 0, height: 0 });
		// Encoding the private output must never release the engine-owned source.
		expect(source).toMatchObject({ width: 1000, height: 500 });
	});

	it("clamps to the pixels it holds instead of upscaling", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const source = new FakeOffscreenCanvas(500, 250);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 500,
		}) as any;
		overview.canvas = source;
		overview.ctx = source.getContext();
		overview.bounds = { x: 0, y: 0, w: 200, h: 100 };
		overview.sx = 2.5;
		overview.sy = 2.5;

		// 440 source px across the framed region against a 640px request. Upscaling
		// those is what made previews of light drawings blurry — and refusing
		// outright made the expensive document re-render the normal case for every
		// autosave. Emit the sharp 440.
		const blob = await overview.createThumbnailBlob(
			{ x: 20, y: 10, w: 160, h: 80 },
			640,
			0.72,
			"#f5e6d3",
		);

		expect(blob).toBeInstanceOf(Blob);
		const output = FakeOffscreenCanvas.instances.at(-1)!;
		const [, , , , , , , width, height] =
			output.context.drawImage.mock.calls[0];
		expect(width).toBe(440);
		expect(height).toBe(220);
	});

	it("refuses a thumbnail too small to serve as a preview", async () => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		const source = new FakeOffscreenCanvas(100, 50);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 100,
		}) as any;
		overview.canvas = source;
		overview.ctx = source.getContext();
		overview.bounds = { x: 0, y: 0, w: 200, h: 100 };
		overview.sx = 0.5;
		overview.sy = 0.5;

		// 88 px is below the floor: the caller re-renders from the document, where
		// vectors rasterize at whatever size is asked for.
		const blob = await overview.createThumbnailBlob(
			{ x: 20, y: 10, w: 160, h: 80 },
			640,
			0.72,
			"#f5e6d3",
		);

		expect(blob).toBeNull();
	});
});

describe("WorldOverview transform stamp", () => {
	afterEach(() => {
		FakeOffscreenCanvas.instances = [];
		vi.unstubAllGlobals();
	});

	function mounted() {
		const canvas = new FakeOffscreenCanvas(100, 100);
		const overview = new WorldOverview({ query: () => [] }, () => {}, {
			px: 100,
		}) as any;
		overview.canvas = canvas;
		overview.ctx = canvas.getContext();
		overview.bounds = { x: 0, y: 0, w: 100, h: 100 };
		overview.sx = 1;
		overview.sy = 1;
		overview.dirty = false;
		return { canvas, overview };
	}

	it("stamps the drag bitmap without dirtying the overview", () => {
		const { canvas, overview } = mounted();
		const bmp = {} as ImageBitmap;

		expect(
			overview.stampRegion(
				{ x: 10, y: 10, w: 20, h: 20 },
				bmp,
				[1, 0, 0, 1, 10, 10],
			),
		).toBe(true);
		expect(canvas.context.transform).toHaveBeenCalledWith(1, 0, 0, 1, 10, 10);
		expect(canvas.context.drawImage).toHaveBeenCalledWith(bmp, 0, 0);
		// At overview zoom `isRegionReady` is `!isDirty()`. Going dirty here is what
		// left the drag layers waiting out a whole-board rebuild after every move.
		expect(overview.isDirty()).toBe(false);
	});

	it("clears the vacated footprint before drawing its replacement", () => {
		const { canvas, overview } = mounted();

		expect(
			overview.stampRegion(
				{ x: 10, y: 20, w: 30, h: 40 },
				{} as ImageBitmap,
				[1, 0, 0, 1, 10, 20],
				true,
			),
		).toBe(true);
		expect(canvas.context.clearRect).toHaveBeenCalledWith(10, 20, 30, 40);
	});

	it("declines a region the bitmap does not map", () => {
		const { canvas, overview } = mounted();

		// Only a rebuild can grow the mapping, so the caller keeps its fallback.
		expect(
			overview.stampRegion(
				{ x: 90, y: 90, w: 40, h: 40 },
				{} as ImageBitmap,
				[1, 0, 0, 1, 90, 90],
			),
		).toBe(false);
		expect(canvas.context.drawImage).not.toHaveBeenCalled();
	});

	it("hands a half-written clear to the rebuild instead of leaving a hole", () => {
		const { canvas, overview } = mounted();
		canvas.context.drawImage.mockImplementationOnce(() => {
			throw new Error("detached bitmap");
		});

		expect(
			overview.stampRegion(
				{ x: 10, y: 10, w: 20, h: 20 },
				{} as ImageBitmap,
				[1, 0, 0, 1, 10, 10],
				true,
			),
		).toBe(false);
		expect(overview.isDirty()).toBe(true);
	});
});
