import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Mate } from "@/types/server.types";

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
			/**
			 * Censored twin of `message`, sent down with the lobby-message payload.
			 * Lobby chat is never persisted, so the server computes it per emit
			 * instead of storing it — see the server's profanity.service.
			 */
			message_filtered?: string;
			isOptimistic?: boolean;
			status?: MessageStatus;
			createdAt?: string;
	  })
	| (BaseLobbyItem & {
			type: "join";
	  })
	| (BaseLobbyItem & {
			type: "leave";
	  })
	/**
	 * Someone shared a reference image. It is announced here rather than opened
	 * on everyone's canvas: a peer's photo landing unasked on top of your drawing
	 * is both an interruption and an unreviewed image on a screen that may belong
	 * to a child. The row is the consent step — and the place to report it.
	 */
	| (BaseLobbyItem & {
			type: "reference";
			referenceId: string;
			referenceName: string;
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
 * lives in the lazily-loaded draw sync engine.
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

	/**
	 * Peers who have actually put marks on this canvas, in the order they first
	 * did — the basis for the collaboration credit on a post made in a room.
	 *
	 * Deliberately NOT `roomMembers`: that is a live presence list, so it would
	 * credit someone who wandered in a second before the export and drop the
	 * person who drew half the picture and left. This is keyed off the server's
	 * `creator` stamp on each incoming draw event, which is set from the socket's
	 * authenticated user and never from the sending client.
	 *
	 * The member snapshot is kept alongside the id because credit outlives
	 * presence: by publish time the contributor may well be gone from the room.
	 */
	const contributors = ref<Map<string, Mate>>(new Map());

	/**
	 * A hard ceiling on credit, not on the room. Public lobbies are open, so
	 * without a cap a busy canvas would carry a credit list longer than the
	 * caption — and the row only ever shows three faces regardless.
	 */
	const MAX_CONTRIBUTORS = 12;

	function noteContributor(userId: string | undefined) {
		if (!userId || contributors.value.has(userId)) return;
		if (contributors.value.size >= MAX_CONTRIBUTORS) return;

		const member = roomMembers.value.find((m) => m._id === userId);
		if (!member) return;

		// Replaced rather than mutated: a Map mutation is not reactive.
		contributors.value = new Map(contributors.value).set(userId, member);
	}

	function resetContributors() {
		if (contributors.value.size === 0) return;
		contributors.value = new Map();
	}

	/**
	 * Lobby chat is session-scoped and has NO history endpoint — ChatMessageFlow
	 * deliberately renders no top sentinel for it, so anything scrolled past is
	 * already unrecoverable. The array was nonetheless unbounded: five socket
	 * handlers pushed into it and nothing short of leaving the room ever cleared
	 * it, so a long public session kept accumulating rows (and mounted bubbles)
	 * on devices least able to afford them.
	 *
	 * Two thresholds rather than one, same reasoning as chat.store's DM trim:
	 * cutting AT the cap would re-slice the array on every subsequent message.
	 */
	const MAX_LOBBY_ITEMS = 250;
	const LOBBY_TRIM_TARGET = 180;

	function trimLobbyMessages() {
		if (lobbyChatMessages.value.length <= MAX_LOBBY_ITEMS) return;
		lobbyChatMessages.value = lobbyChatMessages.value.slice(-LOBBY_TRIM_TARGET);
	}

	/**
	 * The single append path for lobby items, so the cap can't be sidestepped by
	 * a sixth socket handler pushing straight at the ref.
	 *
	 * `resort` is for late-arriving backfill: it lands at the END of the array
	 * but belongs EARLIER in time. Ordering has to happen before the trim, or
	 * the trim keeps the backfill and drops the live messages it was meant to
	 * slot in behind.
	 */
	function pushLobbyItems(
		items: LobbyChatItem[],
		options: { resort?: boolean } = {},
	) {
		if (items.length === 0) return;
		lobbyChatMessages.value.push(...items);
		if (options.resort) {
			lobbyChatMessages.value.sort(
				(a, b) =>
					new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);
		}
		trimLobbyMessages();
	}

	function addOptimisticLobbyMessage(message: any) {
		pushLobbyItems([message]);
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
		pushLobbyItems,
		trimLobbyMessages,
		publicLobbies,
		isWatchingPublicLobbies,
		isPublicLobby,
		publicLobbyName,
		disconnectedRoomId,
		lastProcessedSequenceId,
		currentSessionId,
		isLobby,
		contributors,
		noteContributor,
		resetContributors,
		addOptimisticLobbyMessage,
		resolveOptimisticLobbyMessage,
		updateLobbyMessageStatus,
	};
});
