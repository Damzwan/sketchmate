import { describe, expect, it } from "vitest";
import {
	InfiniteQuadtreeManager,
	type QuadtreeEntry,
} from "@/draw/utils/QuadTree";

const entry = (id: string, x: number, y: number, w = 10, h = 10) =>
	({ id, bounds: { x, y, w, h } }) as QuadtreeEntry<unknown>;

const ids = (found: QuadtreeEntry<unknown>[]) => found.map((e) => e.id).sort();

describe("quadtree removal", () => {
	it("removes the right entry from a crowded node", () => {
		// One tight cluster: every entry lands in the same leaf, which is the case
		// the removal path is O(node) in and the dense-drawing case in practice.
		const tree = new InfiniteQuadtreeManager<unknown>();
		const all = Array.from({ length: 200 }, (_, i) =>
			entry(`o${i}`, 10 + (i % 5), 10 + (i % 3), 2, 2),
		);
		for (const e of all) tree.insert(e);

		tree.remove(all[0]);
		tree.remove(all[99]);
		tree.remove(all[199]);

		const found = ids(tree.query({ x: 0, y: 0, w: 100, h: 100 }));
		expect(found).toHaveLength(197);
		expect(found).not.toContain("o0");
		expect(found).not.toContain("o99");
		expect(found).not.toContain("o199");
		// Swap-pop reorders the node's list; nothing may be lost by the shuffle.
		expect(new Set(found).size).toBe(197);
	});

	it("survives removing every entry, in any order", () => {
		const tree = new InfiniteQuadtreeManager<unknown>();
		const all = Array.from({ length: 50 }, (_, i) =>
			entry(`o${i}`, (i % 7) * 30, Math.floor(i / 7) * 30),
		);
		for (const e of all) tree.insert(e);

		// Middle-out: the order swap-pop is most likely to get wrong.
		for (let i = all.length - 1; i >= 0; i -= 2) tree.remove(all[i]);
		for (let i = 0; i < all.length; i += 2) tree.remove(all[i]);

		expect(tree.query({ x: -1000, y: -1000, w: 5000, h: 5000 })).toHaveLength(
			0,
		);
	});

	it("keeps an entry queryable after a remove of a different one", () => {
		const tree = new InfiniteQuadtreeManager<unknown>();
		const a = entry("a", 5, 5);
		const b = entry("b", 6, 6);
		tree.insert(a);
		tree.insert(b);
		tree.remove(a);
		expect(ids(tree.query({ x: 0, y: 0, w: 50, h: 50 }))).toEqual(["b"]);
	});

	it("re-inserts a removed entry cleanly", () => {
		const tree = new InfiniteQuadtreeManager<unknown>();
		const a = entry("a", 5, 5);
		tree.insert(a);
		tree.remove(a);
		tree.insert(a);
		expect(ids(tree.query({ x: 0, y: 0, w: 50, h: 50 }))).toEqual(["a"]);
		// One entry, one hit: a stale node reference would return it twice.
		expect(tree.query({ x: 0, y: 0, w: 50, h: 50 })).toHaveLength(1);
	});

	it("removes an entry that straddles several chunks", () => {
		const tree = new InfiniteQuadtreeManager<unknown>(64);
		const wide = entry("wide", 0, 0, 500, 500);
		const small = entry("small", 10, 10, 5, 5);
		tree.insert(wide);
		tree.insert(small);
		tree.remove(wide);
		expect(ids(tree.query({ x: 0, y: 0, w: 600, h: 600 }))).toEqual(["small"]);
	});
});
