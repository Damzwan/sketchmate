import type { FabricObject } from "fabric";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useDocumentStore } from "@/draw/document/document.store";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { type HistoryAction, HistoryEvent } from "@/draw/history/history.types";
import { getObjectDiff } from "@/draw/history/operations/objectHistory";
import { handleTextModificationSync } from "@/draw/history/operations/textHistory";
import {
	getAbsoluteState,
	serializeOnce,
	toJSON,
	toObjectsIds,
} from "@/draw/objects/objectSerialization";
import { createYielder } from "@/draw/scheduling/yielder";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import {
	type DrawSyncingAction,
	DrawSyncingEvent,
} from "@/draw/sync/sync.types";
import { drawSyncingMapping } from "@/draw/sync/syncActions";
import { useSelect } from "@/draw/tools/select.store";
import { isText } from "@/draw/tools/textEditing";
import { EventBus } from "@/main";
import { leaveRoom } from "@/service/api/socket/drawSyncing.socket";
import { socket } from "@/service/api/socket/socket.service";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";

const IS_MOBILE_SYNC =
	typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);
const MAX_QUEUED_ACTIONS = 2048;
const MAX_QUEUED_ACTION_BYTES = 32 * 1024 * 1024;

/**
 * Emits a local draw action to the room. Lives here (heavy, draw-only) rather
 * than in the light room socket module so that consumers browsing lobbies do
 * not pull the fabric engine into their bundle.
 */
export function emitDrawSyncingEvent(action: DrawSyncingAction) {
	const { roomId } = useDrawSyncer();

	const json = JSON.stringify(action);
	const sizeMB = json.length / (1024 * 1024);

	if (sizeMB >= 0.6) {
		const { toast } = useToast();
		toast("Operation too big, cancelled", {
			color: "danger",
			duration: ToastDuration.long,
		});
		const { silentUndo, silentRedo, lastActionType } = useDrawHistoryManager();

		if (lastActionType === "redo" || lastActionType === "normal") {
			silentUndo();
		} else silentRedo();

		return;
	}

	socket!.emit("draw-event", { roomId: roomId, action });
}

const handleUndo = (params: any) => {
	emitDrawSyncingEvent({
		type: DrawSyncingEvent.Undo,
		params: params as HistoryAction,
	});
};

const handleRedo = (params: any) => {
	emitDrawSyncingEvent({
		type: DrawSyncingEvent.Redo,
		params: params as HistoryAction,
	});
};

/**
 * Heavy canvas-sync engine. Instantiated only within an active drawing session
 * (see draw.store init). Reads room/lobby state from the light useDrawSyncer
 * store and drives the fabric canvas.
 */
