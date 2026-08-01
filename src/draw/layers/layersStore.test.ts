import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	BASE_LAYER_ID,
	FIXED_ROOM_LAYERS,
	FREE_LAYER_LIMIT,
	MAX_SOLO_LAYERS,
} from "@/draw/layers/layer.types";
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

vi.mock("@/store/auth.store", () => ({
	useAuthStore: () => ({ user: { _id: "me" } }),
}));

// Mocked to keep the app router (which the real store imports transitively, and
// which needs `window`) out of a node test — and so the tier can be flipped.
let isPro = false;
vi.mock("@/store/subscription.store", () => ({
	useSubscriptionStore: () => ({
		get isPro() {
			return isPro;
		},
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

function layer(id: string, order: number) {
	return { id, name: id, order, visible: true, locked: false };
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
		isPro = false;
	});

	it("caps a free account and leaves something to upsell", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: false });

		expect(layers.maxLayers).toBe(FREE_LAYER_LIMIT);
		while (layers.canAddLayer) layers.addLayer();

		expect(layers.layers).toHaveLength(FREE_LAYER_LIMIT);
		expect(layers.addLayer()).toBeNull();
		// Out of layers because of the TIER, so the button offers Pro rather
		// than sitting dead.
		expect(layers.atTierLimit).toBe(true);
	});

	it("gives Pro the hard cap, where there is nothing left to sell", () => {
		isPro = true;
		const layers = useLayersStore();
		layers.init({ isLobby: false });

		expect(layers.maxLayers).toBe(MAX_SOLO_LAYERS);
		while (layers.canAddLayer) layers.addLayer();

		expect(layers.layers).toHaveLength(MAX_SOLO_LAYERS);
		expect(layers.addLayer()).toBeNull();
		expect(layers.atTierLimit).toBe(false);
	});

	it("never drops layers a lapsed subscriber already made", () => {
		const layers = useLayersStore();
		const persisted = Array.from({ length: MAX_SOLO_LAYERS }, (_, i) => ({
			id: `l${i}`,
			name: `Layer ${i}`,
			order: i,
			visible: true,
			locked: false,
		}));

		isPro = false;
		layers.init({ isLobby: false, persisted });

		// Their work opens intact; only CREATING more is gated.
		expect(layers.layers).toHaveLength(MAX_SOLO_LAYERS);
		expect(layers.canAddLayer).toBe(false);
	});

	it("moves the live selection to the active layer", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: true });
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
		layers.init({ isLobby: true, isPublicLobby: true });
		const stale = object("stale", "l0");
		activeObjects = [stale]; // never added to sceneObjects
		sceneObjects = [];

		expect(layers.moveSelectionToLayer("l1")).toBe(0);

		expect(stale.layerId).toBe("l0");
		expect(fired).toHaveLength(0);
	});

	it("gives a PUBLIC lobby the fixed set and refuses structural edits", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: true });

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

	it("gives a PRIVATE room the editable, replicated document", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: false });

		expect(layers.canEditStructure).toBe(true);
		expect(layers.shared).toBe(true);

		const id = layers.addLayer("Ink");
		expect(id).toBeTruthy();
		// A local structural edit replicates; the sync engine listens for this.
		const op = fired.find((f) => f.name === "layerDocumentChanged");
		expect(op.payload.op.kind).toBe("add");
		expect(op.payload.op.layer.id).toBe(id);
	});

	it("does not replicate anything when drawing solo", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: false });
		expect(layers.shared).toBe(false);

		layers.addLayer("Ink");

		expect(
			fired.find((f) => f.name === "layerDocumentChanged"),
		).toBeUndefined();
	});

	it("converges on the same stack whichever order ops arrive in", () => {
		// The whole reason the ops carry absolute keys instead of indices: a
		// replayed backlog and a live stream must land on the same document.
		const forward = useLayersStore();
		forward.init({ isLobby: true, isPublicLobby: false });
		const a: any = { kind: "add", layer: layer("a", 1), at: 10, by: "p1" };
		const b: any = { kind: "add", layer: layer("b", 0.5), at: 11, by: "p2" };
		const r: any = { kind: "reorder", id: "a", order: 0.25, at: 12, by: "p2" };
		forward.applyRemoteOp(a);
		forward.applyRemoteOp(b);
		forward.applyRemoteOp(r);
		const forwardIds = forward.layers.map((l) => l.id);

		setActivePinia(createPinia());
		resetLayerRegistry();
		const shuffled = useLayersStore();
		shuffled.init({ isLobby: true, isPublicLobby: false });
		shuffled.applyRemoteOp(b);
		shuffled.applyRemoteOp(a);
		shuffled.applyRemoteOp(r);

		expect(shuffled.layers.map((l) => l.id)).toEqual(forwardIds);
		expect(forwardIds).toEqual([BASE_LAYER_ID, "a", "b"]);
	});

	it("lets a delete win over an op that was already in flight", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: false });
		layers.applyRemoteOp({
			kind: "add",
			layer: layer("doomed", 1),
			at: 1,
			by: "p1",
		} as any);
		layers.applyRemoteOp({ kind: "remove", id: "doomed", at: 2, by: "p1" });

		// A rename authored before the delete landed must not resurrect it.
		layers.applyRemoteOp({
			kind: "rename",
			id: "doomed",
			name: "back?",
			at: 3,
			by: "p2",
		});

		expect(layers.layers.map((l) => l.id)).toEqual([BASE_LAYER_ID]);
	});

	it("resolves a concurrent rename the same way on every peer", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: false });
		layers.applyRemoteOp({
			kind: "add",
			layer: layer("x", 1),
			at: 1,
			by: "p1",
		} as any);

		// Identical clocks: the higher author id wins, deterministically.
		layers.applyRemoteOp({
			kind: "rename",
			id: "x",
			name: "A",
			at: 5,
			by: "p1",
		});
		layers.applyRemoteOp({
			kind: "rename",
			id: "x",
			name: "B",
			at: 5,
			by: "p2",
		});
		expect(layers.layers.find((l) => l.id === "x")?.name).toBe("B");

		// And a straggler from the loser never wins later.
		layers.applyRemoteOp({
			kind: "rename",
			id: "x",
			name: "A",
			at: 5,
			by: "p1",
		});
		expect(layers.layers.find((l) => l.id === "x")?.name).toBe("B");
	});

	it("keeps the room layer set out of the persisted document", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: true });
		expect(layers.serialize()).toBeUndefined();

		layers.init({ isLobby: false });
		expect(layers.serialize()).toEqual([
			{
				id: BASE_LAYER_ID,
				name: "Layer 1",
				order: 0,
				visible: true,
				locked: false,
			},
		]);
	});

	it("restores persisted layers but never a hidden or locked state", () => {
		const layers = useLayersStore();
		layers.init({
			isLobby: false,
			persisted: [
				{ id: "a", name: "Sky", order: 0, visible: false, locked: true },
				{
					id: "a",
					name: "duplicate id",
					order: 5,
					visible: true,
					locked: false,
				},
				{ id: "b", name: "Ground", order: 1, visible: true, locked: false },
			] as any,
		});
		expect(layers.layers).toEqual([
			{ id: "a", name: "Sky", order: 0, visible: true, locked: false },
			{ id: "b", name: "Ground", order: 1, visible: true, locked: false },
		]);
	});

	it("promotes an existing solo document into private-room replication without resetting it", () => {
		const layers = useLayersStore();
		layers.init({
			isLobby: false,
			persisted: [layer("ink", 0), layer("details", 1)],
		});
		layers.setActive("details");

		layers.adoptCurrentDocumentForRoom(false);

		expect(layers.policy).toBe("mutable");
		expect(layers.shared).toBe(true);
		expect(layers.activeId).toBe("details");
		expect(layers.layers.map((item) => item.id)).toEqual(["ink", "details"]);

		layers.renameLayer("details", "Highlights");
		expect(fired.at(-1)).toMatchObject({
			name: "layerDocumentChanged",
			payload: { op: { kind: "rename", id: "details", name: "Highlights" } },
		});
	});

	it("keeps the hidden layer active", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: true });
		layers.setActive("l2");
		expect(activeLayerId()).toBe("l2");

		layers.setVisible("l2", false);

		expect(isLayerHidden("l2")).toBe(true);
		expect(layers.activeId).toBe("l2");
		expect(activeLayerId()).toBe(layers.activeId);
		// Bounded invalidation: the hidden layer's own footprint, not the board.
		expect(invalidated).toEqual(["l2"]);
	});

	it("allows a hidden layer to become active without changing visibility", () => {
		const layers = useLayersStore();
		layers.init({ isLobby: true, isPublicLobby: true });
		layers.setVisible("l2", false);
		invalidated.length = 0;

		layers.setActive("l2");

		expect(layers.activeId).toBe("l2");
		expect(layers.layers.find((layer) => layer.id === "l2")?.visible).toBe(
			false,
		);
		expect(isLayerHidden("l2")).toBe(true);
		expect(invalidated).toEqual([]);
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

		layers.applyAddLayer({
			id: middle,
			name: "Middle",
			order: 1,
			visible: true,
			locked: false,
		});
		expect(getLayers().map((l) => l.id)).toEqual([BASE_LAYER_ID, middle, top]);
		// Re-inserting BELOW an existing layer restacks the board.
		expect(invalidated.at(-1)).toBeNull();
	});
});
