import { describe, expect, it, vi } from "vitest";
import {
	estimateObjectRenderCost,
	estimateRenderCost,
	isSyncRenderAffordable,
} from "./renderCost";
import {
	CommittedLayer,
	type Bounded,
	type SpatialIndex,
	type WorldRect,
} from "./committedLayer";

interface TestObject extends Bounded {}

function pencil(segments: number): any {
	return { id: "p", path: new Array(segments).fill(["L", 0, 0]) };
}

function erased(segments: number, clipChildren: number): any {
	return {
		id: "e",
		path: new Array(segments).fill(["L", 0, 0]),
		clipPath: { _objects: new Array(clipChildren).fill({}) },
	};
}

describe("estimateObjectRenderCost", () => {
	it("prices an invisible object at zero — fabric skips it before any path work", () => {
		expect(estimateObjectRenderCost({ ...pencil(500), visible: false })).toBe(
			0,
		);
		expect(estimateObjectRenderCost({ ...pencil(500), opacity: 0 })).toBe(0);
	});

	it("prices a plain path by its segment count", () => {
		expect(estimateObjectRenderCost(pencil(80))).toBe(80);
	});

	it("prefers compact geometry's own segment count over materializing `path`", () => {
		const complexity = vi.fn(() => 120);
		const object = {
			id: "t",
			_hasCompactPathGeometry: () => true,
			complexity,
			// Reading this would materialize the array-of-arrays the packed
			// representation exists to avoid.
			get path(): never {
				throw new Error("materialized packed geometry");
			},
		};
		expect(estimateObjectRenderCost(object)).toBe(120);
		expect(complexity).toHaveBeenCalledTimes(1);
	});

	it("makes an erased object far more expensive than the same path unerased", () => {
		// The whole point of the estimator: object COUNT cannot tell these apart,
		// and the clipped one is the case that produced the 268ms block.
		const plain = estimateObjectRenderCost(pencil(80));
		const clipped = estimateObjectRenderCost(erased(80, 40));
		expect(clipped).toBeGreaterThan(plain * 10);
	});

	it("prices an image-backed clip beyond any mobile sync budget", () => {
		// A compacted erase mask decodes and composites a full-size bitmap per
		// render and cannot be culled.
		expect(estimateObjectRenderCost({ id: "i", __hasImageClip: true })).toBe(
			20_000,
		);
	});
});

describe("estimateRenderCost", () => {
	it("stops early once the limit is passed", () => {
		const complexity = vi.fn(() => 1_000);
		const objects = new Array(50).fill(null).map(() => ({
			_hasCompactPathGeometry: () => true,
			complexity,
		}));
		const total = estimateRenderCost(objects, 2_500);
		expect(total).toBeGreaterThan(2_500);
		// 3 objects is enough to exceed 2500; it must not price all 50.
		expect(complexity.mock.calls.length).toBeLessThan(10);
	});

	it("reports affordability against the budget", () => {
		expect(isSyncRenderAffordable([pencil(10), pencil(10)], 100)).toBe(true);
		expect(isSyncRenderAffordable([erased(80, 40)], 100)).toBe(false);
	});
});

describe("synchronous repair cost gate", () => {
	/** Minimal OffscreenCanvas so the pooled bake canvases work under vitest. */
	function stubOffscreenCanvas(): void {
		if ((globalThis as any).OffscreenCanvas) return;
		(globalThis as any).OffscreenCanvas = class {
			constructor(
				public width: number,
				public height: number,
			) {}
			getContext() {
				return new Proxy({} as any, {
					get: () => () => {},
				});
			}
			transferToImageBitmap() {
				return { close: vi.fn() } as unknown as ImageBitmap;
			}
		};
	}

	function makeLayer(
		objects: any[],
		syncCostBudget?: number,
	): { layer: any; renderer: ReturnType<typeof vi.fn> } {
		stubOffscreenCanvas();
		const renderer = vi.fn();
		const index: SpatialIndex<TestObject> = { query: () => objects };
		const layer = new CommittedLayer<TestObject>(index, renderer, {
			tileSize: 256,
			overviewPx: 64,
			memoryBudgetMB: 32,
			syncCostBudget,
		});
		return { layer: layer as any, renderer };
	}

	it("declines a full sync tile rebuild whose objects exceed the budget", () => {
		const { layer, renderer } = makeLayer([erased(80, 40)], 1_000);
		expect(layer.rebuildTileSync(4, 0, 0)).toBe("declined");
		expect(renderer).not.toHaveBeenCalled();
	});

	it("still rebuilds when the same tile is under budget", () => {
		const { layer, renderer } = makeLayer([pencil(10)], 1_000);
		expect(layer.rebuildTileSync(4, 0, 0)).toBe("rebuilt");
		expect(renderer).toHaveBeenCalledTimes(1);
	});

	it("charges no repair budget for a declined tile", () => {
		// A decline renders nothing, so charging for it would starve the
		// neighbouring tiles — which may well be cheap — and would report a region
		// as repaired while it is still stale.
		const { layer } = makeLayer([erased(80, 40)], 1_000);
		const rect: WorldRect = { x: 0, y: 0, w: 2_000, h: 1 };
		expect(layer.rebuildRectSync(rect, 4)).toBe(0);
	});

	it("leaves the path unbounded when no budget is configured", () => {
		// Tests and benchmarks that want the old behaviour simply omit the option.
		const { layer, renderer } = makeLayer([erased(400, 200)]);
		expect(layer.rebuildTileSync(4, 0, 0)).toBe("rebuilt");
		expect(renderer).toHaveBeenCalledTimes(1);
	});
});
