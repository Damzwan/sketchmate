import { describe, expect, it, vi } from "vitest";
import { RenderEngine, type Surface } from "./renderEngine";
import type { Bounded, SpatialIndex } from "./committedLayer";

interface TestObject extends Bounded {}

function stubOffscreenCanvas(): void {
	if ((globalThis as any).OffscreenCanvas) return;
	(globalThis as any).OffscreenCanvas = class {
		constructor(
			public width: number,
			public height: number,
		) {}
		getContext() {
			return new Proxy({} as any, { get: () => () => {} });
		}
		transferToImageBitmap() {
			return { close: vi.fn() } as unknown as ImageBitmap;
		}
	};
}

function makeEngine(query: SpatialIndex<TestObject>["query"]) {
	stubOffscreenCanvas();
	const surface: Surface = {
		getContext: () => new Proxy({} as any, { get: () => () => {} }),
		getSize: () => ({ w: 400, h: 400 }),
		getVpt: () => [1, 0, 0, 1, 0, 0],
		getDpr: () => 1,
		getBackground: () => "#ffffff",
	};
	const engine = new RenderEngine<TestObject>(
		{ query },
		() => {},
		() => {},
		surface,
		() => ({
			reset: () => {},
			shouldYield: () => false,
			yield: () => Promise.resolve(),
		}),
		{ tileSize: 256, overviewPx: 64, memoryBudgetMB: 32 },
	);
	engine.setContentBounds({ x: 0, y: 0, w: 1_000, h: 1_000 });
	return engine as any;
}

describe("bakeVisibleBlocking", () => {
	it("resolves as soon as the pass finishes, well inside the budget", async () => {
		// A small drawing must not be held behind the ceiling — it is a ceiling,
		// not a target.
		const engine = makeEngine(() => []);
		const startedAt = Date.now();
		await engine.bakeVisibleBlocking(5_000);
		expect(Date.now() - startedAt).toBeLessThan(1_000);
	});

	it("stops WAITING at the budget but lets the pass keep running", async () => {
		// The budget bounds the wait, not the work. Aborting on timeout would throw
		// away every tile baked so far and make the user wait for it again; the
		// reveal is safe regardless because the overview is already built.
		let released!: () => void;
		const gate = new Promise<void>((resolve) => {
			released = resolve;
		});
		let queries = 0;
		const engine = makeEngine(() => {
			queries++;
			return [];
		});
		// Wedge the bake by making the index query await a gate we control.
		const committed = engine.committed;
		const realBake = committed.bake.bind(committed);
		let finished = false;
		committed.bake = async (...args: any[]) => {
			await gate;
			await realBake(...args);
			finished = true;
		};

		const startedAt = Date.now();
		await engine.bakeVisibleBlocking(80);
		const waited = Date.now() - startedAt;

		expect(waited).toBeGreaterThanOrEqual(70);
		expect(finished).toBe(false); // still running — deliberately not aborted

		released();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(finished).toBe(true);
		expect(queries).toBeGreaterThan(0);
	});

	it("declines to start a second pass while one is in flight", async () => {
		const engine = makeEngine(() => []);
		engine.baking = true;
		const bake = vi.spyOn(engine.committed, "bake");
		await engine.bakeVisibleBlocking(50);
		expect(bake).not.toHaveBeenCalled();
	});

	it("does nothing when the caller has already aborted", async () => {
		const engine = makeEngine(() => []);
		const bake = vi.spyOn(engine.committed, "bake");
		const controller = new AbortController();
		controller.abort();
		await engine.bakeVisibleBlocking(50, controller.signal);
		expect(bake).not.toHaveBeenCalled();
	});
});
