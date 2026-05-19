import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { Mate } from "@/types/server.types";
import { useDrawStore } from "@/draw/store/draw.store";
import {
	DrawSyncingAction,
	DrawSyncingEvent,
} from "@/draw/types/drawSyncing.types";
import { drawSyncingMapping } from "@/draw/config/drawSyncing.config";
import { DrawAction, FabricEvent } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import { emitDrawSyncingEvent } from "@/service/api/socket/drawSyncing.socket";
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

export interface DrawInvitation {
	friend: Mate;
	roomId: string;
}

export type MessageStatus = "sending" | "sent" | "error";

interface BaseLobbyItem {
	_id: string;
	timestamp: string;
	member: Mate;
}

export type LobbyChatItem =
	| (BaseLobbyItem & {
			type: "message";
			message: string;
			isOptimistic?: boolean;
			status?: MessageStatus;
			createdAt?: string;
	  })
	| (BaseLobbyItem & {
			type: "join";
	  })
	| (BaseLobbyItem & {
			type: "leave";
	  });

export interface PublicLobby {
	id: string;
	name: string;
	users: number;
	maxUsers: number;
	thumbnailUrl?: string;
}

interface ActiveAvatar {
	pos: { x: number; y: number };
	img: string;
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

export const useDrawSyncer = defineStore("drawSyncer", () => {
	const roomMembers = ref<Mate[]>([]);
	const roomId = ref<string>();
	const isCreator = ref<boolean>(false);
	const isTryingToJoin = ref<boolean>(false);
	const isLoadingCanvas = ref(false);
	const invitations = ref<DrawInvitation[]>([]);
	const invitedFriends = ref<string[]>([]);
	const lobbyChatMessages = ref<LobbyChatItem[]>([]);
	const publicLobbies = ref<PublicLobby[]>([]);
	const isWatchingPublicLobbies = ref<boolean>(false);
	const isPublicLobby = ref<boolean>(false);
	const publicLobbyName = ref<string>("");
	const disconnectedRoomId = ref<string>();
	const isProcessingQueue = ref(false);
	const lastProcessedSequenceId = ref<number | undefined>(undefined);
	const currentSessionId = ref<string | undefined>(undefined);
	const isUsingGestures = ref(false);

	const isLobby = computed(() => !!roomId.value);

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

				const allObjectIds = toObjectsIds(targets);
				const deletedObjectIds = toObjectsIds(e.detail.deletedObjects || []);
				const objectIds = allObjectIds.filter(
					(id) => !deletedObjectIds.includes(id),
				);

				emitDrawSyncingEvent({
					type: DrawSyncingEvent.ErasingEnd,
					params: {
						objectIds: objectIds,
						deletedObjectIds: toObjectsIds(e.detail.deletedObjects || []),
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

	async function loadRoomCanvas(canvasJSON: any, isInitialSync: boolean) {
		const { reset } = useDrawStore();
		const { loadCanvas } = useDrawLoadStore();
		const { getCanvas } = useDrawStore();

		if (isInitialSync) reset();
		await loadCanvas(getCanvas(), { json: canvasJSON, isLobby: true });

		if (actionQueue.length > 0) {
			await processActionQueue();
		}

		for (const action of actionQueue.reverse()) {
			await executeDrawSyncingAction(action);
		}
	}

	function addToDrawSyncingActionQueue(action: DrawSyncingAction) {
		actionQueue.push(action);
	}

	async function executeDrawSyncingAction(action: DrawSyncingAction) {
		actionQueue.push(action);

		if (!isProcessingQueue.value && !isUsingGestures.value) {
			await processActionQueue();
		}
	}

	async function processActionQueue() {
		isProcessingQueue.value = true;
		const { actionWithoutEvents } = useDrawEventManager();
		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();

		// 🛰️ FIRE DEBUG START
		canvas.fire("sync:queue:start" as any);

		try {
			while (actionQueue.length > 0) {
				const action = actionQueue.shift();
				if (!action) continue;

				// ⏱️ TIME INDIVIDUAL ACTION
				const start = performance.now();

				await actionWithoutEvents(async () => {
					await drawSyncingMapping[action.type](action.params);
				});

				// 🛰️ FIRE DEBUG INDIVIDUAL
				canvas.fire("sync:action:done" as any, {
					type: action.type,
					duration: performance.now() - start,
				});
			}
		} finally {
			isProcessingQueue.value = false;
			// 🛰️ FIRE DEBUG END
			canvas.fire("sync:queue:end" as any);
		}
	}

	function addOptimisticLobbyMessage(message: any) {
		lobbyChatMessages.value.push(message);
	}

	function resolveOptimisticLobbyMessage(tempId: string, resolvedMessage: any) {
		const index = lobbyChatMessages.value.findIndex(
			(msg) => msg._id === tempId,
		);
		if (index !== -1) {
			lobbyChatMessages.value[index] = resolvedMessage;
		}
	}

	function updateLobbyMessageStatus(
		tempId: string,
		status: "sending" | "sent" | "error",
	) {
		const message = lobbyChatMessages.value.find((msg) => msg._id === tempId);
		if (message && message.type === "message") {
			message.status = status;
		}
	}

	return {
		roomMembers,
		roomId,
		isCreator,
		isTryingToJoin,
		loadRoomCanvas,
		isLoadingCanvas,
		addToDrawSyncingActionQueue,
		executeDrawSyncingAction,
		init,
		invitations,
		invitedFriends,
		lobbyChatMessages,
		publicLobbies,
		isWatchingPublicLobbies,
		isPublicLobby,
		publicLobbyName,
		disconnectedRoomId,
		lastProcessedSequenceId,
		currentSessionId,
		isLobby,
		addOptimisticLobbyMessage,
		resolveOptimisticLobbyMessage,
		updateLobbyMessageStatus,
	};
});
