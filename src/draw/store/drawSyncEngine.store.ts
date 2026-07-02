import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useDrawStore } from "@/draw/store/draw.store";
import {
	DrawSyncingAction,
	DrawSyncingEvent,
} from "@/draw/types/drawSyncing.types";
import { drawSyncingMapping } from "@/draw/config/drawSyncing.config";
import { DrawAction, FabricEvent } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import { FabricObject } from "fabric";
import {
	getAbsoluteState,
	toJSON,
	toObjectsIds,
} from "@/draw/helpers/object.helper";
import { isText } from "@/draw/helpers/text.helper";
import { getObjectDiff } from "@/draw/helpers/history/object.helper";
import { HistoryAction, HistoryEvent } from "@/draw/types/drawHistory.types";
import { EventBus } from "@/main";
import { useSelect } from "@/draw/store/tools/select.store";
import { handleTextModificationSync } from "@/draw/helpers/history/text.helper";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { useDrawHistoryManager } from "@/draw/store/drawHistoryManager.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { socket } from "@/service/api/socket/socket.service";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";

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
export const useDrawSyncEngine = defineStore("drawSyncEngine", () => {
	const session = useDrawSyncer();
	const { roomId, isLoadingCanvas } = storeToRefs(session);

	const isProcessingQueue = ref(false);
	const isUsingGestures = ref(false);
	const actionQueue: DrawSyncingAction[] = [];

	watch(
		[roomId, isLoadingCanvas],
		([newRoomId, loading]) => {
			const { addEventsOfService, removeEventsOfService } =
				useDrawEventManager();

			// CASE 1: Joined a room and FINISHED loading the canvas
			if (newRoomId && !loading) {
				// Only attach the 'actionSyncer' events (drawing, moving, etc.)
				// now that the canvas is quiet and ready for input
				addEventsOfService("actionSyncer", events);
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
					params: { objectJSONS: [target.toJSON()] },
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

	async function loadRoomCanvas(
		canvasJSON: any,
		isInitialSync: boolean,
	): Promise<void> {
		const { reset } = useDrawStore();
		const { loadCanvas } = useDrawLoadStore();
		const { getCanvas } = useDrawStore();

		if (isInitialSync) reset();
		await loadCanvas(getCanvas(), { json: canvasJSON, isLobby: true });

		// Drains everything queued while the canvas was loading.
		if (actionQueue.length > 0) {
			await processActionQueue();
		}
	}

	function addToDrawSyncingActionQueue(action: DrawSyncingAction) {
		actionQueue.push(action);
	}

	async function executeDrawSyncingAction(
		action: DrawSyncingAction,
	): Promise<void> {
		actionQueue.push(action);

		if (!isProcessingQueue.value && !isUsingGestures.value) {
			await processActionQueue();
		}
	}

	async function processActionQueue(): Promise<void> {
		isProcessingQueue.value = true;
		const { actionWithoutEvents } = useDrawEventManager();
		const objMgr = useDrawObjectManager();
		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();

		canvas.fire("sync:queue:start" as any);

		objMgr.beginBatch();
		try {
			while (actionQueue.length > 0) {
				const action = actionQueue.shift();
				if (!action) continue;

				const start = performance.now();
				await actionWithoutEvents(async () => {
					// @ts-ignore
					await drawSyncingMapping[action.type](action.params);
				});
				canvas.fire("sync:action:done" as any, {
					type: action.type,
					duration: performance.now() - start,
				});
			}
		} finally {
			objMgr.endBatch();
			isProcessingQueue.value = false;
			canvas.fire("sync:queue:end" as any);
		}
	}

	return {
		init,
		loadRoomCanvas,
		addToDrawSyncingActionQueue,
		executeDrawSyncingAction,
	};
});
