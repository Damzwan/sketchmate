import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSubscriptionStore } from "./subscription.store";
import { useAuthStore } from "./auth.store";
import {
	CATALOG_BY_ID,
	FREE_ITEMS,
	PRO_LOCKED_CATEGORIES,
	grantsForSku,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";
import { syncTitles as syncTitlesApi } from "@/service/api/user.api";

// Single source of truth for "does this user own item X?". Item IDs use the
// dotted convention (`theme.midnight`, `title.supporter`).
//
// Access rules, in order:
//   • Free items          → always owned.
//   • Titles              → earned only; never unlocked by any subscription.
//   • Lifetime            → owns everything else.
//   • Pro                 → owns everything EXCEPT PRO_LOCKED_CATEGORIES
//                           (decoration / effect / world) — those stay paid.
//   • Otherwise           → must be in `owned` (a real purchase / grant).
// Subscriptions never write into `owned`, so it stays a clean "actually
// purchased" signal that survives a lapse.
export const useInventoryStore = defineStore("inventory", () => {
	const owned = ref<Set<string>>(new Set());
	const isLoading = ref(false);

	const isOwned = (itemId?: string): boolean => {
		if (!itemId) return true;
		if (FREE_ITEMS.has(itemId)) return true;

		const category = itemId.split(".")[0] as ItemCategory;
		if (category === "title") return owned.value.has(itemId);

		const sub = useSubscriptionStore();
		if (sub.isLifetime) return true;
		if (sub.isPro && !PRO_LOCKED_CATEGORIES.includes(category)) return true;
		return owned.value.has(itemId);
	};

	const canUse = (itemId?: string): boolean => isOwned(itemId);

	const ownedItemsArray = computed(() => Array.from(owned.value));

	// Populate from a user object — called by auth.store after bootstrap/refresh.
	const hydrateFromUser = (user: { inventory?: string[] } | null) => {
		owned.value = new Set(user?.inventory ?? []);
	};

	// Re-fetch the user and re-hydrate against the webhook-authoritative state.
	const refresh = async () => {
		isLoading.value = true;
		try {
			const authStore = useAuthStore();
			await authStore.refresh();
			hydrateFromUser(authStore.user ?? null);
		} catch (e) {
			console.error("[inventory] refresh failed", e);
		} finally {
			isLoading.value = false;
		}
	};

	// Optimistic grants keep the UI instant after a purchase; the webhook +
	// refresh() reconcile a beat later.
	const grantOptimistic = (items: string[]) => {
		for (const id of items) owned.value.add(id);
	};

	const grantSkuOptimistic = (skuId: string) => {
		grantOptimistic(grantsForSku(skuId));
	};

	// Ask the backend to grant any engagement titles the user now qualifies for
	// (early-tester, supporter). Merges whatever it grants into local state.
	const syncTitles = async (): Promise<string[]> => {
		try {
			const res = await syncTitlesApi();
			const granted = res?.granted ?? [];
			if (granted.length) grantOptimistic(granted);
			return granted;
		} catch (e) {
			console.error("[inventory] title sync failed", e);
			return [];
		}
	};

	const clear = () => {
		owned.value = new Set();
	};

	// Map an item ID back to the SKU that unlocks it — used by pickers to route a
	// tapped locked item to the right shop card. Prefers the direct single SKU,
	// falls back to any bundle that grants it.
	const findSkuForItem = (itemId: string): ShopSku | undefined => {
		const direct = CATALOG_BY_ID[itemId];
		if (direct) return direct;
		return Object.values(CATALOG_BY_ID).find((sku) =>
			sku.grants.includes(itemId),
		);
	};

	return {
		owned,
		isLoading,
		ownedItemsArray,
		isOwned,
		canUse,
		hydrateFromUser,
		refresh,
		grantOptimistic,
		grantSkuOptimistic,
		syncTitles,
		findSkuForItem,
		clear,
	};
});
