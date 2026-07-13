// src/composables/useActiveViewSync.ts
import { onMounted, onUnmounted } from "vue";
import { App } from "@capacitor/app";
import { PluginListenerHandle } from "@capacitor/core";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";

/**
 * Refresh app data when returning to foreground after being backgrounded
 * for more than this threshold. Anything shorter (quick app switches,
 * brief screen-off) doesn't trigger a refetch — data is still fresh.
 */
const REFRESH_AFTER_BACKGROUND_MS = 5000;

export function useActiveViewSync() {
	const authStore = useAuthStore();
	let stateListener: PluginListenerHandle | null = null;
	let backgroundedAt: number | null = null;

	const handleStateChange = async ({ isActive }: { isActive: boolean }) => {
		if (!isActive) {
			backgroundedAt = Date.now();
			return;
		}

		// Coming back to foreground
		if (!authStore.isLoggedIn) return;

		const wasBackgroundedLongEnough =
			backgroundedAt !== null &&
			Date.now() - backgroundedAt >= REFRESH_AFTER_BACKGROUND_MS;

		backgroundedAt = null;

		if (!wasBackgroundedLongEnough) return;

		try {
			await authStore.refresh();
			// refresh() reloads the chat LIST but not the messages inside the chat
			// the user currently has open — the socket was down while backgrounded,
			// so those live messages were missed. Force-refetch the open thread.
			await useChatStore().syncActiveConversation();
		} catch (error) {
			console.error("Failed to refresh on resume:", error);
		}
	};

	onMounted(async () => {
		stateListener = await App.addListener("appStateChange", handleStateChange);
	});

	onUnmounted(() => {
		if (stateListener) stateListener.remove();
	});
}
