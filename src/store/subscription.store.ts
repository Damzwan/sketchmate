import {
	type CustomerInfo,
	Purchases,
	type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { RevenueCatUI } from "@revenuecat/purchases-capacitor-ui";
import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import {
	CATALOG_BY_ID,
	grantsForSku,
	LIFETIME_ENTITLEMENT,
	LIFETIME_RC_PRODUCT,
	PRO_ENTITLEMENT,
} from "@/config/catalog.config";
import { useShareToastStore } from "@/draw/sharing/shareToast.store";
import { isNative } from "@/helper/platform.helper";
import { updateProfile } from "@/service/api/user.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import { useOverlayRuntimeStore } from "@/store/overlayRuntime.store";
import { useQuotaStore } from "@/store/quota.store";

/**
 * Subscription + shop-purchase store.
 *
 * Owns the user's paid state (`isPro` / `isLifetime`), read from RevenueCat on
 * native and from the user's `subscription_tier` on web. Also drives the two
 * purchase flows: the RC paywall (Pro / Lifetime) and one-off shop SKUs.
 * Inventory items live in the inventory store — this store only grants them
 * optimistically and lets the webhook reconcile.
 */
// Lazy: this store is eager (App.vue reads `showConfetti`), the billing helper
// isn't needed until something asks about entitlements, and the cold-start
// budget is tight. Resolves from cache after the first call.
const billing = () => import("@/helper/billing.helper");

type Tier = "free" | "pro" | "lifetime";

/**
 * Last CONFIRMED tier, cached so the first frame paints the entitlement the
 * user actually has.
 *
 * RC's answer needs configure + logIn + a network read, and the web path waits
 * on auth init. Until then `isPro` was plainly `false`, so every Pro user saw
 * the free UI (VIP badges on public lobbies, locked draft slots) flash before
 * it corrected itself. Written only from a read taken under a confirmed
 * identity, cleared on logout — never a way to grant Pro, only a way to avoid
 * unpainting it.
 */
const TIER_CACHE_KEY = "sm_tier_cache";

function readTierCache(): Tier | null {
	try {
		const raw = localStorage.getItem(TIER_CACHE_KEY);
		return raw === "pro" || raw === "lifetime" || raw === "free" ? raw : null;
	} catch {
		return null;
	}
}

function writeTierCache(tier: Tier): void {
	try {
		localStorage.setItem(TIER_CACHE_KEY, tier);
	} catch {
		// Private mode or a full quota. Next launch just flashes as before.
	}
}

export const useSubscriptionStore = defineStore("subscription", () => {
	// ─── Paid state ──────────────────────────────────────────────────────────
	const cachedTier = readTierCache();
	const isPro = ref(cachedTier === "pro" || cachedTier === "lifetime");
	const isLifetime = ref(cachedTier === "lifetime");
	const isLoading = ref(true);
	/**
	 * True once the paid state is safe to render gating off — either the cache
	 * answered synchronously or a live read has landed. UI that would otherwise
	 * flash the wrong tier renders a neutral state while this is false.
	 */
	const isTierResolved = ref(cachedTier !== null);
	// Toggled true after any successful purchase; drives the Confetti overlay.
	const { confettiVisible: showConfetti } = storeToRefs(
		useOverlayRuntimeStore(),
	);
	const pendingSupporterToast = ref(false);

	watch(showConfetti, (visible, wasVisible) => {
		if (wasVisible && !visible && pendingSupporterToast.value) {
			pendingSupporterToast.value = false;
			useShareToastStore().pushTitleToast("title.supporter");
		}
	});

	async function syncWithBackend(tier: Tier) {
		try {
			await updateProfile({ subscription_tier: tier });
			// Mirror it locally so the next `checkProStatus` compares against what
			// the backend now holds instead of re-PUTing the same value forever.
			const { user } = useAuthStore();
			if (user) user.subscription_tier = tier;
		} catch (e) {
			console.error("Failed to sync subscription tier to backend", e);
		}
	}

	function currentTier(): Tier {
		return isLifetime.value ? "lifetime" : isPro.value ? "pro" : "free";
	}

	function applyCustomerInfo(customerInfo: CustomerInfo) {
		const ent = customerInfo.entitlements.active;
		const lifetime =
			typeof ent[LIFETIME_ENTITLEMENT] !== "undefined" ||
			customerInfo.nonSubscriptionTransactions.some(
				(t) => t.productIdentifier === LIFETIME_RC_PRODUCT,
			);

		isLifetime.value = lifetime;
		isPro.value = lifetime || typeof ent[PRO_ENTITLEMENT] !== "undefined";
		markTierResolved();
	}

	/** Mark the live read authoritative and cache it for the next cold start. */
	function markTierResolved() {
		isTierResolved.value = true;
		writeTierCache(currentTier());
	}

	/**
	 * Push the tier we just read from RC back to our own backend.
	 *
	 * Compares against what the BACKEND holds, not against the previous local
	 * refs. Those init to false, so a refunded subscriber came back from RC as
	 * "not pro", matched the local default, and the sync never fired — leaving
	 * `subscription_tier: 'pro'` in the DB and Pro quotas with it.
	 *
	 * Only ever called with entitlements read under a confirmed identity: writing
	 * a tier derived from an unidentified or failed read is how a real subscriber
	 * got PUT back down to `free` on every login.
	 */
	async function reconcileTier(force = false) {
		const { waitUntilInitialized } = useAuthStore();
		await waitUntilInitialized();
		const { user } = useAuthStore();
		if (!user) return;

		const tier = currentTier();
		if (tier === (user.subscription_tier ?? "free") && !force) return;

		await syncWithBackend(tier);
		const quotaStore = useQuotaStore();
		void quotaStore.refresh(true);
	}

	async function checkProStatus(force = false) {
		if (!isNative()) {
			isLoading.value = false;
			const { waitUntilInitialized } = useAuthStore();
			await waitUntilInitialized();
			const { user } = useAuthStore();
			isLifetime.value = user?.subscription_tier === "lifetime";
			isPro.value = isLifetime.value || user?.subscription_tier === "pro";
			if (user) markTierResolved();
			return;
		}

		isLoading.value = true;
		try {
			// RC must be configured AND pointed at this account before its answer
			// means anything — an early read returns the anonymous customer, whose
			// entitlement set is empty.
			const identified = await (await billing()).waitForBilling();

			const { customerInfo } = await Purchases.getCustomerInfo();
			applyCustomerInfo(customerInfo);

			if (identified) await reconcileTier(force);
		} catch (e) {
			// Leave the paid state as-is. A failed read is not evidence of "free",
			// and clearing it here downgraded subscribers mid-session.
			console.error("Error fetching customer info from RevenueCat", e);
		} finally {
			isLoading.value = false;
		}
	}

	// RC pushes entitlement changes it learns about on its own — renewals,
	// expiries, Play-side refunds, purchases made on another device. Without this
	// the app only ever saw them on the next cold start.
	if (isNative()) {
		void billing().then(({ isBillingIdentified, onCustomerInfoUpdate }) => {
			onCustomerInfoUpdate((info) => {
				// Updates that arrive before the account's logIn lands describe the
				// anonymous customer. Ignore them; `checkProStatus` reads once identity
				// has settled.
				if (!isBillingIdentified()) return;
				applyCustomerInfo(info);
				void reconcileTier();
			});
		});
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

	function resetRuntimeState() {
		isPro.value = false;
		isLifetime.value = false;
		isTierResolved.value = false;
		// Logout: the next account on this device must not inherit this one's tier.
		try {
			localStorage.removeItem(TIER_CACHE_KEY);
		} catch {}
		showConfetti.value = false;
		pendingSupporterToast.value = false;
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
		isTierResolved,
		checkProStatus,
		resetRuntimeState,
		openPaywall,
		purchaseSubscription,
		purchaseSku,
		manageSubscription,
		restorePurchases,
		showConfetti,
	};
});