export function createDrawSyncEngine() {
	const session = useDrawSyncer();
	const { roomId, isLoadingCanvas } = storeToRefs(session);

	const isProcessingQueue = ref(false);
	type QueuedAction = {
		action: DrawSyncingAction;
		generation: number;
		bytes: number;
	};
	// Cursor queue: repeated Array.shift() can turn a large replay burst into
	// quadratic array compaction. Consumed slots are nulled immediately so their
	// potentially-large JSON payloads are collectable before the next compaction.
	const actionQueue: Array<QueuedAction | null> = [];
	let queueHead = 0;
	let queueGeneration = 0;
	let queuedBytes = 0;
	let queueOverloaded = false;

	function queuedActionCount(): number {
		return actionQueue.length - queueHead;
	}

	function compactActionQueue(): void {
		if (queueHead === 0) return;
		if (queueHead >= actionQueue.length) {
			actionQueue.length = 0;
			queueHead = 0;
			return;
		}
		if (queueHead >= 256 && queueHead * 2 >= actionQueue.length) {
			actionQueue.splice(0, queueHead);
			queueHead = 0;
		}
	}

	function clearActionQueue(): void {
		queueGeneration++;
		actionQueue.length = 0;
		queueHead = 0;
		queuedBytes = 0;
	}

	function estimateActionBytes(action: DrawSyncingAction): number {
		try {
			// JS strings are normally two bytes/code unit. Deliberately
			// overestimate retained heap instead of trusting the wire size.
			return JSON.stringify(action).length * 2;
		} catch {
			return MAX_QUEUED_ACTION_BYTES + 1;
		}
	}

	function rejectQueueOverload(): void {
		if (queueOverloaded) return;
		queueOverloaded = true;
		clearActionQueue();
		const { toast } = useToast();
		toast("Live sync overloaded. Please rejoin the drawing.", {
			color: "danger",
			duration: ToastDuration.long,
		});
		// Never continue with silently missing collaborator actions. In this
		// exceptional state, leaving is safer than either OOMing or diverging.
		queueMicrotask(() => leaveRoom());
	}

	function enqueueAction(action: DrawSyncingAction): boolean {
		const bytes = estimateActionBytes(action);
		if (
			queuedActionCount() >= MAX_QUEUED_ACTIONS ||
			queuedBytes + bytes > MAX_QUEUED_ACTION_BYTES
		) {
			rejectQueueOverload();
			return false;
		}
		actionQueue.push({ action, generation: queueGeneration, bytes });
		queuedBytes += bytes;
		return true;
	}

	function dequeueAction(): QueuedAction | null {
		while (queueHead < actionQueue.length) {
			const queued = actionQueue[queueHead];
			actionQueue[queueHead] = null;
			queueHead++;
			if (queued) {
				queuedBytes = Math.max(0, queuedBytes - queued.bytes);
				return queued;
			}
		}
		return null;
	}

	watch(
		[roomId, isLoadingCanvas],
		([newRoomId, loading], oldValues) => {
			const { addEventsOfService, removeEventsOfService } =
				useDrawEventManager();
			const oldRoomId = oldValues?.[0];

			// A Pinia store survives canvas/room navigation. Never let actions from a
			// previous room drain into the next canvas, and invalidate an in-progress
			// drain so it stops after its current awaited action.
			if (oldValues && newRoomId !== oldRoomId) {
				queueOverloaded = false;
				clearActionQueue();
			}

			// CASE 1: Joined a room and FINISHED loading the canvas
			if (newRoomId && !loading) {
				// Only attach the 'actionSyncer' events (drawing, moving, etc.)
				// now that the canvas is quiet and ready for input
				addEventsOfService("actionSyncer", events);
				// A previous drain may have been invalidated by the room generation
				// while this canvas was loading. Pick up only the new room's queue.
				if (!isProcessingQueue.value && queuedActionCount() > 0) {
					queueMicrotask(() => void processActionQueue());
				}
			}

			// CASE 2: Left a room or started a fresh load
			// We remove events if we lose the roomId OR if we start a new loading phase
			if (!newRoomId || loading) {
				EventBus.off("undo", handleUndo);
				EventBus.off("redo", handleRedo);
				removeEventsOfService("actionSyncer");
			}
		},
		{ immediate: true },
	);

	const events: FabricEvent[] = [
		{
			on: "erasing:end",
			handler: (e: any) => {
				if (!e.detail.targets || e.detail.targets.length === 0) return;

				const targets = e.detail.targets as FabricObject[];
				const path = e.detail.path;

				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ErasingEnd,
					params: {
						objectIds: toObjectsIds(targets),
						deletedObjectIds: [],
						erasePath: path.toJSON([
							"globalCompositeOperation",
							"opacity",
							"stroke",
						]),
					},
				});
			},
		},
		{
			on: "erasing:cleanup_done",
			handler: (e: any) => {
				const { deletedObjects } = e;
				if (!deletedObjects || deletedObjects.length === 0) return;
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.removed,
					params: { objectIds: toObjectsIds(deletedObjects) },
				});
			},
		},
		{
			on: "object:added",
			handler: (e: any) => {
				const target = e.target as FabricObject;
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.added,
					// serializeOnce: history + the bakery mirror serialize this same
					// stroke on this same dispatch; share one toJSON (identical output).
					params: { objectJSONS: [serializeOnce(target)] },
				});
			},
		},
		{
			on: "objects:added",
			handler: (e: any) => {
				const targets = e.target as FabricObject[];
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.added,
					params: { objectJSONS: toJSON(targets) },
				});
			},
		},
		{
			on: "objectsDeleted",
			handler: (e: any) => {
				const targets = e.target as FabricObject[];
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.removed,
					params: { objectIds: toObjectsIds(targets) },
				});
			},
		},
		{
			on: "object:modified",
			handler: (e: any) => {
				const { getCanvas } = useDrawStore();

				const obj = e.target;

				// Moving/transforming into another user's area is not allowed:
				// revert locally + warn, and skip the sync so it never propagates.
				if (useClaimArea().rejectMoveIfProtected()) return;

				if (!e.transform && isText([obj])) {
					const action = handleTextModificationSync(obj);
					emitDrawSyncingEvent(action);
					return;
				}

				const { getSelectedObjectOriginalStates } = useSelect();
				const originalStates = getSelectedObjectOriginalStates();

				const objects = getCanvas().getActiveObjects();

				const changes = objects.map((obj) => {
					const original = originalStates.get(obj.id);
					const current = getAbsoluteState(obj);

					return {
						id: obj.id,
						forward: getObjectDiff(current, original),
						backward: getObjectDiff(original, current),
					};
				});

				emitDrawSyncingEvent({
					type: DrawSyncingEvent.modified,
					params: { changes: changes },
				});
			},
		},
		{
			on: "fullErase",
			handler: () => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.fullErase,
					params: undefined,
				});
			},
		},
		{
			on: "layer:changed",
			handler: (e: any) => {
				const type = e.type as
					| DrawAction.MoveObjectUpOneLayer
					| DrawAction.MoveObjectDownOneLayer
					| DrawAction.MoveObjectToBack
					| DrawAction.MoveObjectToFront;

				const typeMapping: Partial<Record<DrawAction, DrawSyncingEvent>> = {
					[DrawAction.MoveObjectUpOneLayer]:
						DrawSyncingEvent.MoveObjectUpOneLayer,
					[DrawAction.MoveObjectDownOneLayer]:
						DrawSyncingEvent.MoveObjectDownOneLayer,
					[DrawAction.MoveObjectToFront]: DrawSyncingEvent.MoveObjectToFront,
					[DrawAction.MoveObjectToBack]: DrawSyncingEvent.MoveObjectToBack,
				};

				emitDrawSyncingEvent({
					type: typeMapping[type]!,
					params: { objectIds: toObjectsIds(e.target) },
				});
			},
		},
		{
			on: "flip",
			handler: (e: any) => {
				if (e.direction == HistoryEvent.FlipX) {
					emitDrawSyncingEvent({
						type: DrawSyncingEvent.FlipX,
						params: { objectIds: toObjectsIds(e.target) },
					});
				} else if (e.direction == HistoryEvent.FlipY) {
					emitDrawSyncingEvent({
						type: DrawSyncingEvent.FlipY,
						params: { objectIds: toObjectsIds(e.target) },
					});
				}
			},
		},
		{
			on: "objectsCopied",
			handler: (e: any) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ObjectsCopied,
					params: {
						objectIds: e.objectIdsToClone,
						newObjectIds: e.newObjectIds,
					},
				});
			},
		},
		{
			on: "backgroundColorChanged",
			handler: (e: any) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.BackgroundColorChanged,
					params: { color: e.color },
				});
			},
		},
		{
			on: "textStyleChanged",
			handler: (e: any) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.TextStyleChanged,
					params: { style: e.style, objectId: toObjectsIds(e.target)[0] },
				});
			},
		},
		{
			on: "objectStyleChanged",
			handler: (e: any) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ObjectStyleChanged,
					params: { style: e.style, objectIds: toObjectsIds(e.target) },
				});
			},
		},
		{
			on: "layerDocumentChanged",
			handler: (e: any) => {
				if (!e?.op) return;
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.LayerDocument,
					params: { op: e.op },
				});
			},
		},
		{
			on: "imgFilterChanged",
			handler: (e: any) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ImgFilterChanged,
					params: { filter: e.filter?.toJSON(), objectId: e.target.id },
				});
			},
		},
		{
			on: "objectsMerged",
			handler: (e) => {
				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ObjectsMerged,
					params: {
						mergedObjectIds: e.mergedObjectIds,
						groupId: e.objectIds[0],
					},
				});
			},
		},
		{
			on: "undo",
			handler: handleUndo,
		},
		{
			on: "redo",
			handler: handleRedo,
		},
	];

	function init() {}

	function destroy() {
		clearActionQueue();
		queueOverloaded = false;
		EventBus.off("undo", handleUndo);
		EventBus.off("redo", handleRedo);
		useDrawEventManager().removeEventsOfService("actionSyncer");
	}

	async function loadRoomCanvas(
		canvasJSON: any,
		isInitialSync: boolean,
	): Promise<void> {
		const { reset } = useDrawStore();
		const { loadCanvas } = useDocumentStore();
		const { getCanvas } = useDrawStore();

		if (isInitialSync) reset();
		await loadCanvas(getCanvas(), { json: canvasJSON, isLobby: true });

		// Drains everything queued while the canvas was loading.
		if (queuedActionCount() > 0) {
			await processActionQueue();
		}
	}

	function addToDrawSyncingActionQueue(action: DrawSyncingAction) {
		enqueueAction(action);
	}

	async function executeDrawSyncingAction(
		action: DrawSyncingAction,
	): Promise<void> {
		if (!enqueueAction(action)) return;

		if (!isProcessingQueue.value) {
			await processActionQueue();
		}
	}

	/**
	 * Drain the remote-action queue in YIELDED, individually-batched slices.
	 *
	 * Previously this was one `while` loop over the entire queue inside a single
	 * beginBatch/endBatch. Two problems, both hitting the LOCAL user's
	 * smoothness while someone else draws:
	 *
	 *  1. No yield. `await` on an already-resolved promise only drains
	 *     microtasks, so a burst (a fast remote drawer, or the replay buffer on
	 *     join) applied every queued action back-to-back — enliven + add + index
	 *     per action — with no chance for input to dispatch. That is exactly the
	 *     "someone else's events wreck my pan/zoom" case.
	 *  2. One batch for the whole drain. Simply adding a yield inside it would
	 *     hold the batch open across frames, so a LOCAL stroke made meanwhile
	 *     would have its invalidation deferred to the very end of the burst.
	 *
	 * So: slice it. Each slice opens its own batch, applies actions until the
	 * time budget is spent, closes the batch (→ one coalesced invalidateRegions
	 * for that slice, so the screen keeps up), then yields. `yielder.yield()`
	 * waits a full RAF when input is pending, so an active gesture naturally
	 * throttles the drain to one slice per frame instead of competing with it.
	 *
	 * Re-entrancy is unchanged: `isProcessingQueue` keeps a second drain from
	 * starting, and actions pushed while we yield are picked up by the outer
	 * loop below.
	 */
	async function processActionQueue(): Promise<void> {
		if (isProcessingQueue.value) return;
		isProcessingQueue.value = true;
		const drainGeneration = queueGeneration;
		const { actionWithoutEvents } = useDrawEventManager();
		const objMgr = useDrawObjectManager();
		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();

		canvas.fire("sync:queue:start" as any);

		const yielder = createYielder({
			budgetMs: IS_MOBILE_SYNC ? 4 : 8,
			label: "sync-action-queue",
		});
		try {
			while (queuedActionCount() > 0 && drainGeneration === queueGeneration) {
				objMgr.beginBatch();
				try {
					yielder.reset();
					while (
						queuedActionCount() > 0 &&
						drainGeneration === queueGeneration
					) {
						const queued = dequeueAction();
						if (!queued || queued.generation !== drainGeneration) continue;
						const action = queued.action;

						const start = performance.now();
						// A peer on a NEWER build can send an action type this build has
						// never heard of. The lookup below used to be unguarded, so that
						// threw and killed the whole drain — every later action in the
						// queue was dropped with it. Skipping one unknown action degrades
						// gracefully instead, and it is what makes shipping any new
						// action type survivable for clients already in the wild.
						const handler = (drawSyncingMapping as any)[action.type];
						if (typeof handler !== "function") {
							console.warn("[sync] unknown action type, skipped:", action.type);
							continue;
						}
						await actionWithoutEvents(async () => {
							await handler(action.params);
						});
						canvas.fire("sync:action:done" as any, {
							type: action.type,
							duration: performance.now() - start,
						});

						// Budget spent (or input pending) → close this slice's batch so
						// its regions repaint, then yield below.
						if (yielder.shouldYield()) break;
					}
				} finally {
					objMgr.endBatch();
				}
				compactActionQueue();
				if (queuedActionCount() > 0 && drainGeneration === queueGeneration) {
					await yielder.yield();
				}
			}
		} finally {
			compactActionQueue();
			isProcessingQueue.value = false;
			canvas.fire("sync:queue:end" as any);
			// If the room generation changed while an action was awaiting, its drain
			// stops intentionally. A non-loading replacement room can safely start a
			// fresh drain now; a loading room is resumed by loadRoomCanvas/watcher.
			if (queuedActionCount() > 0 && !isLoadingCanvas.value) {
				queueMicrotask(() => void processActionQueue());
			}
		}
	}

	return {
		init,
		destroy,
		loadRoomCanvas,
		addToDrawSyncingActionQueue,
		executeDrawSyncingAction,
	};
}

export type DrawSyncEngine = ReturnType<typeof createDrawSyncEngine>;

let drawSyncEngine: DrawSyncEngine | undefined;

export function useDrawSyncEngine(): DrawSyncEngine {
	return (drawSyncEngine ??= createDrawSyncEngine());
}
