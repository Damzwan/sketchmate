import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Mate } from "@/types/server.types";

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
	premiumSlots: number;
	thumbnailUrl?: string;
}

/**
 * Light room/lobby session state. Holds NO fabric / draw-engine imports so that
 * lobby browsing, chat and deep-link joins can reference room state without
 * pulling the heavy canvas engine into their bundle. The canvas-sync logic
 * lives in the lazily-loaded useDrawSyncEngine store.
 */
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
	const disconnectedRoomId = ref<string>();
	const lastProcessedSequenceId = ref<number | undefined>(undefined);
	const currentSessionId = ref<string | undefined>(undefined);
	const publicLobbyName = computed(
		() =>
			publicLobbies.value.find((lobby) => lobby.id === roomId.value)?.name ||
			"",
	);

	const isLobby = computed(() => !!roomId.value);

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
		isLoadingCanvas,
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
