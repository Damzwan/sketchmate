import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSubscriptionStore } from "./subscription.store";
import { useAuthStore } from "./auth.store";
import {
	CATALOG_BY_ID,
	FREE_ITEMS,
	PRO_UNLOCKED_CATEGORIES,
	grantsForSku,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";

const DEV_UNLOCK_ALL = true;

export const useInventoryStore = defineStore("inventory", () => {
	const owned = ref<Set<string>>(new Set());
	// Items granted optimistically after a purchase that the server hasn't
	// confirmed yet. Kept sticky across hydrate/refresh so a slow purchase
	// webhook (bundles especially) can't visually revert a just-bought item —
	// each id is dropped from here the moment the server inventory includes it.
	const optimisticGrants = ref<Set<string>>(new Set());
	const isLoading = ref(false);
	// True once we've populated from a real user object at least once — the shop
	// gates its content on this so it never flashes "unowned"/upsell before load.
	const hydrated = ref(false);

	const DEV = import.meta.env.DEV;
	const devUnlockAll = ref(
		DEV && localStorage.getItem("dev_unlock_all") === "1",
	);
	const setDevUnlockAll = (on: boolean) => {
		if (!DEV) return;
		devUnlockAll.value = on;
		localStorage.setItem("dev_unlock_all", on ? "1" : "0");
	};

	// Ownership resolution order: free ships-with-app → titles (inventory only,
	// never sub-unlocked) → Lifetime (everything) → Pro (only the categories in
	// PRO_UNLOCKED_CATEGORIES) → finally the purchased-inventory set.
	const isOwned = (itemId?: string): boolean => {
		if (!itemId) return true;
		if (devUnlockAll.value) return true; // DEV-only local unlock (see above)
		if (FREE_ITEMS.has(itemId)) return true;

		const category = itemId.split(".")[0] as ItemCategory;
		if (category === "title") return owned.value.has(itemId);

		const sub = useSubscriptionStore();
		if (sub.isLifetime) return true;
		if (sub.isPro && PRO_UNLOCKED_CATEGORIES.includes(category)) return true;
		return owned.value.has(itemId);
	};

	const canUse = (itemId?: string): boolean => isOwned(itemId);

	const ownedItemsArray = computed(() => Array.from(owned.value));

	// Populate from a user object — called by auth.store after bootstrap/refresh.
	const hydrateFromUser = (user: { inventory?: string[] } | null) => {
		const server = new Set(user?.inventory ?? []);
		// Fold in any still-unconfirmed optimistic grants; drop the ones the
		// server now vouches for (webhook landed) so nothing stays phantom.
		for (const id of optimisticGrants.value) {
			if (server.has(id)) optimisticGrants.value.delete(id);
			else server.add(id);
		}
		owned.value = server;
		hydrated.value = true;
		setDevUnlockAll(DEV_UNLOCK_ALL);
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
	// refresh() reconcile a beat later. Tracked as sticky (see optimisticGrants)
	// so a slow webhook can't drop them on the next hydrate.
	const grantOptimistic = (items: string[]) => {
		for (const id of items) {
			owned.value.add(id);
			optimisticGrants.value.add(id);
		}
	};

	const grantSkuOptimistic = (skuId: string) => {
		grantOptimistic(grantsForSku(skuId));
	};

	const clear = () => {
		owned.value = new Set();
		optimisticGrants.value = new Set();
		hydrated.value = false;
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
		hydrated,
		ownedItemsArray,
		isOwned,
		canUse,
		hydrateFromUser,
		refresh,
		grantOptimistic,
		grantSkuOptimistic,
		findSkuForItem,
		clear,
		devUnlockAll,
		setDevUnlockAll,
	};
});
