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

function tile(tier: number, tx: number, ty: number, close = vi.fn()) {
	return {
		value: {
			bitmap: { close } as unknown as ImageBitmap,
			tier,
			tx,
			ty,
			bytes: 256 * 256 * 4,
			builtGen: 0,
			lastUsed: 0,
		},
		close,
	};
}

describe("CommittedLayer safety bounds", () => {
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
		const stale = tile(4, 0, 0);
		layer.tiles.set("4:0:0", stale.value);
		layer.gen.set("4:0:0", 1);

		const drawImage = vi.fn();
		const ctx = {
			save: vi.fn(),
			restore: vi.fn(),
			setTransform: vi.fn(),
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			beginPath: vi.fn(),
			rect: vi.fn(),
			clip: vi.fn(),
			drawImage,
			imageSmoothingEnabled: true,
			imageSmoothingQuality: "low",
		} as unknown as CanvasRenderingContext2D;
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

		expect(drawImage).not.toHaveBeenCalled();
		expect(overviewComposite).toHaveBeenCalledOnce();
		expect(result.needsBake).toBe(true);
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
