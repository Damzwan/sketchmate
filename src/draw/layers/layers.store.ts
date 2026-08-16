import type { FabricObject } from "fabric";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useCanvasController } from "@/draw/canvas/canvasController";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { stackPositions } from "@/draw/canvas/objectStack";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { HistoryEvent } from "@/draw/history/history.types";
import {
	BASE_LAYER_ID,
	byLayerOrder,
	clampLayerOpacity,
	createLayer,
	type DrawLayer,
	defaultSoloLayers,
	FIXED_ROOM_LAYERS,
	FREE_LAYER_LIMIT,
	type LayerOp,
	type LayerPolicy,
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
import { toJSON } from "@/draw/objects/objectSerialization";
import { bakerySyncLayerOpacity } from "@/draw/rendering/bakery/tileBakeryClient";
import { drawBakePressure } from "@/draw/rendering/renderMetrics";
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { uuidv4 } from "@/utils/uuid";

/**
 * Layer document + view state.
 *
 * Mutation and reactivity live here; the render/hit-test hot paths read the
 * plain `layerRegistry` module instead, so no pinia proxy is touched per frame.
 *
 * Two policies (see layer.types.ts):
 *   mutable → solo documents persist the list; private rooms additionally
 *             replicate structural edits between peers.
 *   fixed   → public rooms derive the same constant list locally.
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
	/**
	 * Opacity is artwork, not view state: it replicates and it is undoable. In a
	 * public lobby the layer set is not our document (`fixed` policy), so fading
	 * one would silently restyle everyone else's drawing. Same distinction as
	 * `canEditStructure`, named separately because opacity is a property of a
	 * layer rather than the shape of the layer list.
	 */
	const canSetOpacity = computed(() => canEditStructure.value);
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

	/**
	 * Turn the CURRENT, already-open drawing into the creator's room document.
	 *
	 * Joiners go through `loadCanvas(...isLobby)` and therefore call `init` with
	 * the snapshot's layers. A creator starts with its existing canvas and gets no
	 * initial snapshot, so calling `init` would either lose the current document
	 * or never enable replication. Private rooms preserve the exact current list
	 * and only flip the sharing bit; public rooms intentionally adopt the fixed
	 * policy every peer derives.
	 */
	function adoptCurrentDocumentForRoom(isPublicLobby: boolean): void {
		revisions.clear();
		tombstones.clear();
		applyingRemote = false;
		if (isPublicLobby) {
			policy.value = "fixed";
			shared.value = false;
			layers.value = FIXED_ROOM_LAYERS.map((layer) => ({ ...layer }));
			activeId.value = layers.value[0].id;
		} else {
			policy.value = "mutable";
			shared.value = true;
			// Preserve the creator's local visibility/lock choices as local view
			// state. serialize() strips them for peers exactly as on a normal save.
			if (!layers.value.length) layers.value = defaultSoloLayers();
			if (!layers.value.some((layer) => layer.id === activeId.value))
				activeId.value = layers.value[0].id;
		}
		commitLayout();
	}

	/**
	 * A PRIVATE-room joiner, before (or without) a canvas snapshot.
	 *
	 * The document itself arrives with the snapshot and `init` installs it. But a
	 * joiner is not always served a snapshot: when the room has none cached yet
	 * the server replays the action buffer as `missed-actions` instead, and that
	 * path loads no canvas, so `init` never runs a second time and `shared` stays
	 * at its solo value — every structural edit this peer makes would then be
	 * dropped by `replicate` and the peers would silently diverge.
	 *
	 * So flip only the sharing bit, and leave the list, the active layer and the
	 * revision bookkeeping untouched: a snapshot arriving later must still be the
	 * thing that decides what the document IS.
	 */
	function markRoomShared(): void {
		policy.value = "mutable";
		shared.value = true;
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
				// Opacity IS restored — it is part of the artwork, not of how you
				// were looking at it. Documents written before it existed have no
				// field and clamp to a fully opaque layer.
				opacity: clampLayerOpacity(raw.opacity),
			});
		}
		out.sort(byLayerOrder);
		return out.length ? out : defaultSoloLayers();
	}

	/** What document and private-room snapshots persist. */
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
			opacity: clampLayerOpacity(l.opacity),
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
		useDrawObjectManager().invalidateLayer(id);
	}

	/**
	 * Layer opacity. Undoable and replicated, unlike visibility and lock, because
	 * it changes the artwork rather than the view of it (see `DrawLayer.opacity`).
	 *
	 * `record` exists for the slider: a drag emits a value per frame, and one
	 * undo entry per frame would bury the stack. The UI passes `false` while
	 * dragging and `true` once on release, so one gesture is one undo step.
	 */
	function setOpacity(id: string, opacity: number) {
		if (!canSetOpacity.value) return;
		const layer = layers.value.find((l) => l.id === id);
		if (!layer) return;
		const next = clampLayerOpacity(opacity);
		if (layer.opacity === next) return;
		applyOp({ kind: "opacity", id, opacity: next, ...stamp() }, "local");
	}

	/**
	 * End of an opacity gesture: apply the final value and record ONE undo step
	 * covering the whole drag.
	 *
	 * `previousOpacity` is passed in rather than read from the layer because by
	 * the time this runs the layer already holds an intermediate value from the
	 * live drag — recording against that would make undo step back one slider
	 * frame instead of to where the gesture started.
	 */
	function commitOpacity(id: string, previousOpacity: number, opacity: number) {
		if (!canSetOpacity.value) return;
		const from = clampLayerOpacity(previousOpacity);
		const to = clampLayerOpacity(opacity);
		setOpacity(id, to);
		if (from === to) return;
		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerOpacityChanged,
			params: { layerId: id, previousOpacity: from, opacity: to },
		});
	}

	/**
	 * History-facing applier. `"local"` rather than `"history"` deliberately, and
	 * for the same reason `applyRename` does it: an undo has to reach the other
	 * peers in a private room, or their copy silently diverges from yours.
	 */
	function applyOpacity(id: string, opacity: number) {
		applyOp({ kind: "opacity", id, opacity, ...stamp() }, "local");
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
			case "opacity": {
				const layer = layers.value.find((l) => l.id === op.id);
				const next = clampLayerOpacity(op.opacity);
				if (!layer || layer.opacity === next) return false;
				layer.opacity = next;
				commitFlags();
				// The worker keeps its own copy of the fade map (it has no registry).
				// No-op while the bakery is off, which is the production default.
				bakerySyncLayerOpacity();
				// Only this layer's own footprint changed — the stack is untouched,
				// so this is the cheap targeted invalidation, not the full-cache one.
				useDrawObjectManager().invalidateLayer(op.id);
				if (origin === "local") replicate(op);
				return true; // no restack, no relayout
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
			const positions = stackPositions(canvas);
			for (const obj of objects)
				(obj as any).insertedIndex = positions.get(obj) ?? -1;
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

	/** A flatten is only worth its cost — and only worth its loss of editability
	 *  — once a layer holds real object count. */
	const MIN_FLATTEN_OBJECTS = 2;

	// ── "this layer is getting heavy" hint ──────────────────────────────────
	//
	// Deliberately hard to trigger. Flatten is lossy, and the drawing worth
	// nudging about is the one the user cares most about — a hint that fires on a
	// healthy scene teaches them to ignore the badge, and a hint that talks
	// someone into rasterizing art they wanted to keep editable is worse than no
	// hint at all. So: MEASURED cost, never a raw object count.
	//
	// A count alone is meaningless across devices; 600 objects is nothing on a
	// desktop and painful on a cheap Android. The bake counters say what this
	// device is actually paying — and because they are a MEASUREMENT, they need
	// no device-class probe to adapt: the same threshold trips readily on a slow
	// phone and almost never on a desktop, which is the whole point.
	const HEAVY_LAYER_OBJECTS = 150;
	const HEAVY_BAKE_MS_MEAN = 28;
	const HEAVY_BAKE_OBJECTS_MAX = 120;
	/** Layers already hinted this session. One nudge per layer: opening the sheet
	 *  and not flattening IS an answer. Session-scoped on purpose — nothing about
	 *  a transient tip belongs in the saved document. */
	const hintedLayerIds = new Set<string>();
	const heavyLayerIds = ref<string[]>([]);

	/** True when the engine is measurably struggling, whatever the scene size. */
	function underBakePressure(): boolean {
		const { bakeMsMean, bakeObjectsMax } = drawBakePressure();
		return (
			bakeMsMean > HEAVY_BAKE_MS_MEAN || bakeObjectsMax > HEAVY_BAKE_OBJECTS_MAX
		);
	}

	/**
	 * Recompute which layers are worth hinting about. Cheap enough to call on a
	 * slow timer, and it short-circuits before touching the index when the engine
	 * is keeping up — which is the common case and the one that must stay free.
	 */
	function refreshHeavyLayers(): void {
		if (!canEditStructure.value || !underBakePressure()) {
			if (heavyLayerIds.value.length) heavyLayerIds.value = [];
			return;
		}
		const next: string[] = [];
		for (const layer of layers.value) {
			if (hintedLayerIds.has(layer.id)) continue;
			if (objectCount(layer.id) >= HEAVY_LAYER_OBJECTS) next.push(layer.id);
		}
		heavyLayerIds.value = next;
	}

	/** Called when the user has SEEN the hint for a layer (opened the sheet). */
	function acknowledgeHeavyLayers(): void {
		for (const id of heavyLayerIds.value) hintedLayerIds.add(id);
	}

	/**
	 * Solo and PRIVATE rooms. Not public lobbies: those run the `fixed` policy,
	 * where the layer set is a constant everyone derives locally and the drawing
	 * is a free-for-all — replacing a shared layer with one user's raster there
	 * destroys other people's work with no way to attribute or refuse it.
	 * `canEditStructure` is already exactly that distinction.
	 */
	const canFlattenLayer = (id: string): boolean =>
		canEditStructure.value && objectCount(id) >= MIN_FLATTEN_OBJECTS;

	/**
	 * Replace every object on a layer with ONE image of them.
	 *
	 * This is the escape hatch for a layer that has become expensive: N objects
	 * each carry index entries, z-order, serialization on every save and a bake
	 * pass; one image carries one of each. Finished background/lineart layers pay
	 * that cost forever for content the user is done editing.
	 *
	 * In a private room this replicates as the two primitives the peers already
	 * understand — a bulk delete and an add — while recording ONE local history
	 * entry (`skipHistory` keeps the re-dispatch from writing a second one). Undo
	 * and redo then replicate for free: `handleUndo` ships the whole
	 * HistoryAction, and every peer runs the same LayerFlattened handler against
	 * the payload it carries.
	 *
	 * Undoable as a single entry; both the originals and the raster are recorded
	 * so undo restores the exact strokes and redo restores the exact image.
	 */
	async function flattenLayer(id: string): Promise<boolean> {
		if (!canFlattenLayer(id)) return false;
		const canvas = getCanvas();
		if (!canvas) return false;

		const manager = useDrawObjectManager();
		const objects = manager
			.objectIdsOnLayer(id)
			.map((objectId) => manager.getObjectById(objectId))
			.filter(Boolean) as FabricObject[];
		if (objects.length < MIN_FLATTEN_OBJECTS) return false;

		// Same contract as delete: record each object's stack position so undo puts
		// it back where it was rather than on top of everything.
		const positions = stackPositions(canvas);
		let lowestIndex = positions.size;
		for (const obj of objects) {
			const index = positions.get(obj) ?? -1;
			(obj as any).insertedIndex = index;
			if (index >= 0) lowestIndex = Math.min(lowestIndex, index);
		}

		// Serialize BEFORE the raster: these are the undo payload, and they must be
		// captured while the objects are still on the canvas.
		const objectsJSON = toJSON(objects);

		// Loaded on demand: the rasterizer pulls in the whole export pipeline, which
		// nothing else in this store needs and which most sessions never flatten.
		const {
			FLATTENED_LAYER_MAX_DIMENSION,
			FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION,
			rasterizeObjectsToImages,
		} = await import("@/draw/objects/savedObjectFlatten");
		// A room raster crosses the wire on the add AND again inside every undo /
		// redo of it, so it takes the room budget AND stays a single tile.
		const images = await rasterizeObjectsToImages(objects, {
			userId: useAuthStore().user?._id,
			maxDimension: shared.value
				? FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION
				: FLATTENED_LAYER_MAX_DIMENSION,
		});
		if (!images.length) return false;
		for (const image of images) {
			(image as any).layerId = id;
			(image as any).insertedIndex = lowestIndex;
		}

		// Events suppressed: a bare `canvas.add` fires `object:added`, which history
		// records as its own entry and the sync engine emits on its own terms. This
		// operation owns both — one history entry below, and one explicit
		// re-dispatch for the peers. The object manager's handlers are PERMANENT and
		// keep running, so the index, bakery mirror and invalidation are unaffected.
		await useDrawEventManager().actionWithoutEvents(async () => {
			manager.beginBatch();
			try {
				canvas.remove(...objects);
				canvas.add(...images);
			} finally {
				manager.endBatch();
			}
		});

		useDrawHistoryManager().addToUndoStackWithResetRedo({
			type: HistoryEvent.LayerFlattened,
			params: { layerId: id, objectsJSON, imagesJSON: toJSON(images as any) },
		} as any);

		if (shared.value) {
			canvas.fire(
				"objectsDeleted" as any,
				{
					target: objects,
					skipHistory: true,
				} as any,
			);
			canvas.fire(
				"objects:added" as any,
				{
					target: images,
					skipHistory: true,
				} as any,
			);
		}
		return true;
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
		canSetOpacity,
		maxLayers,
		atTierLimit,
		init,
		adoptCurrentDocumentForRoom,
		markRoomShared,
		serialize,
		setActive,
		setVisible,
		setLocked,
		setOpacity,
		commitOpacity,
		addLayer,
		deleteLayer,
		renameLayer,
		moveLayer,
		moveObjectsToLayer,
		moveSelectionToLayer,
		applyRemoteOp,
		shared,
		objectCount,
		canFlattenLayer,
		flattenLayer,
		heavyLayerIds,
		refreshHeavyLayers,
		acknowledgeHeavyLayers,
		reset,
		// history-facing appliers (no recording, no redo-stack reset)
		applyAddLayer,
		applyRemoveLayer,
		applyRename,
		applyReorder,
		applyOpacity,
	};
});
