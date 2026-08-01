import { afterEach, describe, expect, it, vi } from "vitest";
import { createYielder } from "./yielder";

describe("render yielder frame backstop", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("keeps early yields quick, then guarantees an animation-frame opportunity", async () => {
		let clock = 0;
		vi.spyOn(performance, "now").mockImplementation(() => clock);
		const raf = vi.fn((callback: FrameRequestCallback) => {
			callback(clock);
			return 1;
		});
		vi.stubGlobal("requestAnimationFrame", raf);

		const yielder = createYielder({
			budgetMs: 1,
			frameYieldIntervalMs: 12,
			label: "tile-bake",
		});

		clock = 5;
		await yielder.forceYield();
		expect(raf).not.toHaveBeenCalled();

		clock = 13;
		await yielder.forceYield();
		expect(raf).toHaveBeenCalledOnce();

		// The RAF resets the interval, so the next nearby yield remains the cheap
		// task yield instead of paying for a second consecutive frame.
		clock = 14;
		await yielder.forceYield();
		expect(raf).toHaveBeenCalledOnce();
	});
});
