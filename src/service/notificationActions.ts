import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useInboxStore } from "@/store/inbox.store";
import { useQuotaStore } from "@/store/quota.store";

/** Interaction-only notification targets, kept behind one lazy boundary. */
export async function openNotificationChat(conversationId: string) {
	useChatWidgetStore().openPrivateChat(conversationId);
}

export async function joinNotificationLobby(lobbyId: string) {
	await socketLoggedInPromise;
	socketJoinRoom({ roomId: lobbyId, intent: "join" });
}

export async function openNotificationDrawing(inboxItemId: string) {
	const item = await useInboxStore().fetchSingleInboxItem(inboxItemId);
	if (item) useInboxSwiper().openInboxSwiper([item], 0);
}

export async function openNotificationCompetition(competitionId: string) {
	await useCompetitionStore().openResults(competitionId);
}

export async function refreshNotificationQuota() {
	const quota = useQuotaStore();
	await quota.refresh(true);
	return quota.posts;
}
