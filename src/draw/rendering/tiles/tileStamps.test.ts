import { describe, expect, it, vi } from "vitest";
import {
	type Bounded,
	CommittedLayer,
	type SpatialIndex,
	type WorldRect,
} from "../committedLayer";
import { tileKey } from "./tileKey";
import { isCanvasSurface } from "./tileStore";

interface TestObject extends Bounded {}

/**
 * Counts texture lifecycle events, which is the whole point of M2: a stamp on a
 * hot tile must allocate no ImageBitmap and destroy none.
 */
let bitmapsCreated = 0;
let bitmapsClosed = 0;

function stubOffscreenCanvas(): void {
	bitmapsCreated = 0;
	bitmapsClosed = 0;
	(globalThis as any).OffscreenCanvas = class {
		constructor(
			public width: number,
			public height: number,
		) {}
		getContext() {
			return new Proxy({} as any, { get: () => () => {} });
		}
		transferToImageBitmap() {
			bitmapsCreated++;
			return {
				close: () => {
					bitmapsClosed++;
				},
			} as unknown as ImageBitmap;
		}
	};
}

function bitmap(): ImageBitmap {
	bitmapsCreated++;
	return {
		close: () => {
			bitmapsClosed++;
		},
	} as unknown as ImageBitmap;
}

function makeLayer(hotTileMax: number, objects: TestObject[] = []) {
	stubOffscreenCanvas();
	const renderer = vi.fn();
	const index: SpatialIndex<TestObject> = { query: () => objects };
	const layer = new CommittedLayer<TestObject>(index, renderer, {
		tileSize: 256,
		overviewPx: 64,
		memoryBudgetMB: 32,
		poolMax: 4,
		hotTileMax,
	}) as any;
	return { layer, renderer };
}

/** A fresh, bitmap-backed tile at (tier, 0, 0). */
function seedTile(layer: any, tier: number): number {
	const key = tileKey(tier, 0, 0);
	layer.tiles.set(key, {
		bitmap: bitmap(),
		tier,
		tx: 0,
		ty: 0,
		bytes: 4,
		builtGen: 0,
		lastUsed: 0,
		usable: true,
		transition: false,
	});
	return key;
}

const obj = { id: "a" } as TestObject;
const rect: WorldRect = { x: 0, y: 0, w: 4, h: 4 };

describe("hot tile surfaces (M2)", () => {
	it("promotes a stamped tile to a canvas and stops allocating textures", () => {
		const { layer } = makeLayer(2);
		const key = seedTile(layer, 4);
		const createdAfterSeed = bitmapsCreated;

		layer.additiveStamp(rect, obj, 4);
		expect(isCanvasSurface(layer.tiles.get(key).bitmap)).toBe(true);
		// Promotion closes the old texture and allocates none.
		expect(bitmapsCreated).toBe(createdAfterSeed);
		expect(bitmapsClosed).toBe(1);

		// Every subsequent stamp is pure drawImage: no texture created, none closed.
		const closedAfterPromote = bitmapsClosed;
		for (let i = 0; i < 5; i++) layer.additiveStamp(rect, obj, 4);
		expect(bitmapsCreated).toBe(createdAfterSeed);
		expect(bitmapsClosed).toBe(closedAfterPromote);
	});

	it("keeps the tile fresh and usable after an in-place stamp", () => {
		// The bitmap path stored FRESH under a bumped gen; the in-place path must
		// agree exactly, or the compositor stops trusting pixels that are correct.
		const { layer } = makeLayer(2);
		const key = seedTile(layer, 4);

		layer.additiveStamp(rect, obj, 4);

		const tile = layer.tiles.get(key);
		expect(tile.builtGen).toBe(layer.gen.get(key));
		expect(tile.usable).toBe(true);
		expect(layer.dirtyRects.has(key)).toBe(false);
	});

	it("stops promoting once the hot set is full", () => {
		const { layer } = makeLayer(1);
		const a = seedTile(layer, 4);
		layer.tiles.set(tileKey(4, 1, 0), {
			...layer.tiles.get(a),
			bitmap: bitmap(),
			tx: 1,
		});

		layer.additiveStamp(rect, obj, 4);
		layer.additiveStamp({ x: 256, y: 0, w: 4, h: 4 }, obj, 4);

		let hot = 0;
		for (const tile of layer.tiles.values()) {
			if (isCanvasSurface(tile.bitmap)) hot++;
		}
		expect(hot).toBe(1);
	});

	it("demotes cold hot tiles back to bitmaps", () => {
		const { layer } = makeLayer(2);
		const key = seedTile(layer, 4);
		layer.additiveStamp(rect, obj, 4);
		expect(isCanvasSurface(layer.tiles.get(key).bitmap)).toBe(true);

		layer.demoteHotTiles(0);

		expect(isCanvasSurface(layer.tiles.get(key).bitmap)).toBe(false);
		expect(layer.tiles.get(key).bitmap).toBeTruthy();
	});

	it("hotTileMax 0 restores the pure bitmap path", () => {
		const { layer } = makeLayer(0);
		const key = seedTile(layer, 4);
		layer.additiveStamp(rect, obj, 4);
		expect(isCanvasSurface(layer.tiles.get(key).bitmap)).toBe(false);
	});
});

describe("tier-aware eviction (M3)", () => {
	function tileAt(tier: number, tx: number, bytes: number) {
		return {
			bitmap: bitmap(),
			tier,
			tx,
			ty: 0,
			bytes,
			builtGen: 0,
			lastUsed: 0,
			usable: true,
			transition: false,
		};
	}

	it("evicts distant tiers before the active one", () => {
		const { layer } = makeLayer(0);
		const store = layer.tileStore;
		const bytes = 1_000;
		// Insert the ACTIVE tier tile FIRST, so plain insertion-order LRU would
		// pick it. Only the tier distance should save it.
		store.tiles.set(tileKey(4, 0, 0), tileAt(4, 0, bytes));
		store.tiles.set(tileKey(0, 0, 0), tileAt(0, 0, bytes));
		store.memoryBytes = bytes * 2;
		// Sized so reserving a third tile frees EXACTLY one. `reserve` evicts down
		// to 85% of the limit minus the request: any tighter and it frees both
		// (proving nothing), any looser and it frees neither.
		(store as any).memoryLimit = bytes * 2.6;
		store.setActiveTier(4);

		store.reserve(bytes);

		expect(store.tiles.has(tileKey(4, 0, 0))).toBe(true);
		expect(store.tiles.has(tileKey(0, 0, 0))).toBe(false);
	});

	it("ranks a fallback-sampled tile below one composited as itself", () => {
		const { layer } = makeLayer(0);
		const store = layer.tileStore;
		const sampled = tileAt(2, 0, 10);
		const drawn = tileAt(2, 1, 10);
		store.tiles.set(tileKey(2, 0, 0), sampled);
		store.tiles.set(tileKey(2, 1, 0), drawn);

		store.touch(tileKey(2, 0, 0), sampled, true); // weak: fallback source only
		store.touch(tileKey(2, 1, 0), drawn, false); // composited as itself

		expect(sampled.lastUsed).toBeLessThan(drawn.lastUsed);
	});
});
