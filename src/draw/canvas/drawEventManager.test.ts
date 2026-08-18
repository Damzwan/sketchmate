import type { Canvas } from "fabric";
import { describe, expect, it, vi } from "vitest";
import { createDrawEventManager } from "./drawEventManager";
import type { FabricEvent } from "./fabricEvent.types";

function createCanvasStub() {
	return {
		on: vi.fn(),
		off: vi.fn(),
	} as unknown as Canvas;
}

describe("DrawEventManager", () => {
	it("executes actions before a canvas is attached", async () => {
		const manager = createDrawEventManager();
		const action = vi.fn();

		await manager.actionWithoutEvents(action);

		expect(action).toHaveBeenCalledOnce();
		expect(manager.isSuspended()).toBe(false);
	});

	it("ignores late registration and removal after teardown", () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const event = {
			on: "object:added",
			handler: vi.fn(),
		} satisfies FabricEvent;

		manager.init(canvas);
		manager.addEventsOfService("objects", [event]);
		manager.destroy();

		expect(() => manager.removeEventsOfService("objects")).not.toThrow();
		expect(() => manager.addEventsOfService("late", [event])).not.toThrow();
		expect(() =>
			manager.switchToolEvents({ events: [event] } as any),
		).not.toThrow();
		expect(canvas.on).toHaveBeenCalledTimes(1);
	});

	it("replaces an already registered service without leaking handlers", () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const first = {
			on: "object:added",
			handler: vi.fn(),
		} satisfies FabricEvent;
		const second = {
			on: "object:removed",
			handler: vi.fn(),
		} satisfies FabricEvent;

		manager.init(canvas);
		manager.addEventsOfService("objects", [first]);
		manager.addEventsOfService("objects", [second]);

		expect(canvas.off).toHaveBeenCalledWith(first.on, first.handler);
		expect(canvas.on).toHaveBeenCalledWith(second.on, second.handler);
	});

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

	it("detaches service and permanent events exactly once on repeated destroy", () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const serviceEvent = {
			on: "object:added",
			handler: vi.fn(),
		} satisfies FabricEvent;
		const permanentEvent = {
			on: "after:render",
			handler: vi.fn(),
		} satisfies FabricEvent;

		manager.init(canvas);
		manager.addEventsOfService("objects", [serviceEvent]);
		manager.addPermanentEvents([permanentEvent]);
		manager.destroy();
		manager.destroy();

		expect(canvas.off).toHaveBeenCalledTimes(2);
		expect(canvas.off).toHaveBeenCalledWith(
			serviceEvent.on,
			serviceEvent.handler,
		);
		expect(canvas.off).toHaveBeenCalledWith(
			permanentEvent.on,
			permanentEvent.handler,
		);
	});

	it("does not reattach events when an async action settles after teardown", async () => {
		const canvas = createCanvasStub();
		const manager = createDrawEventManager();
		const event = {
			on: "object:added",
			handler: vi.fn(),
		} satisfies FabricEvent;
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});

		manager.init(canvas);
		manager.addEventsOfService("objects", [event]);
		const action = manager.actionWithoutEvents(() => pending);
		manager.destroy();
		release();
		await action;

		// Initial attach only; the disposed canvas is never resurrected.
		expect(canvas.on).toHaveBeenCalledTimes(1);
		expect(manager.isSuspended()).toBe(false);
	});
});
