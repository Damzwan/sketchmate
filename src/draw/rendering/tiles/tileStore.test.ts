import { describe, expect, it, vi } from "vitest";
import { TileStore } from "./tileStore";

function bitmap() {
	return { close: vi.fn() } as unknown as ImageBitmap;
}

describe("TileStore bookkeeping lifecycle", () => {
	it("drops generation keys with ordinary LRU eviction", () => {
		const store = new TileStore(16, 16 * 16 * 4, 0);
		store.generations.set("3:0:0", 7);
		store.store("3:0:0", 3, 0, 0, bitmap(), 16 * 16 * 4, 7, true);

		// Reserving a second full tile evicts the first to the low-water mark.
		expect(store.reserve(16 * 16 * 4)).toBe(true);
		expect(store.tiles.has("3:0:0")).toBe(false);
		expect(store.generations.has("3:0:0")).toBe(false);
	});

	it("keeps an in-flight generation until the request finishes", () => {
		const store = new TileStore(16, 16 * 16 * 4, 0);
		const key = "3:0:0";
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
