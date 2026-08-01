import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { v4 as uuidv4 } from "uuid";
import type { FabricObject } from "fabric";
import {
	BASE_LAYER_ID,
	byLayerOrder,
	createLayer,
	defaultSoloLayers,
	type DrawLayer,
	FIXED_ROOM_LAYERS,
	type LayerOp,
	type LayerPolicy,
	FREE_LAYER_LIMIT,
	MAX_LAYER_NAME,
	MAX_SOLO_LAYERS,
	orderBetween,
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
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store";

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
	/** Mutable AND in a room: every structural edit replicates to the peers. */
	const shared = ref(false);

	/**
	 * Last-writer bookkeeping, per layer id. Session-scoped, never persisted.
	 *
	 * `revisions` decides rename/reorder races; `tombstones` makes a delete win
	 * over any op that was already in flight for that layer, so a peer cannot
	 * resurrect a layer by renaming it a moment too late.
	 */
	const revisions = new Map<string, { at: number; by: string }>();
	const tombstones = new Set<string>();
	/** Set while applying a remote op, so applying it does not echo it back. */
	let applyingRemote = false;

	/** Lightest possible canvas handle: pulling in `draw.store` here would close
	 *  an import cycle (draw.store → document.store → serialization → us).
	 *  `useCanvasController` is a real singleton — it was a factory handing every
	 *  caller but the first a controller with a null canvas, which is why every
	 *  layer operation that needed the canvas silently did nothing. */
	const getCanvas = () => useCanvasController().getCanvas();

	const canEditStructure = computed(() => policy.value === "mutable");
	/** Free accounts create up to FREE_LAYER_LIMIT; Pro up to the hard cap. */
	const maxLayers = computed(() =>
		useSubscriptionStore().isPro ? MAX_SOLO_LAYERS : FREE_LAYER_LIMIT,
	);
	const canAddLayer = computed(
		() => canEditStructure.value && layers.value.length < maxLayers.value,
	);
	/**
	 * Out of layers because of the TIER, not the hard cap — the one case worth
	 * offering an upgrade for. At the hard cap there is nothing to sell.
	 */
	const atTierLimit = computed(
		() =>
			canEditStructure.value &&
			!canAddLayer.value &&
			layers.value.length < MAX_SOLO_LAYERS,
	);
	const canDeleteLayer = computed(
		() => canEditStructure.value && layers.value.length > 1,
	);
	const activeLayer = computed(
		() => layers.value.find((l) => l.id === activeId.value) ?? layers.value[0],
	);

	/** Push the whole set down to the engine-facing registry. */
	function commitLayout() {
		// Sort HERE, not only in the registry. The registry sorts its own copy, so
		// leaving this array in insertion order made the store (and therefore the
		// sheet) disagree with the render stack the moment an op arrived out of
		// order — which is the normal case for a replayed backlog.
		layers.value.sort(byLayerOrder);
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
	function init(options: {
		isLobby: boolean;
		isPublicLobby?: boolean;
		persisted?: DrawLayer[] | null;
	}) {
		revisions.clear();
		tombstones.clear();
		applyingRemote = false;

		// PUBLIC lobbies keep the fixed set: strangers must not be able to
		// restructure a shared board, and a constant set needs no replication at
		// all. A PRIVATE room is people who chose each other, so it gets the same
		// editable document as solo — replicated.
		if (options.isPublicLobby) {
			policy.value = "fixed";
			shared.value = false;
			layers.value = FIXED_ROOM_LAYERS.map((l) => ({ ...l }));
		} else {
			policy.value = "mutable";
			shared.value = !!options.isLobby;
			// A private room's document arrives with the canvas snapshot like any
			// other document state; an empty one starts from the default.
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
				// Documents written before ordering keys existed fall back to their
				// position in the array, which is exactly what they meant.
				order: typeof raw.order === "number" ? raw.order : out.length,
				// Visibility/lock are view state and deliberately NOT restored: a
				// drawing must never open with content silently missing.
				visible: true,
				locked: false,
			});
		}
		out.sort(byLayerOrder);
		return out.length ? out : defaultSoloLayers();
	}

	/** What `generateChunkedJSON` writes into the draft. */
	function serialize(): DrawLayer[] | undefined {
		// A fixed set is a constant every peer derives locally — persisting it
		// would just be a copy of a hard-coded array.
		if (policy.value !== "mutable") return undefined;
		return layers.value.map((l) => ({
			id: l.id,
			name: l.name,
			order: l.order,
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

	// ── the replicated op pipeline ───────────────────────────────────────────
	//
	// Every structural edit — local or remote, live or replayed from history —
	// is expressed as a LayerOp and applied through `applyOp`. One code path
	// means a peer's add can never behave differently from your own, and the
	// idempotence that makes replication safe is enforced in exactly one place.

	function stamp(): { at: number; by: string } {
		return { at: Date.now(), by: useAuthStore().user?._id ?? "local" };
	}

	/** Does this op supersede what we last applied to that layer? */
	function accepts(id: string, at: number, by: string): boolean {
		if (tombstones.has(id)) return false; // a delete is final
		const seen = revisions.get(id);
		if (!seen) return true;
		if (at !== seen.at) return at > seen.at;
		// Identical clocks: pick a winner every peer agrees on.
		return by > seen.by;
	}

	function note(id: string, at: number, by: string): void {
		revisions.set(id, { at, by });
	}

	/**
	 * @param origin `local` records history and replicates; `remote` and
	 *   `history` apply silently. A remote op that echoed back would loop, and a
	 *   history replay must not push a second entry onto the stack.
	 */
	function applyOp(
		op: LayerOp,
		origin: "local" | "remote" | "history",
	): boolean {
		const id = op.kind === "add" ? op.layer.id : op.id;
		if (origin !== "local" && !accepts(id, op.at, op.by)) return false;
		note(id, op.at, op.by);

		let restacked = false;
		switch (op.kind) {
			case "add": {
				if (layers.value.some((l) => l.id === op.layer.id)) return false;
				layers.value.push({ ...op.layer, visible: true, locked: false });
				// A new EMPTY layer restacks nothing that exists yet — the first
				// stroke on it invalidates through the normal add seam. One inserted
				// BELOW existing content is the exception.
				restacked = layers.value.some(
					(l) => l.id !== op.layer.id && l.order > op.layer.order,
				);
				break;
			}
			case "remove": {
				const index = layers.value.findIndex((l) => l.id === op.id);
				if (index === -1) return false;
				layers.value.splice(index, 1);
				tombstones.add(op.id);
				if (layers.value.length === 0) layers.value = defaultSoloLayers();
				break;
			}
			case "rename": {
				const layer = layers.value.find((l) => l.id === op.id);
				if (!layer) return false;
				layer.name = op.name;
				commitFlags();
				if (origin === "local") replicate(op);
				return true; // no restack, no relayout
			}
			case "reorder": {
				const layer = layers.value.find((l) => l.id === op.id);
				if (!layer || layer.order === op.order) return false;
				layer.order = op.order;
				restacked = true;
				break;
			}
		}

		commitLayout();
		// Reordering (or inserting underneath) changes stacking across the whole
		// board — the one layer operation that genuinely costs the full cache.
		if (restacked) useDrawObjectManager().invalidateLayer(null);
		if (origin === "local") replicate(op);
		return true;
	}

	/** Send a locally-authored op to the room. Solo and public lobbies: no-op. */
	function replicate(op: LayerOp): void {
		if (!shared.value || applyingRemote) return;
		const canvas = getCanvas();
		if (!canvas) return;
		// Fired on the canvas rather than emitted directly so the store keeps no
		// dependency on the sync engine — the same seam `objectStyleChanged` and
		// `objectsMerged` already use.
		canvas.fire("layerDocumentChanged" as any, { op });
	}

	/**
	 * A peer's op. Idempotent and order-independent by construction (see
	 * LayerOp), so this needs no queueing, no rebasing and no acknowledgement —
	 * a replayed backlog converges on the same document as a live stream.
	 */
	function applyRemoteOp(op: LayerOp): void {
		if (policy.value !== "mutable") return; // public lobby: not our document
		applyingRemote = true;
		try {
			applyOp(op, "remote");
		} finally {
			applyingRemote = false;
		}
	}

	// ── structural edits (undoable; replicated in a private room) ────────────

	function addLayer(name?: string): string | null {
		if (!canAddLayer.value) return null;
		const top = layers.value[layers.value.length - 1];
		const layer = createLayer(
			uuidv4(),
			name ?? `Layer ${layers.value.length + 1}`,
			orderBetween(top?.order, undefined),
		);
		const op: LayerOp = { kind: "add", layer: { ...layer }, ...stamp() };
		if (!applyOp(op, "local")) return null;
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerAdded,
			params: { layer: { ...layer } },
		});
		setActive(layer.id);
		return layer.id;
	}

	/** History-facing: re-apply an add without recording it again. */
	function applyAddLayer(layer: DrawLayer) {
		tombstones.delete(layer.id); // an undo legitimately revives it
		applyOp({ kind: "add", layer, ...stamp() }, "local");
	}

	function applyRemoveLayer(id: string) {
		applyOp({ kind: "remove", id, ...stamp() }, "local");
	}

	/**
	 * Deleting a layer deletes its contents. The objects go through the normal
	 * canvas removal path (so the tile cache, quadtree, worker mirror and sync
	 * all learn about it through the seams they already listen to) inside one
	 * batch, and ONE history entry restores both the layer and its objects.
	 */
	function deleteLayer(id: string): boolean {
		if (!canDeleteLayer.value) return false;
		const existing = layers.value.find((l) => l.id === id);
		if (!existing) return false;
		const layer = { ...existing };

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
		const params: any = { layer };
		history.defineLazyJSON(params, "objectsJSON", objects);

		if (objects.length) {
			manager.beginBatch();
			try {
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
		const next = name.slice(0, MAX_LAYER_NAME);
		if (!next || previousName === next) return;
		if (!applyOp({ kind: "rename", id, name: next, ...stamp() }, "local"))
			return;
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerRenamed,
			params: { layerId: id, previousName, name: next },
		});
	}

	function applyRename(id: string, name: string) {
		applyOp({ kind: "rename", id, name, ...stamp() }, "local");
	}

	/**
	 * Reorder by POSITION at the UI edge, by fractional key on the wire.
	 *
	 * The sheet naturally speaks in positions, but an index means different
	 * things to different peers once anything else has been replayed. Resolving
	 * it to an absolute key here — before the op exists — is what keeps
	 * concurrent reorders convergent.
	 */
	function moveLayer(from: number, to: number) {
		if (!canEditStructure.value || from === to) return;
		const list = layers.value;
		if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
		const moved = list[from];
		const previousOrder = moved.order;
		const without = list.filter((l) => l.id !== moved.id);
		const order = orderBetween(without[to - 1]?.order, without[to]?.order);
		if (!applyOp({ kind: "reorder", id: moved.id, order, ...stamp() }, "local"))
			return;
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerReordered,
			params: { layerId: moved.id, previousOrder, order },
		});
	}

	function applyReorder(id: string, order: number) {
		applyOp({ kind: "reorder", id, order, ...stamp() }, "local");
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
		maxLayers,
		atTierLimit,
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
		applyRemoteOp,
		shared,
		objectCount,
		reset,
		// history-facing appliers (no recording, no redo-stack reset)
		applyAddLayer,
		applyRemoveLayer,
		applyRename,
		applyReorder,
	};
});
