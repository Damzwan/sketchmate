import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { v4 as uuidv4 } from "uuid";
import type { FabricObject } from "fabric";
import {
	BASE_LAYER_ID,
	createLayer,
	defaultSoloLayers,
	type DrawLayer,
	FIXED_ROOM_LAYERS,
	type LayerPolicy,
	MAX_SOLO_LAYERS,
} from "@/draw/layers/layer.types";
import {
	activeLayerId as registryActiveLayerId,
	setActiveLayerId,
	setLayerSet,
	syncLayerFlags,
} from "@/draw/layers/layerRegistry";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useCanvasController } from "@/draw/canvas/canvasController";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { HistoryEvent } from "@/draw/history/history.types";

/**
 * Layer document + view state.
 *
 * Mutation and reactivity live here; the render/hit-test hot paths read the
 * plain `layerRegistry` module instead, so no pinia proxy is touched per frame.
 *
 * Two policies (see layer.types.ts):
 *   solo  → the layer list is part of the DOCUMENT: persisted in the draft JSON
 *           and structural edits go on the undo stack.
 *   room  → the layer list is a CONSTANT every peer derives locally, so nothing
 *           about layers is ever sent, replayed or reconciled.
 *
 * Visibility and lock are LOCAL VIEW STATE in both modes: not persisted, not
 * synced, not undoable. Hiding a layer is how you look at your drawing, not an
 * edit to it.
 */
