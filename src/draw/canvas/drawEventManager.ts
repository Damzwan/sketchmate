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
		eventsMapping[name] = events;
		events.forEach((ev) => c!.on(ev.on, ev.handler));
	}

	function addPermanentEvents(events: FabricEvent[]) {
		permanentEvents.push(...events);
		events.forEach((ev) => c!.on(ev.on, ev.handler));
	}

	function activateExclusiveEvents(events: FabricEvent[]) {
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler));
		}
		events.forEach((ev) => c!.on(ev.on, ev.handler));
		eventsMapping["exclusive"] = events;
	}

	function deActivateExclusiveEvents() {
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler));
		}
		removeEventsOfService("exclusive");
		for (const key in eventsMapping) {
			eventsMapping[key].forEach((ev) => c!.on(ev.on, ev.handler));
		}
	}

	function removeEventsOfService(name: string) {
		if (!eventsMapping[name]) return;
		const events = eventsMapping[name];
		events.forEach((ev) => c!.off(ev.on, ev.handler));
		delete eventsMapping[name];
	}

	function switchToolEvents(newTool: ToolService) {
		eventsMapping["tool"].forEach((ev) => c!.off(ev.on, ev.handler));
		eventsMapping["tool"] = newTool.events;
		eventsMapping["tool"].forEach((ev) => c!.on(ev.on, ev.handler));
	}

	let deactivationStack = 0;

	// True while events are suspended (history/sync/load run through
	// actionWithoutEvents). Lets guards tell a genuine user action apart from a
	// programmatic re-add.
	function isSuspended() {
		return deactivationStack > 0;
	}

	async function actionWithoutEvents(action: () => Promise<void> | void) {
		deactivationStack++;

		if (deactivationStack === 1) {
			for (const key in eventsMapping) {
				eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler));
			}
		}

		try {
			await action();
		} finally {
			deactivationStack--;

			if (deactivationStack === 0) {
				for (const key in eventsMapping) {
					eventsMapping[key].forEach((ev) => c!.on(ev.on, ev.handler));
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
