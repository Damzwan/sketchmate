import { describe, expect, it, vi } from "vitest";
import { tileKey } from "./tileKey";
import { TileStore } from "./tileStore";

function bitmap() {
	return { close: vi.fn() } as unknown as ImageBitmap;
}

describe("TileStore bookkeeping lifecycle", () => {
	it("drops generation keys with ordinary LRU eviction", () => {
		const store = new TileStore(16, 16 * 16 * 4, 0);
		const key = tileKey(3, 0, 0);
		store.generations.set(key, 7);
		store.store(key, 3, 0, 0, bitmap(), 16 * 16 * 4, 7, true);

		// Reserving a second full tile evicts the first to the low-water mark.
		expect(store.reserve(16 * 16 * 4)).toBe(true);
		expect(store.tiles.has(key)).toBe(false);
		expect(store.generations.has(key)).toBe(false);
	});

	it("keeps an in-flight generation until the request finishes", () => {
		const store = new TileStore(16, 16 * 16 * 4, 0);
		const key = tileKey(3, 0, 0);
		store.generations.set(key, 7);
		store.store(key, 3, 0, 0, bitmap(), 16 * 16 * 4, 6, false);
		store.inFlight.add(key);

		expect(store.reserve(16 * 16 * 4)).toBe(true);
		expect(store.generations.get(key)).toBe(7);

		store.finishFlight(key);
		expect(store.generations.has(key)).toBe(false);
		expect(store.dirtyRects.has(key)).toBe(false);
	});
});

describe("eviction keeps tier protection when every tile is canvas-backed", () => {
	/** A canvas-backed surface: `isCanvasSurface` tests for `getContext`. */
	function canvasSurface() {
		return { width: 16, height: 16, getContext: () => ({}) } as any;
	}

	const BYTES = 16 * 16 * 4;

	function storeWith(surface: () => any) {
		// Room for 4 tiles. Reserving a 5th forces eviction.
		const store = new TileStore(16, BYTES * 4, 0);
		// Two tiles at the tier being looked at, two far away.
		store.setActiveTier(5);
		for (const [tier, tx] of [
			[5, 0],
			[5, 1],
			[0, 0],
			[0, 1],
		] as const) {
			const key = tileKey(tier, tx, 0);
			store.generations.set(key, 1);
			store.store(key, tier, tx, 0, surface(), BYTES, 1, true);
		}
		return store;
	}

	it("evicts FAR tiles, not the active tier, for canvas-backed tiles", () => {
		// Regression: every eviction class was gated on `!isCanvasSurface`, so a
		// cache that is entirely canvas-backed (Gecko) fell through to a blanket
		// LRU sweep with no tier ordering — the pinch-in/pinch-out rebake storm,
		// which the user sees as the picture oscillating sharp↔blurred.
		const store = storeWith(canvasSurface);
		store.reserve(BYTES);

		expect(store.tiles.has(tileKey(5, 0, 0))).toBe(true);
		expect(store.tiles.has(tileKey(5, 1, 0))).toBe(true);
		expect(store.tiles.has(tileKey(0, 0, 0))).toBe(false);
	});

	it("evicts FAR tiles first for bitmap-backed tiles too", () => {
		const store = storeWith(bitmap);
		store.reserve(BYTES);

		expect(store.tiles.has(tileKey(5, 0, 0))).toBe(true);
		expect(store.tiles.has(tileKey(5, 1, 0))).toBe(true);
		expect(store.tiles.has(tileKey(0, 0, 0))).toBe(false);
	});

	it("still frees the active tier as a last resort rather than failing", () => {
		const store = storeWith(canvasSurface);
		// Ask for more than the far tiles can supply.
		expect(store.reserve(BYTES * 3)).toBe(true);
	});
});

describe("idle headroom trimming", () => {
	const BYTES = 16 * 16 * 4;

	function fill(tiers: number[]) {
		// Budget for 8 tiles, so 8 resident = 100% — the steady state that makes
		// every subsequent bake evict on the critical path.
		const store = new TileStore(16, BYTES * 8, 0);
		store.setActiveTier(5);
		tiers.forEach((tier, i) => {
			const key = tileKey(tier, i, 0);
			store.generations.set(key, 1);
			store.store(key, tier, i, 0, bitmap(), BYTES, 1, true);
		});
		return store;
	}

	it("releases far tiles until the cache has headroom", () => {
		const store = fill([5, 5, 5, 5, 0, 0, 1, 1]);
		expect(store.memoryBytes).toBe(BYTES * 8);

		const released = store.trimToHeadroom(0.8);

		expect(released).toBeGreaterThan(0);
		expect(store.memoryBytes).toBeLessThanOrEqual(BYTES * 8 * 0.8);
	});

	it("never gives up the tier being drawn, or its neighbours", () => {
		const store = fill([5, 5, 5, 5, 4, 6, 0, 0]);
		store.trimToHeadroom(0.5);

		// tier 5 is active; 4 and 6 are one step away and are what a small zoom
		// lands on next. Only the distant tier-0 tiles may go.
		for (let i = 0; i < 4; i++) {
			expect(store.tiles.has(tileKey(5, i, 0))).toBe(true);
		}
		expect(store.tiles.has(tileKey(4, 4, 0))).toBe(true);
		expect(store.tiles.has(tileKey(6, 5, 0))).toBe(true);
		expect(store.tiles.has(tileKey(0, 6, 0))).toBe(false);
	});

	it("does nothing when already under the target", () => {
		const store = fill([5, 0]);
		expect(store.trimToHeadroom(0.8)).toBe(0);
		expect(store.tiles.size).toBe(2);
	});

	it("does nothing before the first composite reports a tier", () => {
		const store = new TileStore(16, BYTES * 2, 0);
		const key = tileKey(3, 0, 0);
		store.generations.set(key, 1);
		store.store(key, 3, 0, 0, bitmap(), BYTES * 2, 1, true);
		// activeTier is -1 here, so "far" is meaningless and nothing is safe to drop.
		expect(store.trimToHeadroom(0.1)).toBe(0);
	});
});
