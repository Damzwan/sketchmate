import { getChatShell } from "@/service/api/chat.api";
import {
	socketConnect,
	socketLogin,
} from "@/service/api/socket/socket.service";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import type { User } from "@/types/server.types";

async function loadChatShell(): Promise<void> {
	const friendStore = useFriendStore();
	const chatStore = useChatStore();

	try {
		const shell = await getChatShell();
		// Apply both halves in the same microtask so the unread and presence badges
		// appear together instead of popping in across several request completions.
		friendStore.applySocialShell(shell);
		chatStore.applyActiveChats(shell.activeChats);
	} catch (error) {
		// Safe rolling deploy: an app can briefly reach a server instance that does
		// not have /chats/shell yet. The existing endpoints remain a robust fallback.
		console.warn(
			"[chat] combined shell unavailable; using legacy requests",
			error,
		);
		await Promise.allSettled([
			friendStore.initializeSocialGraph(),
			chatStore.loadActiveChats(),
		]);
	}
}

/**
 * Hydrate the small, always-visible social shell as soon as auth succeeds.
 *
 * The app header needs active-conversation metadata for unread counts and the
 * online-id/social graph for presence. This deliberately does not fetch any
 * message history or mount the chat UI.
 */
export async function hydrateChatShell(user: User): Promise<void> {
	await Promise.allSettled([
		(async () => {
			await socketConnect();
			await socketLogin({ _id: user._id });
		})(),
		loadChatShell(),
	]);
}

/** Refresh the metadata that backs the header's social counters. */
export async function refreshChatShell(): Promise<void> {
	await loadChatShell();
}