export const useLayersStore = defineStore("drawLayers", () => {
	const layers = ref<DrawLayer[]>(defaultSoloLayers());
	const activeId = ref<string>(BASE_LAYER_ID);
	const policy = ref<LayerPolicy>("mutable");

	/** Lightest possible canvas handle: pulling in `draw.store` here would close
	 *  an import cycle (draw.store → document.store → serialization → us).
	 *  `useCanvasController` is a real singleton — it was a factory handing every
	 *  caller but the first a controller with a null canvas, which is why every
	 *  layer operation that needed the canvas silently did nothing. */
	const getCanvas = () => useCanvasController().getCanvas();

	const canEditStructure = computed(() => policy.value === "mutable");
	const canAddLayer = computed(
		() => canEditStructure.value && layers.value.length < MAX_SOLO_LAYERS,
	);
	const canDeleteLayer = computed(
		() => canEditStructure.value && layers.value.length > 1,
	);
	const activeLayer = computed(
		() => layers.value.find((l) => l.id === activeId.value) ?? layers.value[0],
	);

	/** Push the whole set down to the engine-facing registry. */
	function commitLayout() {
		setLayerSet(layers.value, policy.value);
		setActiveLayerId(activeId.value);
		activeId.value = registryActiveLayerId();
	}

	function commitFlags() {
		syncLayerFlags(layers.value);
	}

	// ── lifecycle ────────────────────────────────────────────────────────────

	/**
	 * Called once per canvas init. `persisted` is `json.layers` from the draft;
	 * absent (every drawing made before this feature) → one base layer, and the
	 * objects that carry no `layerId` land on it by definition.
	 */
	function init(options: { isLobby: boolean; persisted?: DrawLayer[] | null }) {
		if (options.isLobby) {
			policy.value = "fixed";
			layers.value = FIXED_ROOM_LAYERS.map((l) => ({ ...l }));
		} else {
			policy.value = "mutable";
			layers.value = sanitizePersisted(options.persisted);
		}
		activeId.value = layers.value[0].id;
		commitLayout();
	}

	function sanitizePersisted(persisted?: DrawLayer[] | null): DrawLayer[] {
		if (!Array.isArray(persisted) || persisted.length === 0) {
			return defaultSoloLayers();
		}
		const seen = new Set<string>();
		const out: DrawLayer[] = [];
		for (const raw of persisted.slice(0, MAX_SOLO_LAYERS)) {
			const id = typeof raw?.id === "string" ? raw.id : "";
			if (!id || seen.has(id)) continue;
			seen.add(id);
			out.push({
				id,
				name: typeof raw.name === "string" ? raw.name : "Layer",
				// Visibility/lock are view state and deliberately NOT restored: a
				// drawing must never open with content silently missing.
				visible: true,
				locked: false,
			});
		}
		return out.length ? out : defaultSoloLayers();
	}

	/** What `generateChunkedJSON` writes into the draft. */
	function serialize(): DrawLayer[] | undefined {
		if (policy.value !== "mutable") return undefined;
		return layers.value.map((l) => ({
			id: l.id,
			name: l.name,
			visible: true,
			locked: false,
		}));
	}

	// ── view state (local, never synced, never undoable) ──────────────────────

	function setActive(id: string) {
		const layer = layers.value.find((l) => l.id === id);
		if (!layer || layer.locked) return;
		if (activeId.value === id) return;
		activeId.value = id;
		setActiveLayerId(id);
		// The selection is deliberately KEPT. Discarding it here (so it could not
		// outlive the layer that can re-pick it) broke the one flow that needs it:
		// select something, open the sheet, choose the destination layer, move it.
		// By the time "move" was tapped there was nothing selected. A selection
		// that survives a layer switch is far less surprising than one that
		// silently disappears while the sheet is open.
	}

	function setVisible(id: string, visible: boolean) {
		const layer = layers.value.find((l) => l.id === id);
		if (!layer || layer.visible === visible) return;
		layer.visible = visible;
		commitFlags();
		// Drawing into a layer you cannot see produces invisible strokes and a
		// bug report. Move the cursor to the nearest usable layer instead.
		if (!visible && activeId.value === id) {
			const fallback = layers.value.find((l) => l.visible && !l.locked);
			if (fallback) setActive(fallback.id);
		}
		useDrawObjectManager().invalidateLayer(id);
	}

	function setLocked(id: string, locked: boolean) {
		const layer = layers.value.find((l) => l.id === id);
		if (!layer || layer.locked === locked) return;
		layer.locked = locked;
		commitFlags();
		// Lock changes hit-testing only — no pixels move, so nothing to repaint.
		if (locked && activeId.value === id) {
			const fallback = layers.value.find((l) => l.visible && !l.locked);
			if (fallback) setActive(fallback.id);
		}
	}

	// ── structural edits (solo only, undoable) ───────────────────────────────

	function addLayer(name?: string): string | null {
		if (!canAddLayer.value) return null;
		const layer = createLayer(
			uuidv4(),
			name ?? `Layer ${layers.value.length + 1}`,
		);
		applyAddLayer(layer, layers.value.length);
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerAdded,
			params: { layer: { ...layer }, index: layers.value.length - 1 },
		});
		setActive(layer.id);
		return layer.id;
	}

	function applyAddLayer(layer: DrawLayer, index: number) {
		layers.value.splice(index, 0, { ...layer });
		commitLayout();
		// A new EMPTY layer changes stacking for nothing that exists yet, so no
		// invalidation — the first stroke on it invalidates through the normal add
		// seam. Inserting BELOW existing layers is the exception.
		if (index < layers.value.length - 1) {
			useDrawObjectManager().invalidateLayer(null);
		}
	}

	function applyRemoveLayer(id: string) {
		const index = layers.value.findIndex((l) => l.id === id);
		if (index === -1) return;
		layers.value.splice(index, 1);
		if (layers.value.length === 0) layers.value = defaultSoloLayers();
		commitLayout();
	}

	/**
	 * Deleting a layer deletes its contents. The objects go through the normal
	 * canvas removal path (so the tile cache, quadtree, worker mirror and sync
	 * all learn about it through the seams they already listen to) inside one
	 * batch, and ONE history entry restores both the layer and its objects.
	 */
	function deleteLayer(id: string): boolean {
		if (!canDeleteLayer.value) return false;
		const index = layers.value.findIndex((l) => l.id === id);
		if (index === -1) return false;
		const layer = { ...layers.value[index] };

		const manager = useDrawObjectManager();
		const canvas = getCanvas();
		const objects = manager
			.objectIdsOnLayer(id)
			.map((objectId) => manager.getObjectById(objectId))
			.filter(Boolean) as FabricObject[];

		// Same contract as a normal delete (objectActions): record each object's
		// stack position so undo puts it back where it was instead of on top.
		// `insertedIndex` is a customProperty, so the deferred serialization below
		// picks it up.
		if (canvas) {
			const stack = canvas.getObjects();
			for (const obj of objects)
				(obj as any).insertedIndex = stack.indexOf(obj);
		}

		const history = useDrawHistoryManager();
		// Deferred exactly like a wide erase: serializing every object of a big
		// layer in the tap frame is a guaranteed hitch on a low-end phone, for an
		// entry most deletions never undo. The objects are off-canvas afterwards
		// and never mutate, so a later serialization is identical.
		const params: any = { layer, index };
		history.defineLazyJSON(params, "objectsJSON", objects);

		if (objects.length) {
			manager.beginBatch();
			try {
				console.log(canvas, objects);
				canvas?.remove(...objects);
			} finally {
				manager.endBatch();
			}
		}
		applyRemoveLayer(id);

		const action: any = { type: HistoryEvent.LayerDeleted, params };
		// Precomputed so the stack-trim weigher never reads the lazy param.
		action.__w = objects.length + 1;
		history.addToUndoStackWithResetRedo(action);
		return true;
	}

	function renameLayer(id: string, name: string) {
		const layer = layers.value.find((l) => l.id === id);
		if (!layer || !canEditStructure.value) return;
		const previousName = layer.name;
		if (previousName === name) return;
		layer.name = name;
		commitFlags();
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerRenamed,
			params: { layerId: id, previousName, name },
		});
	}

	function applyRename(id: string, name: string) {
		const layer = layers.value.find((l) => l.id === id);
		if (!layer) return;
		layer.name = name;
		commitFlags();
	}

	function moveLayer(from: number, to: number) {
		if (!canEditStructure.value) return;
		if (from === to) return;
		applyMoveLayer(from, to);
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerReordered,
			params: { from, to },
		});
	}

	function applyMoveLayer(from: number, to: number) {
		const list = layers.value;
		if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
		const [moved] = list.splice(from, 1);
		list.splice(to, 0, moved);
		commitLayout();
		// Reordering changes stacking across the whole board — the one layer
		// operation that genuinely costs the full cache.
		useDrawObjectManager().invalidateLayer(null);
	}

	// ── moving objects between layers (both policies) ────────────────────────

	/**
	 * Rides the existing `objectStyleChanged` event, which already means "these
	 * objects' properties changed": history records it, the sync engine emits an
	 * `ObjectStyleChanged` action, and the manager repaints their footprint.
	 *
	 * That is deliberate. A dedicated sync event would be a new `action.type` on
	 * a wire whose consumers look the type up in a map with no fallback — an old
	 * peer would throw on it. `{ layerId }` inside a style patch is a prop an old
	 * client sets and ignores.
	 */
	function moveObjectsToLayer(
		selection: FabricObject[],
		layerId: string,
	): number {
		const target = layers.value.find((l) => l.id === layerId);
		if (!target) return 0;
		const canvas = getCanvas();
		if (!canvas) return 0;

		// A selection can outlive the objects in it (deleted, erased away, undone
		// while the sheet sat open). Anything no longer in the scene is dropped
		// rather than mutated into a detached object nothing will ever render.
		const manager = useDrawObjectManager();
		const objects = selection.filter(
			(object) => !!object.id && !!manager.getObjectById(object.id),
		);
		if (!objects.length) return 0;

		const prevStyles = objects.map((obj) => ({
			layerId: (obj as any).layerId ?? BASE_LAYER_ID,
		}));
		if (prevStyles.every((s) => s.layerId === layerId)) return 0;

		for (const obj of objects) (obj as any).layerId = layerId;
		useDrawObjectManager().markZIndexDirty();

		canvas.fire("objectStyleChanged" as any, {
			target: objects,
			prevStyles,
			style: { layerId },
		});
		return objects.length;
	}

	/** Move whatever the canvas currently has selected. @returns objects moved. */
	function moveSelectionToLayer(layerId: string): number {
		const canvas = getCanvas();
		if (!canvas) return 0;
		const selection = (canvas.getActiveObjects?.() ?? []) as FabricObject[];
		const moved = moveObjectsToLayer(selection, layerId);
		if (moved > 0) {
			canvas.discardActiveObject();
			canvas.requestRenderAll();
		}
		return moved;
	}

	function objectCount(id: string): number {
		return useDrawObjectManager().objectIdsOnLayer(id).length;
	}

	function reset() {
		layers.value = defaultSoloLayers();
		activeId.value = BASE_LAYER_ID;
		policy.value = "mutable";
		commitLayout();
	}

	return {
		layers,
		activeId,
		activeLayer,
		policy,
		canEditStructure,
		canAddLayer,
		canDeleteLayer,
		init,
		serialize,
		setActive,
		setVisible,
		setLocked,
		addLayer,
		deleteLayer,
		renameLayer,
		moveLayer,
		moveObjectsToLayer,
		moveSelectionToLayer,
		objectCount,
		reset,
		// history-facing appliers (no recording, no redo-stack reset)
		applyAddLayer,
		applyRemoveLayer,
		applyRename,
		applyMoveLayer,
	};
});
