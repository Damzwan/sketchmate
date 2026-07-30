import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "fabric";
import { createDrawEventManager } from "./drawEventManager";
import type { FabricEvent } from "./fabricEvent.types";

function createCanvasStub() {
	return {
		on: vi.fn(),
		off: vi.fn(),
	} as unknown as Canvas;
}

describe("DrawEventManager", () => {
	it("switches tool events without Pinia", () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const first = { on: "mouse:down", handler: vi.fn() };
		const second = { on: "mouse:move", handler: vi.fn() };

		manager.init(canvas);
		manager.switchToolEvents({ events: [first] } as any);
		manager.switchToolEvents({ events: [second] } as any);

		expect(canvas.off).toHaveBeenCalledWith(first.on, first.handler);
		expect(canvas.on).toHaveBeenCalledWith(second.on, second.handler);
	});

	it("reattaches events after nested suspension", async () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const event = {
			on: "object:added",
			handler: vi.fn(),
		} satisfies FabricEvent;

		manager.init(canvas);
		manager.addEventsOfService("objects", [event]);
		await manager.actionWithoutEvents(async () => {
			await manager.actionWithoutEvents(() => {
				expect(manager.isSuspended()).toBe(true);
			});
		});

		expect(manager.isSuspended()).toBe(false);
		expect(canvas.off).toHaveBeenCalledTimes(1);
		expect(canvas.on).toHaveBeenCalledTimes(2);
	});
});
