import { storeToRefs } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { type PublicLobby, useDrawSyncer } from "@/draw/sync/session.store";
import { EventBus } from "@/main";
import router from "@/router";
import { socket } from "@/service/api/socket/socket.service";
import { fetchPublicLobbies } from "@/service/api/user.api";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useMenuStore } from "@/store/menu.store";
import { useParentalStore } from "@/store/parental.store";
import { Menu } from "@/types/menu.types";

/**
 * Light room/lobby socket helpers. Deliberately free of any fabric / draw-engine
 * imports so that lobby browsing, deep-link joins and chat can be referenced
 * from the app-start bundle without dragging the canvas engine in. The heavy,
 * canvas-touching event handlers live in drawRoomHandlers.socket.ts and are
 * registered lazily (see socket.service).
 */

export async function socketJoinRoom({
	roomId,
	intent,
}: {
	roomId: string;
	intent: "create" | "join";
}) {
	const {
		isTryingToJoin,
		lastProcessedSequenceId,
		isLoadingCanvas,
		currentSessionId,
	} = storeToRefs(useDrawSyncer());
	isTryingToJoin.value = true;

	if (useAuthStore().onlineUpdateRequired()) {
		useMenuStore().openMenu(Menu.UpgradeOnline);
		isTryingToJoin.value = false;
		return;
	}

	// Every route into a shared room funnels through here — chat invites, deep
	// links, push notifications, the room menu — so the parental switch and the
	// safety reminder are enforced once, at the choke point.
	if (!(await useParentalStore().ensureCanExchange("rooms"))) {
		isTryingToJoin.value = false;
		return;
	}

	if (intent === "join") {
		isLoadingCanvas.value = true;
	}

	// Signal any active drawing session to stop autosaving. Handled by the
	// draw-load store when a canvas session is live; a no-op otherwise, which
	// keeps this module free of the heavy draw-load import.
	EventBus.emit("room:joining");

	socket!.emit("join-room", {
		roomId,
		intent,
		lastSequenceId: lastProcessedSequenceId.value,
		lastSessionId: currentSessionId.value,
	});
}

export function leaveRoom(skipEmit = false) {
	const {
		roomId,
		roomMembers,
		invitedFriends,
		isPublicLobby,
		isLoadingCanvas,
		lobbyChatMessages,
		lastProcessedSequenceId,
		publicLobbies,
	} = storeToRefs(useDrawSyncer());

	if (isPublicLobby.value) {
		publicLobbies.value = publicLobbies.value.map((i) =>
			i.id === roomId.value ? { ...i, users: i.users - 1 } : i,
		);
	}

	roomMembers.value = [];
	invitedFriends.value = [];
	removeRoomIdFromUrl();
	isPublicLobby.value = false;
	isLoadingCanvas.value = false;
	lobbyChatMessages.value = [];
	useChatStore().clearLobbyNotifications(); // <-- Kill lingering lobby toasts immediately
	lastProcessedSequenceId.value = undefined; // <-- Reset time on leave

	if (!skipEmit) socket!.emit("leave-room", { roomId: roomId.value });
	roomId.value = undefined;
}

export function inviteFriendToRoom(friendId: string, roomId: string) {
	socket!.emit("friend-invite", { roomId, friendId });
}

export function sendLobbyMessage(message: string) {
	const drawSyncer = useDrawSyncer();
	const authStore = useAuthStore();

	if (!drawSyncer.roomId || !authStore.user) return;

	// 1. Create a temporary Optimistic Message
	const tempId = uuidv4();
	const optimisticMessage = {
		_id: tempId,
		type: "message",
		message: message,
		member: authStore.user,
		createdAt: new Date().toISOString(),
		status: "sending",
		isOptimistic: true,
	};

	drawSyncer.addOptimisticLobbyMessage(optimisticMessage);

	socket!.emit("lobby-message", {
		roomId: drawSyncer.roomId,
		message,
		tempId,
	});

	// Optional: Set a timeout to mark as error if the server never responds
	setTimeout(() => {
		const msg = drawSyncer.lobbyChatMessages.find((m) => m._id === tempId);
		if (msg && msg.type == "message" && msg.status === "sending") {
			drawSyncer.updateLobbyMessageStatus(tempId, "error");
		}
	}, 5000);
}

export async function refreshPublicLobbies(): Promise<void> {
	const { isUnderAge } = useAuthStore();
	if (isUnderAge) {
		return;
	}
	const { publicLobbies } = storeToRefs(useDrawSyncer());
	try {
		publicLobbies.value = await fetchPublicLobbies();
	} catch (e) {
		console.error("Failed to refresh public lobbies:", e);
	}
}

export async function startWatchingLobbies() {
	const { isUnderAge } = useAuthStore();
	if (isUnderAge) {
		return;
	}

	const { isWatchingPublicLobbies } = storeToRefs(useDrawSyncer());
	isWatchingPublicLobbies.value = true;

	// Clean up any existing listeners before attaching new ones
	socket!.off("public-lobbies-update", handleLobbyUpdate);
	socket!.off("lobby-thumbnail-pulsed", handleThumbnailPulse);

	socket!.emit("watch-public-lobbies");

	socket!.on("public-lobbies-update", handleLobbyUpdate);
	socket!.on("lobby-thumbnail-pulsed", handleThumbnailPulse);
}

export function stopWatchingLobbies() {
	const { isWatchingPublicLobbies, publicLobbies } = storeToRefs(
		useDrawSyncer(),
	);
	if (!isWatchingPublicLobbies.value) return;

	isWatchingPublicLobbies.value = false;
	publicLobbies.value = [];

	socket!.emit("unwatch-public-lobbies");
	socket!.off("public-lobbies-update", handleLobbyUpdate);
	socket!.off("lobby-thumbnail-pulsed", handleThumbnailPulse);
}

export function handleLobbyUpdate(lobbies: PublicLobby[]) {
	const { publicLobbies } = storeToRefs(useDrawSyncer());
	publicLobbies.value = lobbies;
}

export function handleThumbnailPulse({
	roomId,
	thumbnailUrl,
}: {
	roomId: string;
	thumbnailUrl: string;
}) {
	const { publicLobbies } = storeToRefs(useDrawSyncer());
	const index = publicLobbies.value.findIndex((l) => l.id === roomId);

	if (index !== -1) {
		publicLobbies.value[index].thumbnailUrl = thumbnailUrl;
	}
}

export function removeRoomIdFromUrl() {
	const query = { ...router.currentRoute.value.query };
	delete query.room_id;
	router.replace({ query });
}

export function addRoomIdToUrl(roomId: string) {
	const query = {
		...router.currentRoute.value.query,
		room_id: roomId,
	};

	router.replace({ query });
}
