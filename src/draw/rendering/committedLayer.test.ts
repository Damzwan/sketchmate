import { describe, expect, it, vi } from "vitest";
import {
	type Bounded,
	CommittedLayer,
	type SpatialIndex,
	type WorldRect,
	type Yieldable,
} from "./committedLayer";
import { tileKey } from "./tiles/tileKey";
import { NO_HOLE } from "./tiles/tileLayerBase";

interface TestObject extends Bounded {}

function makeLayer(
	query: SpatialIndex<TestObject>["query"] = () => [],
	renderer: (
		ctx: any,
		obj: TestObject,
		scale: number,
		rect?: WorldRect,
	) => void = () => {},
	renderChunk?: number,
) {
	const index: SpatialIndex<TestObject> = { query };
	return new CommittedLayer<TestObject>(index, renderer, {
		tileSize: 256,
		overviewPx: 64,
		memoryBudgetMB: 32,
		renderChunk,
	});
}

/** Minimal OffscreenCanvas so the pooled bake canvases work under vitest. */
function stubOffscreenCanvas(): void {
	if ((globalThis as any).OffscreenCanvas) return;
	(globalThis as any).OffscreenCanvas = class {
		width: number;
		height: number;
		constructor(w: number, h: number) {
			this.width = w;
			this.height = h;
		}
		getContext() {
			return fakeCtx();
		}
		transferToImageBitmap() {
			return { close: vi.fn() } as unknown as ImageBitmap;
		}
	};
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
			transition: false,
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
		translate: vi.fn(),
		scale: vi.fn(),
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "low",
	} as unknown as CanvasRenderingContext2D & {
		drawImage: ReturnType<typeof vi.fn>;
		clip: ReturnType<typeof vi.fn>;
	};
}

