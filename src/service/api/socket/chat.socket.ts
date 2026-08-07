import type { Socket } from "socket.io-client";
import {
	hydrateCustomization,
	resolveTitle,
} from "@/config/profile_options.config";
import { safeText } from "@/helper/profanity.helper";
import { getPartialUsers } from "@/service/api/user.api";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";
import type {
	BaseMessage,
	ChatStatus,
	PopulatedConversation,
} from "@/types/server.types";

/**
 * registerChatHandlers
 * Centralizes all real-time chat and relationship socket events.
 */
export function registerChatHandlers(socket: Socket) {
	const friendStore = useFriendStore();
	const chatStore = useChatStore();
	const widgetStore = useChatWidgetStore();
	const authStore = useAuthStore();
	const userCache = useUserCacheStore();

	socket.on(
		"friend:online",
		(data: { user_id: string; status: string; last_seen_version?: number }) => {
			friendStore.setFriendOnlineStatus(data.user_id, true);

			const cachedUser = userCache.getUser(data.user_id);

			if (!cachedUser) {
				getPartialUsers([data.user_id]).then((users) => {
					if (users[0]) userCache.upsert(users[0]);
				});
			}
		},
	);

	socket.on("friend:offline", (payload: { user_id: string }) => {
		friendStore.setFriendOnlineStatus(payload.user_id, false);
	});

	socket.on(
		"chat:receive_message",
		(payload: {
			message: BaseMessage;
			conversation: PopulatedConversation;
			conversation_id: string;
		}) => {
			const me = authStore.user?._id;
			if (
				payload.message?.type !== "system" &&
				payload.message.sender_id === me
			)
				return;

			chatStore.addIncomingMessage(
				payload.conversation_id,
				payload.message,
				payload.conversation,
			);

			widgetStore.triggerNewMessageAlert(payload.conversation_id);

			const partner = payload.conversation.participants.find(
				(p) => p._id !== me,
			);

			// System messages get bespoke notification text — content is empty
			let notifText: string;
			if (payload.message.type === "system") {
				if (payload.message.system_kind === "balloon_match") {
					// The acceptor "sends" the system message → if it's not me, they caught my balloon.
					notifText = `${partner?.name || "Someone"} caught your balloon 🎈`;
				} else {
					notifText = "New activity";
				}
			} else if (payload.message.content) {
				// Same twin the bubble will render — a toast is the first place the
				// message is seen, so it can't be the one surface that leaks it.
				notifText = safeText(
					payload.message.content,
					payload.message.content_filtered,
				);
			} else if (payload.message.shared_post_id) {
				notifText = "Shared a post";
			} else if (payload.message.shared_inbox_item_id) {
				notifText = "Shared a gallery sketch";
			} else {
				notifText = "Sent a sketch";
			}

			chatStore.addNotification({
				tabId: payload.conversation_id,
				subtitle: partner?.name || "New Message",
				senderId: partner?._id,
				title: resolveTitle(
					hydrateCustomization(partner?.customization).titleId,
				),
				text: notifText,
				img: partner?.img || "",
				isTrial: payload.conversation.status === "temporary",
				isRequest: payload.conversation.status === "pending_invite",
				isMateProposal: payload.conversation.status === "pending_mate",
				customization: partner?.customization,
			});
		},
	);

	socket.on(
		"chat:typing_status",
		(payload: { sender_id: string; is_typing: boolean }) => {
			chatStore.setTypingStatus(payload.sender_id, payload.is_typing);
		},
	);

	socket.on(
		"chat:request_accepted",
		(payload: { conversation: PopulatedConversation }) => {
			chatStore.handleRequestAccepted(payload);
		},
	);

	socket.on("chat:request_declined", (payload: { conversation_id: string }) => {
		chatStore.handleRequestDeclined(payload);
	});

	socket.on(
		"chat:mate_matched",
		(payload: { conversation: PopulatedConversation }) => {
			chatStore.handleMateMatched(payload);
		},
	);

	socket.on(
		"chat:mate_declined",
		(payload: {
			conversation_id: string;
			conversation: PopulatedConversation;
			status: ChatStatus; // FIX: Aligned with the chatStore method signature
		}) => {
			chatStore.handleMateDeclined(payload);
		},
	);

	socket.on(
		"chat:mate_unfriended",
		(payload: {
			conversation_id: string;
			conversation: PopulatedConversation;
		}) => {
			chatStore.handleMateUnfriended(payload);
			// Clear friend from friendStore list locally
			const me = authStore.user?._id;
			const partner = payload.conversation.participants.find(
				(p) => p._id !== me,
			);
			if (partner) friendStore.removeFriendLocally(partner._id);
		},
	);

	socket.on(
		"chat:mate_requested",
		(payload: {
			conversation_id: string;
			conversation: PopulatedConversation;
			wasExpired: boolean;
		}) => {
			chatStore.handleMateRequested(payload);
		},
	);
}

/**
 * Sends a message and returns the server's acknowledgment (with the real DB _id)
 */
export function emitSendMessage(
	socket: any,
	receiver_id: string,
	content: string,
	shared_post_id?: string,
	shared_inbox_item_id?: string,
): Promise<any> {
	return new Promise((resolve, reject) => {
		if (!socket?.connected) return reject(new Error("Socket disconnected"));

		socket.emit(
			"chat:send_message",
			{ receiver_id, content, shared_post_id, shared_inbox_item_id },
			(response: any) => {
				if (response.error) reject(new Error(response.error));
				else resolve(response);
			},
		);
	});
}

/**
 * Throttled typing indicator emit
 */
export function emitTypingStatus(
	socket: any,
	receiver_id: string,
	is_typing: boolean,
) {
	if (socket?.connected) {
		socket.emit("chat:typing", { receiver_id, is_typing });
	}
}
