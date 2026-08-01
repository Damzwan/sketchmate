import { describe, expect, it } from "vitest";
import { InfiniteQuadtreeManager, type QuadtreeEntry } from "./QuadTree";

function entry(
	id: string,
	x: number,
	y: number,
	w = 20,
	h = 20,
): QuadtreeEntry<string> {
	return { id, bounds: { x, y, w, h } };
}

describe("InfiniteQuadtreeManager.translate", () => {
	it("keeps translated entries queryable inside their current node", () => {
		const tree = new InfiniteQuadtreeManager<string>();
		const item = entry("a", 100, 100);
		tree.insert(item);

		tree.translate(item, 50, 25);

		expect(tree.query({ x: 145, y: 120, w: 30, h: 30 })).toContain(item);
		expect(tree.query({ x: 95, y: 95, w: 20, h: 20 })).not.toContain(item);
	});

	it("reindexes entries that cross a chunk boundary", () => {
		const tree = new InfiniteQuadtreeManager<string>();
		const item = entry("a", 4070, 100);
		tree.insert(item);

		tree.translate(item, 100, 0);

		expect(tree.query({ x: 4160, y: 90, w: 40, h: 40 })).toContain(item);
		expect(tree.query({ x: 4060, y: 90, w: 40, h: 40 })).not.toContain(item);
	});
});