describe("CommittedLayer safety bounds", () => {
	it("stays on tile-backed tiers until the overview bitmap exists", () => {
		// The zoom floor is content-derived, not a constant: with no bitmap yet
		// there is nothing that can serve the overview-only range, so the viewport
		// is held on tiles whatever the content asks for.
		const layer = makeLayer() as any;

		expect(layer.overviewDensity).toBe(0);
		expect(layer.minViewportZoomFor(0.01)).toBe(layer.minTiledZoom);
		expect(layer.pickActiveTier(layer.minViewportZoom)).toBeGreaterThan(
			layer.overviewTier,
		);
	});

	it("opens the overview-only range for content that needs it", () => {
		// The massive-lobby case: the board only fits well below the tiled floor,
		// and the bitmap has the pixels for that zoom.
		const layer = makeLayer() as any;
		const fit = 0.05;
		vi.spyOn(layer.overview, "pixelDensity").mockReturnValue(
			fit * layer.renderScale,
		);

		const floor = layer.minViewportZoomFor(fit);
		expect(floor).toBeCloseTo(fit);
		expect(layer.pickActiveTier(floor)).toBeLessThanOrEqual(layer.overviewTier);
	});

	it("keeps that reach even with a sparse overview", () => {
		// Zooming out lowers the pixels the screen asks for, so a coarse bitmap is
		// at its sharpest at the far end. Density gates whether the band can be
		// painted at all, never how far it reaches.
		const layer = makeLayer() as any;
		vi.spyOn(layer.overview, "pixelDensity").mockReturnValue(0.002);

		expect(layer.minViewportZoomFor(0.05)).toBeCloseTo(0.05);
	});

	it("stops at the tiled tier for a drawing that already fits", () => {
		const layer = makeLayer() as any;
		vi.spyOn(layer.overview, "pixelDensity").mockReturnValue(0.5);

		expect(layer.minViewportZoomFor(1)).toBe(layer.minTiledZoom);
		expect(layer.minViewportZoom).toBe(layer.minTiledZoom);
	});

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
		layer.tiles.set(tileKey(3, 0, 0), stale.value);
		layer.tiles.set("4:0:0", kept.value);

		layer.dropOtherTiers({ x: 0, y: 0, w: 1, h: 1 }, 4);

		expect(stale.close).not.toHaveBeenCalled();
		expect(kept.close).not.toHaveBeenCalled();
		expect(layer.gen.get(tileKey(3, 0, 0))).toBe(1);
		expect(layer.gen.get("4:0:0")).toBeUndefined();
	});

	it("never composites a stale active-tier bitmap", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const stale = tile(tier, 0, 0);
		layer.tiles.set(tileKey(tier, 0, 0), stale.value);
		layer.gen.set(tileKey(tier, 0, 0), 1);

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
		layer.tiles.set(tileKey(tier, 0, 0), stamped.value);
		layer.gen.set(tileKey(tier, 0, 0), 1);

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
		const key = tileKey(tier, 0, 0);
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
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);

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
		const key = tileKey(tier, 0, 0);
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markStale({ x: 0, y: 0, w: 10, h: 10 });

		// Trust is preserved...
		expect(layer.tiles.get(key).usable).toBe(true);
		// ...but the region IS recorded: the sub-rect repair path has to know the
		// added object's footprint needs repainting, or the object never lands in
		// the tile and vanishes when its live overlay demotes.
		expect(layer.dirtyRects.get(key)).toEqual([{ x: 0, y: 0, w: 10, h: 10 }]);

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

	it("keeps only visible active-tier tiles sharp during a discrete transition", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const activeKey = tileKey(tier, 0, 0);
		const coarseKey = tileKey(tier - 1, 0, 0);
		layer.tiles.set(activeKey, tile(tier, 0, 0, vi.fn(), true).value);
		layer.tiles.set(coarseKey, tile(tier - 1, 0, 0, vi.fn(), true).value);

		layer.markDirtyWithSharpTransition({ x: 0, y: 0, w: 40, h: 40 }, tier, {
			x: 0,
			y: 0,
			w: 100,
			h: 100,
		});

		expect(layer.tiles.get(activeKey)).toMatchObject({
			usable: true,
			transition: true,
		});
		// A different tier must never advertise previous-state pixels as exact;
		// zooming after a move would otherwise resurrect the old position.
		expect(layer.tiles.get(coarseKey)).toMatchObject({
			usable: false,
			transition: false,
		});

		const ctx = fakeCtx();
		const overviewComposite = vi
			.spyOn(layer.overview, "composite")
			.mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");
		expect(ctx.drawImage).toHaveBeenCalledOnce();
		expect(overviewComposite).not.toHaveBeenCalled();
	});

	it("revokes a sharp transition before the viewport changes", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = tileKey(tier, 0, 0);
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);
		layer.markDirtyWithSharpTransition({ x: 0, y: 0, w: 40, h: 40 }, tier, {
			x: 0,
			y: 0,
			w: 100,
			h: 100,
		});

		layer.dropSharpTransitions();

		expect(layer.tiles.get(key)).toMatchObject({
			usable: false,
			transition: false,
		});
	});

	it("falls back to a stale coarser tile instead of the overview", () => {
		// Zoomed in: the active tier has nothing baked yet, and the coarser tier
		// that DOES have pixels was invalidated by the same edit. Dropping it left
		// the whole cell on the whole-board overview — a huge upscale at high zoom.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const coarse = tier - 1;
		const key = tileKey(coarse, 0, 0);
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
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);
		layer.tiles.set(
			tileKey(tier - 1, 0, 0),
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
		const key = tileKey(coarse, 0, 0);
		layer.tiles.set(key, tile(coarse, 0, 0, vi.fn(), true).value);
		layer.markAllDirty(); // no rect → provenance unknown

		const ctx = fakeCtx();
		vi.spyOn(layer.overview, "composite").mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		expect(ctx.drawImage).not.toHaveBeenCalled();
	});

	it("keeps disjoint edits separate and merges touching ones", () => {
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = tileKey(tier, 0, 0);
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);

		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });
		layer.markDirty({ x: 20, y: 30, w: 5, h: 5 });

		// Two far-apart edits must NOT become one rect spanning both: unioning
		// them makes the tile look unusable everywhere in between, which is what
		// collapsed the fallback ladder to the blurry overview as a session went on.
		expect(layer.dirtyRects.get(key)).toHaveLength(2);

		// Overlapping edits do merge, so the list stays short.
		layer.markDirty({ x: 5, y: 5, w: 10, h: 10 });
		expect(layer.dirtyRects.get(key)).toHaveLength(2);

		// markAllDirty has no rect → whole tile, and that must win permanently.
		layer.markAllDirty();
		expect(layer.dirtyRects.get(key)).toBeNull();
		layer.markDirty({ x: 0, y: 0, w: 1, h: 1 });
		expect(layer.dirtyRects.get(key)).toBeNull();
	});

	it("fills an edit hole from a coarser tile before the overview", () => {
		// The active tile is stale in one small region; a coarser tile of the same
		// area is fresh. That patch must come from the coarser TILE, not from the
		// whole-board overview — the overview is what makes an edit look like the
		// picture dissolves for a moment.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);
		layer.tiles.set(
			tileKey(tier - 1, 0, 0),
			tile(tier - 1, 0, 0, vi.fn(), true).value,
		);
		// Only the active tier is invalidated, so the coarser tile stays fresh.
		layer.markTierDirty({ x: 0, y: 0, w: 10, h: 10 }, tier);

		const ctx = fakeCtx();
		const overviewComposite = vi
			.spyOn(layer.overview, "composite")
			.mockImplementation(() => {});
		layer.composite(ctx, [1, 0, 0, 1, 0, 0], { w: 100, h: 100 }, 1, "#ffffff");

		// Stale tile outside the hole + coarser tile inside it.
		expect(ctx.drawImage).toHaveBeenCalledTimes(2);
		// Nothing left for the overview to cover.
		expect(overviewComposite).not.toHaveBeenCalled();
	});

	it("trusts a fallback tile that was dirtied somewhere else", () => {
		// The whole point of tracking regions separately: a coarse tile edited far
		// from this cell is still exact here, so it must be usable as a fallback
		// instead of dropping the cell to the whole-board overview.
		const layer = makeLayer() as any;
		const tier = layer.pickActiveTier(1);
		const key = tileKey(tier, 0, 0);
		const t = tile(tier, 0, 0, vi.fn(), true).value;
		layer.tiles.set(key, t);
		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 });

		// Region far from the recorded edit → fully trusted.
		expect(layer.fallbackHole(key, t, { x: 900, y: 900, w: 50, h: 50 })).toBe(
			NO_HOLE,
		);
		// Region over it → a hole, but only that one.
		expect(layer.fallbackHole(key, t, { x: 0, y: 0, w: 50, h: 50 })).toEqual({
			x: 0,
			y: 0,
			w: 10,
			h: 10,
		});
	});

	it("caps default synchronous repair at six tiles", () => {
		const query = vi.fn(() => []);
		const layer = makeLayer(query);
		const rect: WorldRect = { x: 0, y: 0, w: 2_000, h: 1 };

		layer.rebuildRectSync(rect, 4);

		expect(query).toHaveBeenCalledTimes(6);
	});

	it("repairs only the changed sub-rect of a tile", () => {
		// A 20-unit erase trail inside a 256-unit tile must query (and therefore
		// re-render) only the objects in that trail — not every object in the tile.
		stubOffscreenCanvas();
		const queried: WorldRect[] = [];
		const query = vi.fn((rect: WorldRect) => {
			queried.push(rect);
			return [] as TestObject[];
		});
		const layer = makeLayer(query) as any;
		const tier = 4;
		const key = tileKey(tier, 0, 0);
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);
		const changed: WorldRect = { x: 10, y: 10, w: 20, h: 20 };

		const repaired = layer.repairTileRegionSync(tier, 0, 0, changed);

		expect(repaired).toBe(true);
		expect(queried).toHaveLength(1);
		expect(queried[0].w).toBeLessThan(60); // the trail, not the tile
		expect(queried[0].h).toBeLessThan(60);
	});

	it("repairs everything owed on the tile, not just the caller's rect", () => {
		// Erase A invalidates region A and its bake is still pending when undo B
		// repairs region B of the same tile. Repairing only B and marking the tile
		// fresh drops A forever — a permanent hole.
		stubOffscreenCanvas();
		const queried: WorldRect[] = [];
		const query = vi.fn((rect: WorldRect) => {
			queried.push(rect);
			return [] as TestObject[];
		});
		const layer = makeLayer(query) as any;
		const tier = 4;
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);

		layer.markDirty({ x: 0, y: 0, w: 10, h: 10 }); // edit A, still owed
		const repaired = layer.repairTileRegionSync(tier, 0, 0, {
			x: 20,
			y: 20,
			w: 10,
			h: 10,
		}); // edit B

		expect(repaired).toBe(true);
		// The repainted region spans both edits.
		expect(queried[0].x).toBeLessThanOrEqual(0);
		expect(queried[0].x + queried[0].w).toBeGreaterThanOrEqual(30);
	});

	it("declines a sub-rect repair when the whole tile is dirty", () => {
		stubOffscreenCanvas();
		const query = vi.fn(() => [] as TestObject[]);
		const layer = makeLayer(query) as any;
		const tier = 4;
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);

		layer.markAllDirty(); // records null = whole tile, provenance unknown

		expect(
			layer.repairTileRegionSync(tier, 0, 0, { x: 0, y: 0, w: 10, h: 10 }),
		).toBe(false);
		expect(query).not.toHaveBeenCalled();
	});

	it("declines a sub-rect repair that covers most of the tile", () => {
		const query = vi.fn(() => []);
		const layer = makeLayer(query) as any;
		const tier = 4;
		layer.tiles.set(tileKey(tier, 0, 0), tile(tier, 0, 0, vi.fn(), true).value);

		// Whole-tile change → the plain full rebuild is cheaper than copying the
		// old bitmap first.
		const repaired = layer.repairTileRegionSync(tier, 0, 0, {
			x: -10,
			y: -10,
			w: 400,
			h: 400,
		});

		expect(repaired).toBe(false);
		expect(query).not.toHaveBeenCalled();
	});

	it("yields and aborts a dense background sub-rect repair between objects", async () => {
		stubOffscreenCanvas();
		const objects = Array.from({ length: 10 }, (_, id) => ({
			id: String(id),
			getBoundingRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
		}));
		const render = vi.fn();
		// A two-object chunk makes the expected cancellation boundary explicit.
		const layer = makeLayer(() => objects, render, 2) as any;
		const tier = 4;
		const key = tileKey(tier, 0, 0);
		layer.tiles.set(key, tile(tier, 0, 0, vi.fn(), true).value);
		layer.markDirty({ x: 10, y: 10, w: 20, h: 20 });

		const ctrl = new AbortController();
		const yielder = {
			reset: vi.fn(),
			shouldYield: vi.fn(() => false),
			yield: vi.fn(async () => ctrl.abort()),
		};
		const repaired = await layer.repairTileRegionYielded(
			tier,
			0,
			0,
			{ x: 10, y: 10, w: 20, h: 20 },
			yielder,
			ctrl.signal,
		);

		expect(repaired).toBe(false);
		expect(yielder.yield).toHaveBeenCalledOnce();
		expect(render).toHaveBeenCalledTimes(2);
		// The partially repaired private bitmap was discarded; the original tile
		// remains stale and a later settled bake will retry it.
		expect(layer.tiles.get(key).builtGen).toBe(0);
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

describe("bake prefetch ring is dropped when the cache cannot afford it", () => {
	stubOffscreenCanvas();

	function makeProbe(memoryBudgetMB: number) {
		const seen = new Set<string>();
		const index: SpatialIndex<TestObject> = {
			query: (r) => {
				seen.add(`${Math.round(r.x)},${Math.round(r.y)}`);
				return [];
			},
		};
		const layer = new CommittedLayer<TestObject>(index, () => {}, {
			tileSize: 256,
			overviewPx: 64,
			memoryBudgetMB,
			poolMax: 2,
		});
		return { layer, seen };
	}

	const yielder: Yieldable = {
		reset: () => {},
		shouldYield: () => false,
		yield: async () => {},
	};

	const bake = (layer: CommittedLayer<TestObject>, edge: number) =>
		layer.bake(
			[1, 0, 0, 1, 0, 0],
			{ w: edge, h: edge },
			1,
			() => yielder,
			new AbortController().signal,
			null,
		);

	it("pads a viewport the budget can hold twice over", async () => {
		const { layer, seen } = makeProbe(512);
		await bake(layer, 512);
		// 3x3 visible cells plus a one-cell ring on every side = 5x5.
		expect(seen.size).toBe(25);
		expect(seen.size * 2).toBeLessThanOrEqual(layer.tileCapacity());
	});

	it("drops the ring when two passes would not fit, so a pass cannot evict itself", async () => {
		// Padding this viewport would need 7x7 = 49 tiles, and two adjacent tiers
		// must coexist because zooming keeps the previous one resident. Beyond the
		// budget, a padded pass evicts its own earlier tiles, every composite still
		// reports holes, and the engine re-bakes forever — the sharp/blurred
		// oscillation. Give up the prefetch ring instead.
		const { layer, seen } = makeProbe(16);
		await bake(layer, 1024);
		expect(seen.size).toBe(25); // exactly the visible 5x5, no ring
		expect(seen.size * 2).toBeLessThanOrEqual(layer.tileCapacity());
	});
});
