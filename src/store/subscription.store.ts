import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
	Purchases,
	type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { isNative } from "@/helper/general.helper";
import {
	PAYWALL_RESULT,
	RevenueCatUI,
} from "@revenuecat/purchases-capacitor-ui";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { updateProfile } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useQuotaStore } from "@/store/quota.store";
import { useInventoryStore } from "@/store/inventory.store";
import {
	CATALOG_BY_ID,
	grantsForSku,
	PRO_ENTITLEMENT,
	LIFETIME_ENTITLEMENT,
	LIFETIME_RC_PRODUCT,
} from "@/config/catalog.config";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useShareToastStore } from "@/draw/store/useShareToastStore.store";

/**
 * Subscription + shop-purchase store.
 *
 * Owns the user's paid state (`isPro` / `isLifetime`), read from RevenueCat on
 * native and from the user's `subscription_tier` on web. Also drives the two
 * purchase flows: the RC paywall (Pro / Lifetime) and one-off shop SKUs.
 * Inventory items live in the inventory store — this store only grants them
 * optimistically and lets the webhook reconcile.
 */
export const useSubscriptionStore = defineStore("subscription", () => {
	// ─── Paid state ──────────────────────────────────────────────────────────
	const isPro = ref(false);
	const isLifetime = ref(false);
	const isLoading = ref(true);
	// Toggled true after any successful purchase; drives the Confetti overlay.
	const showConfetti = ref(false);
	const pendingSupporterToast = ref(false);

	watch(showConfetti, (visible, wasVisible) => {
		if (wasVisible && !visible && pendingSupporterToast.value) {
			pendingSupporterToast.value = false;
			useShareToastStore().pushTitleToast("title.supporter");
		}
	});

	type Tier = "free" | "pro" | "lifetime";

	async function syncWithBackend(tier: Tier) {
		try {
			await updateProfile({ subscription_tier: tier });
		} catch (e) {
			console.error("Failed to sync subscription tier to backend", e);
		}
	}

	function currentTier(): Tier {
		return isLifetime.value ? "lifetime" : isPro.value ? "pro" : "free";
	}

	async function checkProStatus(force = false) {
		if (!isNative()) {
			isLoading.value = false;
			const { waitUntilInitialized } = useAuthStore();
			await waitUntilInitialized();
			const { user } = useAuthStore();
			isLifetime.value = user?.subscription_tier === "lifetime";
			isPro.value = isLifetime.value || user?.subscription_tier === "pro";
			return;
		}

		isLoading.value = true;
		try {
			const { customerInfo } = await Purchases.getCustomerInfo();
			const ent = customerInfo.entitlements.active;
			const lifetime =
				typeof ent[LIFETIME_ENTITLEMENT] !== "undefined" ||
				customerInfo.nonSubscriptionTransactions.some(
					(t) => t.productIdentifier === LIFETIME_RC_PRODUCT,
				);
			const active = lifetime || typeof ent[PRO_ENTITLEMENT] !== "undefined";

			const changed = active !== isPro.value || lifetime !== isLifetime.value;
			isLifetime.value = lifetime;
			isPro.value = active;
			if (changed || force) {
				await syncWithBackend(currentTier());
				const quotaStore = useQuotaStore();
				void quotaStore.refresh(true);
			}
		} catch (e) {
			console.error("Error fetching customer info from RevenueCat", e);
			isPro.value = false;
		} finally {
			isLoading.value = false;
		}
	}

	// ─── Individual SKU purchase ─────────────────────────────────────────────
	/**
	 * Buy a non-subscription SKU (brush, theme, pack, etc).
	 *
	 * Flow:
	 *   1. Find the RC package for this SKU's product ID
	 *   2. Trigger purchase
	 *   3. On success: optimistically grant items to inventory store
	 *      (webhook will be authoritative within seconds)
	 *   4. Refresh inventory from backend a beat later to reconcile
	 */
	async function purchaseSku(skuId: string): Promise<boolean> {
		if (!isNative()) {
			const { toast } = useToast();
			toast("Purchases are only available on the mobile app! 📱", {
				color: "warning",
			});
			return false;
		}

		const sku = CATALOG_BY_ID[skuId];
		if (!sku) {
			console.error(`[purchaseSku] Unknown SKU: ${skuId}`);
			return false;
		}

		try {
			const offerings = await Purchases.getOfferings();

			// Search ALL offerings, not just current, in case shop items live
			// in a separate offering like "shop_items"
			let pkg: PurchasesPackage | undefined;
			for (const offeringKey of Object.keys(offerings.all)) {
				const offering = offerings.all[offeringKey];
				pkg = offering.availablePackages.find(
					(p) => p.product.identifier === sku.rcProductId,
				);
				if (pkg) break;
			}

			if (!pkg) {
				const { toast } = useToast();
				toast("This item isn't available right now.", { color: "warning" });
				console.error(
					`[purchaseSku] No RC package for product: ${sku.rcProductId}`,
				);
				return false;
			}

			const { customerInfo } = await Purchases.purchasePackage({
				aPackage: pkg,
			});

			// Verify the transaction actually went through (RC can return
			// customerInfo even if user cancelled in some edge cases)
			const txExists = customerInfo.nonSubscriptionTransactions.some(
				(t) => t.productIdentifier === sku.rcProductId,
			);

			if (!txExists) {
				// Could be a Pro entitlement purchase that doesn't appear here —
				// fall through to inventory refresh anyway
				console.warn(
					`[purchaseSku] No matching tx in customerInfo for ${sku.rcProductId}`,
				);
			}

			// Optimistic update — UI feels instant. Any purchase also earns the
			// Supporter title (backend reconciles via webhook + title sync).
			const inventoryStore = useInventoryStore();
			const hadSupporter = inventoryStore.isOwned("title.supporter");
			inventoryStore.grantOptimistic([
				...grantsForSku(skuId),
				"title.supporter",
			]);
			if (!hadSupporter) pendingSupporterToast.value = true;

			// Reconcile with backend after webhook has a chance to fire (~2-3s)
			setTimeout(() => {
				void inventoryStore.refresh();
			}, 3000);

			showConfetti.value = true;

			const { toast } = useToast();
			toast(`Unlocked ${sku.name}! 🎉`, { color: "success" });

			return true;
		} catch (e: any) {
			if (!e.userCancelled) {
				console.error("[purchaseSku] error", e);
				const { toast } = useToast();
				toast("Purchase failed. Please try again.", { color: "danger" });
			}
			return false;
		}
	}

	function clearSubscriptionState() {
		isPro.value = false;
		isLifetime.value = false;
	}

	async function manageSubscription() {
		try {
			await RevenueCatUI.presentCustomerCenter();
			await checkProStatus();
		} catch (error) {
			console.error("Error opening Customer Center", error);
		}
	}

	// Re-syncs entitlements from the store (e.g. new device / reinstall). The one
	// useful action for a Lifetime owner, without the Customer Center maze.
	async function restorePurchases(): Promise<boolean> {
		const { toast } = useToast();

		if (!isNative()) {
			toast("Restore is only available on the mobile app! 📱", {
				color: "warning",
			});
			return false;
		}
		try {
			await Purchases.restorePurchases();
			await checkProStatus(true);
			await useInventoryStore().refresh();
			// Always confirm — an already-active Lifetime restores to no visible
			// change, so without this the button feels dead.
			toast("Purchases restored", { color: "success" });
			return true;
		} catch (error) {
			console.error("Error restoring purchases", error);
			toast("Could not restore purchases", { color: "danger" });
			return false;
		}
	}

	// ─── Custom paywall ──────────────────────────────────────────────────────
	// Opens our own branded PaywallModal.vue instead of RC's templated UI. Web
	// has no store, so fall back to a toast like the other purchase entries.
	function openPaywall() {
		// Web has no store — but in dev we still open it (with mock prices) so the
		// paywall UI can be verified in the browser.
		if (!isNative() && import.meta.env.VITE_ENVIRONMENT !== "prod") {
			const { toast } = useToast();
			toast("Pro is available on the mobile app! 📱", { color: "warning" });
			return;
		}
		trackEvent(mixpanelEvents.presentPaywall);
		useMenuStore().isPaywallOpen = true;
	}

	// Buy a subscription / lifetime package picked in the custom paywall. Mirrors
	// the RC-paywall success path: confetti, optimistic Supporter, reconcile tier,
	// then close the modal.
	async function purchaseSubscription(pkg: PurchasesPackage): Promise<boolean> {
		if (!isNative()) {
			const { toast } = useToast();
			if (import.meta.env.DEV) {
				toast("Paywall test (web) — no real purchase", { color: "warning" });
			} else {
				toast("Pro is available on the mobile app! 📱", { color: "warning" });
			}
			return false;
		}
		try {
			const inventoryStore = useInventoryStore();
			const hadSupporter = inventoryStore.isOwned("title.supporter");
			await Purchases.purchasePackage({ aPackage: pkg });
			showConfetti.value = true;
			isPro.value = true;
			inventoryStore.grantOptimistic(["title.supporter"]);
			if (!hadSupporter) pendingSupporterToast.value = true;
			await checkProStatus(true);
			useMenuStore().isPaywallOpen = false;
			return true;
		} catch (e: any) {
			if (!e.userCancelled) {
				console.error("[purchaseSubscription] error", e);
				const { toast } = useToast();
				toast("Purchase failed. Please try again.", { color: "danger" });
			}
			return false;
		}
	}

	return {
		isPro,
		isLifetime,
		isLoading,
		checkProStatus,
		clearSubscriptionState,
		openPaywall,
		purchaseSubscription,
		purchaseSku,
		manageSubscription,
		restorePurchases,
		showConfetti,
	};
});
