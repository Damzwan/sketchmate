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

	it("defers and merges overview repairs while erasing", async () => {
		const engine = makeEngine() as any;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRectYielded")
			.mockResolvedValue(true);
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

		await vi.waitFor(() => expect(patch).toHaveBeenCalledOnce());
		expect(patch).toHaveBeenCalledOnce();
		expect(patch).toHaveBeenCalledWith(
			{ x: 10, y: 10, w: 120, h: 100 },
			expect.any(Number),
			expect.any(Object),
			expect.any(AbortSignal),
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

	it("waits for every high-zoom tile before handing a live stroke to the overview", async () => {
		const engine = makeEngine() as any;
		const object = {
			id: "fresh-stroke",
			getBoundingRect: () => ({ left: 20, top: 30, width: 100, height: 80 }),
		};
		let tilesReady = false;
		vi.spyOn(engine.committed, "canStampAll").mockImplementation(
			() => tilesReady,
		);
		const dropOtherTiers = vi.spyOn(engine.committed, "dropOtherTiers");
		let attempts = 0;
		const patch = vi
			.spyOn(engine.committed.overview, "patchRectYielded")
			.mockImplementation(async (...args: any[]) => {
				attempts++;
				if (attempts === 1) {
					// This is what an immediate pinch does: gesture start aborts the
					// in-flight overview patch before its atomic commit.
					engine.setGesturing(true);
					expect(args[3].aborted).toBe(true);
					return false;
				}
				return true;
			});

		engine.onObjectAdded(object, true);

		expect(dropOtherTiers).toHaveBeenCalledOnce();
		expect(engine.live.has(object.id)).toBe(true);
		expect(engine.live.items.get(object.id).mode).toBe("additive");
		// A multi-tile high-zoom region is all-or-nothing. Starting the overview
		// patch while one tile is still stale would put low-res ink under the full
		// live vector and produce the post-stroke blurry halo.
		expect(engine.demoteSettled()).toBe(0);
		expect(engine.overviewSplitQueue).toHaveLength(0);
		expect(patch).not.toHaveBeenCalled();

		tilesReady = true;
		expect(engine.demoteSettled()).toBe(0);
		expect(engine.overviewSplitQueue).toHaveLength(1);

		await engine.drainOneOverviewPatch();

		// Abort requeues the exact tracked job and cannot retire the only
		// cross-tier copy of the stroke.
		expect(engine.live.has(object.id)).toBe(true);
		expect(engine.overviewSplitQueue).toHaveLength(1);
		// At far zoom the overview is still old, so the live bridge must paint.
		expect(
			engine.liveItemAlreadyPainted({ x: 20, y: 30, w: 100, h: 80 }, 0.01),
		).toBe(false);

		engine.setGesturing(false);
		await engine.drainOneOverviewPatch();

		expect(patch).toHaveBeenCalledTimes(2);
		// Commit and retirement are one transition: no frame can composite the
		// updated overview underneath the same translucent live stroke.
		expect(engine.live.has(object.id)).toBe(false);
		engine.reset();
	});

	it("drops an incomplete origin tier when overview zoom commits the handoff", async () => {
		const engine = makeEngine() as any;
		const rect = { x: 20, y: 30, w: 100, h: 80 };
		const object = {
			id: "zoomed-away-stroke",
			getBoundingRect: () => ({ left: 20, top: 30, width: 100, height: 80 }),
		};
		vi.spyOn(engine.committed, "canStampAll").mockReturnValue(false);
		const dropTiles = vi.spyOn(engine.committed, "dropTiles");
		vi.spyOn(engine.committed.overview, "patchRectYielded").mockResolvedValue(
			true,
		);

		engine.onObjectAdded(object, true);
		const originTier = engine.overviewHandoffTier.get(object.id);
		vi.spyOn(engine.surface, "getVpt").mockReturnValue([
			0.01, 0, 0, 0.01, 0, 0,
		]);
		expect(engine.demoteSettled()).toBe(0);
		await engine.drainOneOverviewPatch();

		expect(dropTiles).toHaveBeenCalledWith(rect, originTier);
		expect(engine.live.has(object.id)).toBe(false);
		expect(engine.overviewHandoffPending.has(object.id)).toBe(false);
		engine.reset();
	});

	it("repairs a lower-z insertion in the same frame instead of waiting for the bake", () => {
		// A stroke drawn on a lower LAYER takes this branch on every commit: it
		// gets no live overlay (it must not paint over what covers it), so without
		// a synchronous repair it stays invisible for the whole bake round-trip.
		const engine = makeEngine() as any;
		const repair = vi
			.spyOn(engine.committed, "rebuildRectSync")
			.mockReturnValue(1);
		const object = {
			id: "under-stroke",
			getBoundingRect: () => ({ left: 20, top: 30, width: 100, height: 80 }),
		};

		engine.onObjectAdded(object, false);

		expect(repair).toHaveBeenCalledWith(
			{ x: 20, y: 30, w: 100, h: 80 },
			expect.any(Number),
			expect.anything(),
			expect.any(Number),
		);
		engine.reset();
	});

	it("repairs an undo across more than six tiles before the bake", () => {
		// The old budget was a six-TILE count, so any edit wider than that left
		// its tail on the overview until the async bake — the blur after an
		// undo/redo. The bound is wall-clock now, and the work is already capped
		// by the viewport clip.
		const engine = makeEngine() as any;
		const repair = vi
			.spyOn(engine.committed, "rebuildRectSync")
			.mockReturnValue(1);

		engine.invalidateRegions([{ x: 0, y: 0, w: 4000, h: 40 }]);

		expect(repair).toHaveBeenCalledOnce();
		expect(repair.mock.calls[0][3]).toBeGreaterThan(6);
		engine.reset();
	});

	it("skips the coalescing debounce when a repair ran out of time", () => {
		const engine = makeEngine() as any;
		vi.spyOn(engine.committed, "rebuildRectSync").mockImplementation(() => {
			// Burn the shared slice so the next rect cannot be repaired.
			const until = performance.now() + 15;
			while (performance.now() < until) {
				/* spin */
			}
			return 1;
		});
		const bake = vi.spyOn(engine, "scheduleBake");

		// Both ON SCREEN (the surface is 800x600 at identity) and far enough apart
		// to stay separate rects — an off-screen rect is never repaired and so
		// could never report itself unrepaired.
		engine.invalidateRegions([
			{ x: 0, y: 0, w: 40, h: 40 },
			{ x: 700, y: 500, w: 40, h: 40 },
		]);

		expect(bake).toHaveBeenCalledWith(true);
		engine.reset();
	});

	it("detects an incomplete single-region repair and bakes immediately", () => {
		// rebuildRectSync has its own 6 ms slice, shorter than the outer batch
		// budget. Returning from it therefore does not mean the whole rect is ready.
		const engine = makeEngine() as any;
		vi.spyOn(engine.committed, "rebuildRectSync").mockReturnValue(1);
		vi.spyOn(engine.committed, "isRegionReady").mockReturnValue(false);
		const bake = vi.spyOn(engine, "scheduleBake");

		engine.invalidateRegions([{ x: 0, y: 0, w: 400, h: 300 }]);

		expect(bake).toHaveBeenCalledWith(true);
		engine.reset();
	});

	it("refuses to punch an erase across layers", () => {
		// The tile bitmap is the composite of every layer, so a destination-out
		// punch cannot tell the erased layer's pixels from anyone else's.
		const engine = makeEngine({ canPunchRegion: () => false }) as any;
		const stamp = vi.spyOn(engine.committed, "eraseStamp");
		const overviewErase = vi.spyOn(engine.committed.overview, "eraseObject");
		const rect = { x: 10, y: 10, w: 60, h: 60 };

		engine.onErase({ id: "stroke" }, rect, true);

		expect(stamp).not.toHaveBeenCalled();
		expect(overviewErase).not.toHaveBeenCalled();
		engine.reset();
	});

	it("keeps the punch when the region is single-layer", () => {
		const engine = makeEngine({ canPunchRegion: () => true }) as any;
		const stamp = vi
			.spyOn(engine.committed, "eraseStamp")
			.mockReturnValue(true);
		const rect = { x: 10, y: 10, w: 60, h: 60 };

		engine.onErase({ id: "stroke" }, rect, true);

		expect(stamp).toHaveBeenCalledOnce();
		engine.reset();
	});

	it("leaves an off-screen insertion entirely to the async bake", () => {
		const engine = makeEngine() as any;
		const repair = vi.spyOn(engine.committed, "rebuildRectSync");
		const object = {
			id: "far-away",
			getBoundingRect: () => ({
				left: 90_000,
				top: 90_000,
				width: 40,
				height: 40,
			}),
		};

		engine.onObjectAdded(object, false);

		expect(repair).not.toHaveBeenCalled();
		engine.reset();
	});

	it("limits transform transition pixels to the current visible tier", () => {
		// A move is not additive. The active tier may briefly retain the previous
		// sharp frame while its replacement lands, but every other tier is honestly
		// invalidated so zoom cannot resurrect pre-move pixels.
		const engine = makeEngine() as any;
		const markStale = vi.spyOn(engine.committed, "markStale");
		const transition = vi.spyOn(
			engine.committed,
			"markDirtyWithSharpTransition",
		);
		const rects = [
			{ x: 20, y: 30, w: 100, h: 80 },
			{ x: 220, y: 130, w: 100, h: 80 },
		];

		engine.retainRegionsUntilRebaked(rects);

		expect(transition).toHaveBeenCalledTimes(2);
		expect(markStale).not.toHaveBeenCalled();
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

describe("bake stall latch", () => {
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

	/** Composite that always reports the same number of holes — a cache too
	 *  small to ever satisfy the viewport. */
	function makeStuckEngine(holes = 4) {
		const engine = makeEngine({ bakeDebounceMs: 0 }) as any;
		vi.spyOn(engine.committed, "composite").mockReturnValue({
			needsBake: holes > 0,
			nonFresh: holes,
		});
		vi.spyOn(engine.committed, "bake").mockResolvedValue(undefined);
		vi.spyOn(engine.live, "composite").mockImplementation(() => {});
		vi.spyOn(engine.live, "gcExpired").mockReturnValue([]);
		return engine;
	}

	it("stops rescheduling once a pass fails to close any holes", async () => {
		const engine = makeStuckEngine();
		const schedule = vi.spyOn(engine, "scheduleBake");

		// Frame 1: holes seen, nothing has been tried yet → schedule a bake.
		engine.renderNow();
		expect(schedule).toHaveBeenCalledTimes(1);

		// The pass runs and closes nothing, then requests the frame that judges it.
		await engine.runBake();
		engine.renderNow();

		// That frame must NOT arm another pass: same view, same hole count.
		expect(schedule).toHaveBeenCalledTimes(1);

		// And it must stay quiet — this is the infinite blur/unblur loop.
		engine.renderNow();
		engine.renderNow();
		expect(schedule).toHaveBeenCalledTimes(1);
	});

	it("re-arms when the viewport moves", async () => {
		const engine = makeStuckEngine();
		engine.renderNow();
		await engine.runBake();
		engine.renderNow();
		const settled = (vi.spyOn(engine, "scheduleBake") as any).mock.calls.length;

		engine.surface.getVpt = () => [1, 0, 0, 1, -400, -300];
		engine.renderNow();

		expect((engine.scheduleBake as any).mock.calls.length).toBeGreaterThan(
			settled,
		);
	});

	it("re-arms when the scene is edited", async () => {
		const engine = makeStuckEngine();
		engine.renderNow();
		await engine.runBake();
		engine.renderNow();
		const schedule = vi.spyOn(engine, "scheduleBake");

		// Any invalidation bumps the mutation epoch, which is part of the key —
		// so no invalidation path has to remember to clear the latch.
		engine.committed.mutationEpoch++;
		engine.renderNow();

		expect(schedule).toHaveBeenCalled();
	});

	it("keeps baking while passes ARE making progress", async () => {
		const engine = makeEngine({ bakeDebounceMs: 0 }) as any;
		let holes = 6;
		vi.spyOn(engine.committed, "composite").mockImplementation(() => ({
			needsBake: holes > 0,
			nonFresh: holes,
		}));
		vi.spyOn(engine.committed, "bake").mockImplementation(async () => {
			holes -= 2; // each pass closes some
		});
		vi.spyOn(engine.live, "composite").mockImplementation(() => {});
		vi.spyOn(engine.live, "gcExpired").mockReturnValue([]);
		const schedule = vi.spyOn(engine, "scheduleBake");

		engine.renderNow();
		await engine.runBake();
		engine.renderNow();
		await engine.runBake();
		engine.renderNow();

		// Never latched: a partly-filled viewport must keep going.
		expect(schedule.mock.calls.length).toBeGreaterThan(1);
	});
});
