import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSubscriptionStore } from "./subscription.store";
import { useAuthStore } from "./auth.store";
import {
	CATALOG_BY_ID,
	FREE_ITEMS,
	grantsForSku,
	type ShopSku,
} from "@/config/catalog.config";

/**
 * Single source of truth for "does this user own item X?"
 *
 * Item IDs use the dotted convention: `theme.midnight`, `brush.neon`, etc.
 * Picker modals never deal with SKUs — they ask `isOwned("theme.midnight")`.
 *
 * Pro users short-circuit to `true` on everything. We don't auto-fill
 * inventory for Pro because we want a clean "user actually purchased item X"
 * signal independent of subscription state (Pro can lapse, individual
 * purchases don't).
 */
export const useInventoryStore = defineStore("inventory", () => {
	const owned = ref<Set<string>>(new Set());
	const isLoading = ref(false);

	// ─── Reads ───────────────────────────────────────────────────────────────
	const isOwned = (itemId?: string): boolean => {
		if (!itemId) return true; // empty/undefined = default state
		if (FREE_ITEMS.has(itemId)) return true;
		const subStore = useSubscriptionStore();
		if (subStore.isPro) return true;
		return owned.value.has(itemId);
	};

	const ownedItemsArray = computed(() => Array.from(owned.value));

	/** Whether the user can apply this item RIGHT NOW (Pro or purchased). */
	const canUse = (itemId?: string): boolean => isOwned(itemId);

	// ─── Hydration ───────────────────────────────────────────────────────────
	/**
	 * Populate from a user object. Called from `auth.store.bootstrap` after
	 * `getUser({ auth_id })` resolves, and from `auth.store.refresh` after a
	 * re-fetch.
	 */
	const hydrateFromUser = (user: { inventory?: string[] } | null) => {
		owned.value = new Set(user?.inventory ?? []);
	};

	/**
	 * Re-fetch the user via auth store and re-hydrate. Used after a purchase
	 * to reconcile with the webhook-authoritative state.
	 */
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

	// ─── Optimistic mutations ────────────────────────────────────────────────
	/**
	 * Optimistically mark items as owned right after a successful
	 * `Purchases.purchasePackage` call. The webhook is the authoritative
	 * source, but this keeps the UI feeling instant. A `refresh()` runs a
	 * beat later to reconcile.
	 */
	const grantOptimistic = (items: string[]) => {
		for (const id of items) owned.value.add(id);
	};

	/** Convenience: optimistically grant everything a SKU unlocks. */
	const grantSkuOptimistic = (skuId: string) => {
		grantOptimistic(grantsForSku(skuId));
	};

	// ─── Clearing ────────────────────────────────────────────────────────────
	/** Wipe inventory state. Call from `auth.logout`. */
	const clear = () => {
		owned.value = new Set();
	};

	// ─── Catalog convenience ─────────────────────────────────────────────────
	/**
	 * Find the SKU that unlocks a specific item ID. Picker modals use this
	 * to route a user to the right shop card when they tap a locked item.
	 *
	 * Prefers the direct single SKU (e.g. `theme.midnight`); falls back to
	 * any bundle that grants it.
	 */
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
		findSkuForItem,
		clear,
	};
});
