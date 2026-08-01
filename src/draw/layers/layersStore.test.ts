import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_LAYER_ID, FIXED_ROOM_LAYERS } from "@/draw/layers/layer.types";
import {
	activeLayerId,
	getLayers,
	isLayerHidden,
	resetLayerRegistry,
} from "@/draw/layers/layerRegistry";

const recorded: any[] = [];
const removed: any[] = [];
const invalidated: (string | null)[] = [];
const fired: any[] = [];
let sceneObjects: any[] = [];
let activeObjects: any[] = [];

vi.mock("@/draw/canvas/drawObjectManager", () => ({
	useDrawObjectManager: () => ({
		invalidateLayer: (id: string | null) => invalidated.push(id),
		objectIdsOnLayer: (layerId: string) =>
			sceneObjects.filter((o) => o.layerId === layerId).map((o) => o.id),
		getObjectById: (id: string) => sceneObjects.find((o) => o.id === id),
		markZIndexDirty: () => {},
		beginBatch: () => {},
		endBatch: () => {},
	}),
}));

vi.mock("@/draw/canvas/canvasController", () => ({
	useCanvasController: () => ({
		getCanvas: () => ({
			getObjects: () => sceneObjects,
			remove: (...objects: any[]) => {
				removed.push(...objects);
				sceneObjects = sceneObjects.filter((o) => !objects.includes(o));
			},
			fire: (name: string, payload: any) => fired.push({ name, payload }),
			getActiveObjects: () => activeObjects,
			getActiveObject: () => activeObjects[0],
			discardActiveObject: () => {
				activeObjects = [];
			},
			requestRenderAll: () => {},
		}),
	}),
}));

vi.mock("@/draw/history/history.store", () => ({
	useDrawHistoryManager: () => ({
		addToUndoStackWithResetRedo: (action: any) => recorded.push(action),
		defineLazyJSON: (params: any, key: string, objects: any[]) => {
			Object.defineProperty(params, key, {
				configurable: true,
				enumerable: true,
				get: () => objects.map((o) => ({ ...o })),
			});
		},
	}),
}));

import { useLayersStore } from "@/draw/layers/layers.store";

function object(id: string, layerId: string) {
	return { id, layerId };
}

describe("layers store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		resetLayerRegistry();
		recorded.length = 0;
		removed.length = 0;
		invalidated.length = 0;
		fired.length = 0;
		sceneObjects = [];
		activeObjects = [];
	});

	it("moves the live selection to the active layer", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true });
		const moved = object("moved", "l0");
		sceneObjects = [moved];
		activeObjects = [moved];

		// The real flow: pick the destination layer first, THEN move. Switching
		// layers must not throw the selection away, or there is nothing to move.
		layers.setActive("l2");
		// Through the canvas selection, the path the sheet actually uses.
		expect(layers.moveSelectionToLayer(layers.activeId)).toBe(1);

		expect(moved.layerId).toBe("l2");
		const event = fired.find((f) => f.name === "objectStyleChanged");
		// Rides the existing style event, so history + sync + repaint come free.
		expect(event.payload.style).toEqual({ layerId: "l2" });
		expect(event.payload.prevStyles).toEqual([{ layerId: "l0" }]);
		expect(event.payload.target).toEqual([moved]);
	});

	it("ignores a selection whose objects have left the scene", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true });
		const stale = object("stale", "l0");
		activeObjects = [stale]; // never added to sceneObjects
		sceneObjects = [];

		expect(layers.moveSelectionToLayer("l1")).toBe(0);

		expect(stale.layerId).toBe("l0");
		expect(fired).toHaveLength(0);
	});

	it("gives a room the fixed set and refuses structural edits", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true });

		expect(layers.layers.map((l) => l.id)).toEqual(
			FIXED_ROOM_LAYERS.map((l) => l.id),
		);
		expect(layers.canEditStructure).toBe(false);
		expect(layers.addLayer()).toBeNull();
		expect(layers.deleteLayer("l1")).toBe(false);
		layers.renameLayer("l1", "Mine");
		expect(layers.layers[1].name).toBe(FIXED_ROOM_LAYERS[1].name);
		layers.moveLayer(0, 1);
		expect(layers.layers.map((l) => l.id)).toEqual(
			FIXED_ROOM_LAYERS.map((l) => l.id),
		);
		// Nothing structural happened, so nothing reached the undo stack.
		expect(recorded).toHaveLength(0);
	});

	it("keeps the room layer set out of the persisted document", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true });
		expect(layers.serialize()).toBeUndefined();

		layers.init({ isLobby: false });
		expect(layers.serialize()).toEqual([
			{ id: BASE_LAYER_ID, name: "Layer 1", visible: true, locked: false },
		]);
	});

	it("restores persisted layers but never a hidden or locked state", () => {
		const layers = useLayersStore();
		layers.init({
			isLobby: false,
			persisted: [
				{ id: "a", name: "Sky", visible: false, locked: true },
				{ id: "a", name: "duplicate id", visible: true, locked: false },
				{ id: "b", name: "Ground", visible: true, locked: false },
			],
		});
		expect(layers.layers).toEqual([
			{ id: "a", name: "Sky", visible: true, locked: false },
			{ id: "b", name: "Ground", visible: true, locked: false },
		]);
	});

	it("moves the drawing cursor off a layer it just hid", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true });
		layers.setActive("l2");
		expect(activeLayerId()).toBe("l2");

		layers.setVisible("l2", false);

		expect(isLayerHidden("l2")).toBe(true);
		expect(layers.activeId).not.toBe("l2");
		expect(activeLayerId()).toBe(layers.activeId);
		// Bounded invalidation: the hidden layer's own footprint, not the board.
		expect(invalidated).toEqual(["l2"]);
	});

	it("records one undoable entry for a layer delete, with its objects", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: false });
		const id = layers.addLayer("Ink")!;
		sceneObjects = [object("keep", BASE_LAYER_ID), object("gone", id)];

		expect(layers.deleteLayer(id)).toBe(true);

		expect(removed.map((o) => o.id)).toEqual(["gone"]);
		expect(layers.layers.map((l) => l.id)).toEqual([BASE_LAYER_ID]);
		const action = recorded.at(-1);
		expect(action.type).toBe("layerDeleted");
		expect(action.params.layer.id).toBe(id);
		expect(action.params.objectsJSON.map((o: any) => o.id)).toEqual(["gone"]);
		// Weight is precomputed so trimming never reads through the lazy getter.
		expect(action.__w).toBe(2);
	});

	it("puts a re-added layer back at its recorded index", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: false });
		const middle = layers.addLayer("Middle")!;
		const top = layers.addLayer("Top")!;

		layers.applyRemoveLayer(middle);
		expect(getLayers().map((l) => l.id)).toEqual([BASE_LAYER_ID, top]);

		layers.applyAddLayer(
			{ id: middle, name: "Middle", visible: true, locked: false },
			1,
		);
		expect(getLayers().map((l) => l.id)).toEqual([BASE_LAYER_ID, middle, top]);
		// Re-inserting BELOW an existing layer restacks the board.
		expect(invalidated.at(-1)).toBeNull();
	});
});
