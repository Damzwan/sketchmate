import type { Canvas } from "fabric";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import type { ToolService } from "@/draw/tools/tool.types";

export function createDrawEventManager() {
	let c: Canvas | undefined;
	const eventsMapping: Record<string, FabricEvent[]> = {};
	const permanentEvents: FabricEvent[] = [];

	function init(canvas: Canvas) {
		destroy();
		c = canvas;
		eventsMapping["tool"] = [];
	}

	function destroy() {
		if (c) {
			for (const key in eventsMapping) {
				for (const ev of eventsMapping[key]) c.off(ev.on, ev.handler);
			}
			for (const ev of permanentEvents) c.off(ev.on, ev.handler);
		}
		for (const key in eventsMapping) delete eventsMapping[key];
		permanentEvents.length = 0;
		deactivationStack = 0;
		c = undefined;
	}

	function addEventsOfService(name: string, events: FabricEvent[]) {
		const canvas = c;
		if (!canvas) return;
		// Re-registering a service is allowed (the room/loading watcher does this),
		// but it must replace rather than leak the previous handlers.
		removeEventsOfService(name);
		eventsMapping[name] = events;
		if (deactivationStack === 0) {
			events.forEach((ev) => canvas.on(ev.on, ev.handler));
		}
	}

	function addPermanentEvents(events: FabricEvent[]) {
		const canvas = c;
		if (!canvas) return;
		permanentEvents.push(...events);
		events.forEach((ev) => canvas.on(ev.on, ev.handler));
	}

	function activateExclusiveEvents(events: FabricEvent[]) {
		const canvas = c;
		if (!canvas) return;
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => canvas.off(ev.on, ev.handler));
		}
		events.forEach((ev) => canvas.on(ev.on, ev.handler));
		eventsMapping["exclusive"] = events;
	}

	function deActivateExclusiveEvents() {
		const canvas = c;
		if (!canvas) {
			delete eventsMapping["exclusive"];
			return;
		}
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => canvas.off(ev.on, ev.handler));
		}
		removeEventsOfService("exclusive");
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => canvas.on(ev.on, ev.handler));
		}
	}

	function removeEventsOfService(name: string) {
		if (!eventsMapping[name]) return;
		const events = eventsMapping[name];
		const canvas = c;
		if (canvas) events.forEach((ev) => canvas.off(ev.on, ev.handler));
		delete eventsMapping[name];
	}

	function switchToolEvents(newTool: ToolService) {
		const canvas = c;
		if (!canvas) return;
		(eventsMapping["tool"] ?? []).forEach((ev) =>
			canvas.off(ev.on, ev.handler),
		);
		eventsMapping["tool"] = newTool.events;
		if (deactivationStack === 0) {
			eventsMapping["tool"].forEach((ev) => canvas.on(ev.on, ev.handler));
		}
	}

	let deactivationStack = 0;

	// True while events are suspended (history/sync/load run through
	// actionWithoutEvents). Lets guards tell a genuine user action apart from a
	// programmatic re-add.
	function isSuspended() {
		return deactivationStack > 0;
	}

	async function actionWithoutEvents(action: () => Promise<void> | void) {
		const canvas = c;
		// Initial document loading intentionally happens before the event manager is
		// attached. There are no listeners to suspend yet, but the load action must
		// still run. This also keeps late teardown work harmless without silently
		// dropping its callback.
		if (!canvas) {
			await action();
			return;
		}
		deactivationStack++;

		if (deactivationStack === 1) {
			for (const key in eventsMapping) {
				eventsMapping[key].forEach((ev) => canvas.off(ev.on, ev.handler));
			}
		}

		try {
			await action();
		} finally {
			// destroy() resets the shared stack. Do not let a suspension belonging
			// to the disposed canvas decrement the new session to -1 when its async
			// action eventually settles.
			if (c === canvas) {
				deactivationStack = Math.max(0, deactivationStack - 1);

				if (deactivationStack === 0) {
					for (const key in eventsMapping) {
						eventsMapping[key].forEach((ev) => canvas.on(ev.on, ev.handler));
					}
				}
			}
		}
	}

	return {
		init,
		addEventsOfService,
		removeEventsOfService,
		switchToolEvents,
		actionWithoutEvents,
		isSuspended,
		activateExclusiveEvents,
		deActivateExclusiveEvents,
		addPermanentEvents,
		destroy,
	};
}

export type DrawEventManager = ReturnType<typeof createDrawEventManager>;

let drawEventManager: DrawEventManager | undefined;

export function useDrawEventManager(): DrawEventManager {
	return (drawEventManager ??= createDrawEventManager());
}
