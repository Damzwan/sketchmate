import type { BaseMessage, PopulatedConversation } from "@/types/server.types";
import { request } from "./http";

export interface ChatShellPayload {
	activeChats: PopulatedConversation[];
	pendingRequests: PopulatedConversation[];
	onlineFriendIds: string[];
	blockedUserIds: string[];
}

/**
 * The metadata needed by the always-visible social shell. Keeping this behind
 * one endpoint avoids four auth-token bridge calls and four network round trips
 * during startup; full message histories remain lazy.
 */
export async function getChatShell() {
	return await request<ChatShellPayload>("/chats/shell");
}

/**
 * Returns active mates + temporary 24h chats.
 * Backend logic should now filter conversations based on the
 * chat_status in the linked relationship document.
 */
export async function getActiveChats() {
	return await request<PopulatedConversation[]>("/chats/active");
}

/**
 * UPDATED: Fetches conversations where the relationship status is 'pending_invite'.
 * This is the "Message Request" folder.
 */
export async function getPendingRequests() {
	return await request<PopulatedConversation[]>("/chats/requests");
}

export interface ChatMessagesPage {
	data: BaseMessage[];
	hasMore: boolean;
}

/**
 * Standard message history fetcher. Returns a page, not a bare array — this
 * was declared as `BaseMessage[]` and the one caller cast the result to `any`
 * to reach `.data`, so the declared type had never been right.
 */
export async function getChatMessages(
	conversationId: string,
	before?: string,
	limit = 30,
): Promise<ChatMessagesPage> {
	let url = `/chats/${conversationId}/messages?limit=${limit}`;
	if (before) url += `&before=${before}`;

	return await request<ChatMessagesPage>(url);
}

/**
 * Simple POST to clear unread counts for the current user.
 */
export async function markAsRead(conversationId: string): Promise<void> {
	return await request<void>(`/chats/${conversationId}/read`, {
		method: "POST",
	});
}

/** Clear every unread direct conversation with one server-side write. */
export async function markAllAsRead(): Promise<void> {
	return await request<void>("/chats/read-all", { method: "POST" });
}
