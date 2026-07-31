import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	Bounded,
	SpatialIndex,
	WorldRect,
	Yieldable,
} from "@/draw/rendering/committedLayer";
import { RenderEngine } from "@/draw/rendering/renderEngine";

interface TestObject extends Bounded {}

function makeEngine(options: Record<string, unknown> = {}) {
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
		{ bakeDebounceMs: 10_000, ...options },
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

	it("keeps history-burst repair off main until the mutation closes", () => {
		const engine = makeEngine() as any;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRect")
			.mockReturnValue(true);
		const rebuild = vi.spyOn(engine.committed, "rebuildRectSync");
		const scheduleOverview = vi.spyOn(engine, "scheduleOverviewRebuild");
		const rect = { x: 20, y: 20, w: 100, h: 80 };

		engine.setMutating(true);
		engine.invalidateRegions([rect]);

		expect(rebuild).not.toHaveBeenCalled();
		expect(patch).not.toHaveBeenCalled();
		expect(engine.pendingOverview).toEqual([rect]);

		engine.setMutating(false);

		expect(patch).not.toHaveBeenCalled();
		expect(engine.pendingOverview).toEqual([]);
		expect(engine.committed.overview.isDirty()).toBe(true);
		expect(scheduleOverview).toHaveBeenCalledOnce();
		engine.reset();
	});

	it("repairs the edit once the mutation has closed", () => {
		// The other half of the contract above. `mutating` DEFERS repair; it must
		// not cancel it. A burst that flushes its batch while still mutating skips
		// the repair entirely and leaves the edited region on a coarse fallback
		// until the async bake — the "undo pops a low-res version" report. Callers
		// therefore close the mutation BEFORE flushing (closeHistoryBurst,
		// finalizeCleanup).
		const engine = makeEngine() as any;
		const rebuild = vi.spyOn(engine.committed, "rebuildRectSync");
		const rect = { x: 20, y: 20, w: 100, h: 80 };

		engine.setMutating(true);
		engine.setMutating(false);
		engine.invalidateRegions([rect]);

		expect(rebuild).toHaveBeenCalled();
		engine.reset();
	});

	it("keeps overview patches off main with a remote renderer", () => {
		const engine = makeEngine({
			remoteOverview: vi.fn(async () => null),
		}) as any;
		const patch = vi.spyOn(engine.committed.overview, "patchRect");
		const scheduleOverview = vi.spyOn(engine, "scheduleOverviewRebuild");
		const rect = { x: 20, y: 20, w: 100, h: 80 };

		engine.invalidateRegions([rect]);

		expect(patch).not.toHaveBeenCalled();
		expect(engine.committed.overview.isDirty()).toBe(true);
		expect(scheduleOverview).toHaveBeenCalledOnce();
		engine.reset();
	});

	it("repairs a transform seam immediately during a remote gesture", () => {
		const engine = makeEngine({
			remoteOverview: vi.fn(async () => null),
		}) as any;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRect")
			.mockReturnValue(true);
		const scheduleOverview = vi.spyOn(engine, "scheduleOverviewRebuild");
		const rect = { x: 20, y: 20, w: 100, h: 80 };

		engine.setGesturing(true);
		engine.dropRegionLight(rect, 0, true);

		expect(patch).toHaveBeenCalledWith(rect, 200);
		expect(scheduleOverview).not.toHaveBeenCalled();
		engine.reset();
	});

	it("keeps sharp tiles visible while a lower-z insertion bakes", () => {
		const engine = makeEngine() as any;
		const markStale = vi.spyOn(engine.committed, "markStale");
		const markDirty = vi.spyOn(engine.committed, "markDirty");
		const object = {
			id: "bucket-fill",
			getBoundingRect: () => ({ left: 20, top: 30, width: 100, height: 80 }),
		};

		engine.onObjectAdded(object, false);

		expect(markStale).toHaveBeenCalledWith({ x: 20, y: 30, w: 100, h: 80 });
		expect(markDirty).not.toHaveBeenCalled();
		engine.reset();
	});

	it("retains both transform footprints until their tiles are replaced", () => {
		const engine = makeEngine() as any;
		const markStale = vi.spyOn(engine.committed, "markStale");
		const markDirty = vi.spyOn(engine.committed, "markDirty");
		const rects = [
			{ x: 20, y: 30, w: 100, h: 80 },
			{ x: 220, y: 130, w: 100, h: 80 },
		];

		engine.retainRegionsUntilRebaked(rects);

		expect(markStale).toHaveBeenCalledTimes(2);
		expect(markDirty).not.toHaveBeenCalled();
		engine.reset();
	});

	it("cancels posted worker work when an interaction aborts a bake", () => {
		const cancelRemoteWork = vi.fn();
		const engine = makeEngine({ cancelRemoteWork }) as any;

		engine.setGesturing(true);

		expect(cancelRemoteWork).toHaveBeenCalledOnce();
		engine.reset();
	});
});
