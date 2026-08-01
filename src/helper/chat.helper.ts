import type { PopulatedConversation } from "@/types/server.types";

/** Message activity, deliberately independent from conversation `updatedAt`. */
export function conversationActivityAt(
	chat: Pick<PopulatedConversation, "last_message" | "createdAt" | "updatedAt">,
): number {
	const value = chat.last_message?.createdAt || chat.createdAt || chat.updatedAt;
	const timestamp = value ? new Date(value).getTime() : 0;
	return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareConversationActivity(
	a: PopulatedConversation,
	b: PopulatedConversation,
): number {
	return conversationActivityAt(b) - conversationActivityAt(a);
}

export function recentActivityForPartner(
	chats: PopulatedConversation[],
	partnerId: string,
	fallback?: string,
): number {
	const fallbackTimestamp = fallback ? new Date(fallback).getTime() : 0;
	let latest = Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
	for (const chat of chats) {
		if (!chat.participants?.some((participant) => participant._id === partnerId))
			continue;
		latest = Math.max(latest, conversationActivityAt(chat));
	}
	return latest;
}
