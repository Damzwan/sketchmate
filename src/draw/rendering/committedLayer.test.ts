import { describe, expect, it, vi } from "vitest";
import {
	CommittedLayer,
	type Bounded,
	type SpatialIndex,
	type WorldRect,
} from "./committedLayer";

interface TestObject extends Bounded {}

function makeLayer(query: SpatialIndex<TestObject>["query"] = () => []) {
	const index: SpatialIndex<TestObject> = { query };
	return new CommittedLayer<TestObject>(index, () => {}, {
		tileSize: 256,
		overviewPx: 64,
		memoryBudgetMB: 32,
	});
}

function tile(
	tier: number,
	tx: number,
	ty: number,
	close = vi.fn(),
	usable = false,
) {
	return {
		value: {
			bitmap: { close } as unknown as ImageBitmap,
			tier,
			tx,
			ty,
			bytes: 256 * 256 * 4,
			builtGen: 0,
			lastUsed: 0,
			usable,
		},
		close,
	};
}

function fakeCtx() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		drawImage: vi.fn(),
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "low",
	} as unknown as CanvasRenderingContext2D & {
		drawImage: ReturnType<typeof vi.fn>;
		clip: ReturnType<typeof vi.fn>;
	};
}

describe("CommittedLayer safety bounds", () => {
	it("uses the first tile-backed tier as the minimum zoom", () => {
		const layer = makeLayer();

		expect(layer.pickActiveTier(layer.minTiledZoom)).toBeGreaterThan(
			layer.overviewTier,
		);
	});

	it("marks cross-tier tiles stale without closing their bitmaps", () => {
		const layer = makeLayer() as any;
		const stale = tile(3, 0, 0);
		const kept = tile(4, 0, 0);
		layer.tiles.set("3:0:0", stale.value);
		layer.tiles.set("4:0:0", kept.value);

		layer.dropOtherTiers({ x: 0, y: 0, w: 1, h: 1 }, 4);

		expect(stale.close).not.toHaveBeenCalled();
		expect(kept.close).not.toHaveBeenCalled();
		expect(layer.gen.get("3:0:0")).toBe(1);
		expect(layer.gen.get("4:0:0")).toBeUndefined();
	});

	it("never composites a stale active-tier bitmap", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const stale = tile(tier, 0, 0);
		layer.tiles.set(`${tier}:0:0`, stale.value);
		layer.gen.set(`${tier}:0:0`, 1);

		const ctx = fakeCtx();
		const overviewComposite = vi
			.spyOn(layer.overview, "composite")
			.mockImplementation(() => {});

		const result = layer.composite(
			ctx,
			[1, 0, 0, 1, 0, 0],
			{ w: 100, h: 100 },
			1,
			"#ffffff",
		);

		expect(ctx.drawImage).not.toHaveBeenCalled();
		expect(overviewComposite).toHaveBeenCalledOnce();
		expect(result.needsBake).toBe(true);
	});

	it("composites a stamped tile that is stale but usable", () => {
		// What a drag commit produces: pixels that match what the GPU layer just
		// showed, generation deliberately left behind so a bake still repaints it.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const stamped = tile(tier, 0, 0, vi.fn(), true);
		layer.tiles.set(`${tier}:0:0`, stamped.value);
		layer.gen.set(`${tier}:0:0`, 1);

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});

		const result = layer.composite(
			ctx,
			[1, 0, 0, 1, 0, 0],
			{ w: 100, h: 100 },
			1,
			"#ffffff",
		);

		expect(ctx.drawImage).toHaveBeenCalledOnce();
		// Still needs the bake — usable is not fresh.
		expect(result.needsBake).toBe(true);
	});

	it("keeps the sharp pixels outside a small edit", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = `${tier}:0:0`;
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		// The stale tile is drawn back on top of its cover, clipped to
		// (cell minus the edited sub-rect).
		expect(ctx.drawImage).toHaveBeenCalledOnce();
		expect(ctx.clip).toHaveBeenCalledWith("evenodd");
		expect(layer.tiles.get(key).usable).toBe(false);
	});

	it("drops the whole tile when the edit covers it", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		layer.tiles.set(`${tier}:0:0`, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markDirty({ x: -10_000, y: -10_000, w: 20_000, h: 20_000 });

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		expect(ctx.drawImage).not.toHaveBeenCalled();
	});

	it("markStale keeps the tile showable but queues a re-bake", () => {
		// An added topmost object: the tile is incomplete, not wrong — the live
		// overlay draws the new object, so the baked pixels must keep showing.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = `${tier}:0:0`;
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markStale({ x: 0, y: 0, w: 10, h: 10 });

		expect(layer.tiles.get(key).usable).toBe(true);
		expect(layer.dirtyRects.has(key)).toBe(false);

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		const result = layer.composite(
			ctx,
			[1, 0, 0, 1, 0, 0],
			{ w: 100, h: 100 },
			1,
			"#ffffff",
		);

		expect(ctx.drawImage).toHaveBeenCalledOnce(); // full tile, no clip
		expect(ctx.clip).not.toHaveBeenCalled();
		expect(result.needsBake).toBe(true);
	});

	it("falls back to a stale coarser tile instead of the overview", () => {
		// Zoomed in: the active tier has nothing baked yet, and the coarser tier
		// that DOES have pixels was invalidated by the same edit. Dropping it left
		// the whole cell on the whole-board overview — a huge upscale at high zoom.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const coarse = tier - 1;
		const key = `${coarse}:0:0`;
		layer.tiles.set(key, tile(coarse, 0, 0, vi.fn(), true).value);
		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });

		const ctx = fakeCtx();
		const overviewComposite = vi
			.spyOn(layer.overview, "composite")
			.mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		// Coarse tile used, with the edited region punched out...
		expect(ctx.drawImage).toHaveBeenCalledOnce();
		expect(ctx.clip).toHaveBeenCalledWith("evenodd");
		// ...and the overview drawn underneath so the hole is never bare.
		expect(overviewComposite).toHaveBeenCalledOnce();
	});

	it("never paints two sources over the same pixels", () => {
		// Tile content is semi-transparent wherever a low-opacity stroke is, so
		// any overlap composites it twice (0.45 -> 0.70) and shows up as darker
		// tile-shaped patches. The overview must fill EXACTLY the punched hole,
		// and a cell that uses its own stale tile must not also take a
		// cross-tier fallback.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		layer.tiles.set(`${tier}:0:0`, tile(tier, 0, 0, vi.fn(), true).value);
		layer.tiles.set(
			`${tier - 1}:0:0`,
			tile(tier - 1, 0, 0, vi.fn(), true).value,
		);
		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });

		const ctx = fakeCtx();
		const rects: number[][] = [];
		(ctx.rect as any).mockImplementation((...a: number[]) => rects.push(a));
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		// One source only — the own-tier tile, not it AND the coarser one.
		expect(ctx.drawImage).toHaveBeenCalledOnce();
		// The overview clip is built first, and it is the 10x10 hole — NOT the
		// 256px cell, which is what put it underneath the tile pixels.
		expect(rects[0]).toEqual([0, 0, 10, 10]);
		// The tile's own clip: whole cell, minus the same hole (even-odd).
		expect(rects[1]).toEqual([0, 0, 256, 256]);
		expect(rects[2]).toEqual([0, 0, 10, 10]);
	});

	it("refuses a stale fallback whose changed region is unknown", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const coarse = tier - 1;
		const key = `${coarse}:0:0`;
		layer.tiles.set(key, tile(coarse, 0, 0, vi.fn(), true).value);
		layer.markAllDirty(); // no rect → provenance unknown

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		expect(ctx.drawImage).not.toHaveBeenCalled();
	});

	it("unions successive edits into one dirty sub-rect", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = `${tier}:0:0`;
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });
		layer.markDirty({ x: 20, y: 30, w: 5, h: 5 });

		expect(layer.dirtyRects.get(key)).toEqual({ x: 0, y: 0, w: 25, h: 35 });

		// markAllDirty has no rect → whole tile, and that must win permanently.
		layer.markAllDirty();
		expect(layer.dirtyRects.get(key)).toBeNull();
		layer.markDirty({ x: 0, y: 0, w: 1, h: 1 });
		expect(layer.dirtyRects.get(key)).toBeNull();
	});

	it("caps default synchronous repair at six tiles", () => {
		const query = vi.fn(() => []);
		const layer = makeLayer(query);
		const rect: WorldRect = { x: 0, y: 0, w: 2_000, h: 1 };

		layer.rebuildRectSync(rect, 4);

		expect(query).toHaveBeenCalledTimes(6);
	});

	it("refuses a large synchronous hybrid overlay before allocating a canvas", () => {
		const layer = makeLayer() as any;
		const close = vi.fn();
		const base = { close } as unknown as ImageBitmap;
		const skipped = Array.from({ length: 9 }, (_, id) => ({
			id: String(id),
			getBoundingRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
		}));

		const result = layer.overlaySkipped(
			base,
			skipped,
			{ x: 0, y: 0, w: 1, h: 1 },
			1,
			{ x: 0, y: 0, w: 1, h: 1 },
		);

		expect(result).toBeNull();
		expect(close).toHaveBeenCalledOnce();
	});
});
