import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	Bounded,
	SpatialIndex,
	WorldRect,
	Yieldable,
} from "@/draw/rendering/committedLayer";
import { RenderEngine } from "@/draw/rendering/renderEngine";

interface TestObject extends Bounded {}

function makeEngine() {
	const index: SpatialIndex<TestObject> = { query: () => [] };
	const yielder: Yieldable = {
		reset: vi.fn(),
		shouldYield: () => false,
		yield: async () => {},
	};
	return new RenderEngine<TestObject>(
		index,
		vi.fn(),
		vi.fn(),
		{
			getContext: () => ({}) as CanvasRenderingContext2D,
			getSize: () => ({ w: 800, h: 600 }),
			getVpt: () => [1, 0, 0, 1, 0, 0],
			getDpr: () => 1,
			getBackground: () => "#fff",
		},
		() => yielder,
		{ bakeDebounceMs: 10_000 },
	);
}

describe("RenderEngine erase bursts", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("defers and merges overview repairs while erasing", () => {
		const engine = makeEngine() as any;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRect")
			.mockReturnValue(true);
		const rebuild = vi.spyOn(engine.committed, "rebuildRectSync");
		const rects: WorldRect[] = [
			{ x: 10, y: 10, w: 80, h: 80 },
			{ x: 30, y: 20, w: 80, h: 80 },
			{ x: 50, y: 30, w: 80, h: 80 },
		];

		engine.setErasing(true);
		engine.setGesturing(true);
		for (const rect of rects) engine.onErase({} as TestObject, rect, false);

		expect(patch).not.toHaveBeenCalled();
		expect(rebuild).not.toHaveBeenCalled();

		engine.setGesturing(false);
		expect(patch).not.toHaveBeenCalled();

		engine.setErasing(false);

		expect(patch).toHaveBeenCalledOnce();
		expect(patch).toHaveBeenCalledWith(
			{ x: 10, y: 10, w: 120, h: 100 },
			expect.any(Number),
		);
		engine.reset();
	});

	it("can defer erase-history overview work while bounding sync repair", () => {
		const engine = makeEngine() as any;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRect")
			.mockReturnValue(true);
		const rebuild = vi
			.spyOn(engine.committed, "rebuildRectSync")
			.mockReturnValue(2);
		const rect = { x: 20, y: 20, w: 100, h: 80 };

		engine.invalidateChanged(rect, null, 2, true);

		expect(rebuild).toHaveBeenCalledWith(
			rect,
			expect.any(Number),
			expect.any(Object),
			2,
		);
		expect(patch).not.toHaveBeenCalled();
		expect(engine.pendingOverview).toEqual([rect]);
		engine.reset();
	});
});
