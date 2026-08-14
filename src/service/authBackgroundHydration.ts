import { refreshPublicLobbies } from "@/service/api/socket/drawSyncing.socket";
import { useBalloonStore } from "@/store/balloon.store";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";
import { useInboxStore } from "@/store/inbox.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useModerationStore } from "@/store/moderation.store";
import { useQuotaStore } from "@/store/quota.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import type { User } from "@/types/server.types";

/**
 * Static feature graph behind one dynamic boundary. Importing every store
 * directly from auth created circular split points that Rolldown had to hoist
 * back into the eager router chunk. This facade stays entirely off the startup
 * graph until auth schedules idle hydration.
 */
export async function hydrateBackgroundStores(user: User): Promise<void> {
	await Promise.allSettled([
		useSubscriptionStore().checkProStatus(),
		useBalloonStore().init(user),
		useQuotaStore().refresh(true),
		useModerationStore().initFromUser(user),
		useInAppNotificationStore().loadInitial(),
		refreshPublicLobbies(),
		useInventoryStore().hydrateFromUser(user),
	]);
}

export async function refreshBackgroundStores(user: User): Promise<void> {
	await Promise.allSettled([
		useInboxStore().getInboxBatch(true),
		useQuotaStore().refresh(true),
		useModerationStore().initFromUser(user),
		useInAppNotificationStore().loadInitial(),
		refreshPublicLobbies(),
		useInventoryStore().hydrateFromUser(user),
	]);
}

export async function syncActiveConversation(): Promise<void> {
	const { useChatStore } = await import("@/store/chat.store");
	await useChatStore().syncActiveConversation();
}
