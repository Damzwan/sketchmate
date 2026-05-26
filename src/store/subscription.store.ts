import { defineStore } from "pinia";
import { ref } from "vue";
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
} from "@/config/catalog.config";

export const useSubscriptionStore = defineStore("subscription", () => {
	const isPro = ref(false);
	const isLoading = ref(true);
	const showConfetti = ref(false);

	async function syncWithBackend(status: boolean) {
		try {
			const tier = status ? "pro" : "free";
			await updateProfile({ subscription_tier: tier });
		} catch (e) {
			console.error("Failed to sync subscription tier to backend", e);
		}
	}

	async function checkProStatus() {
		if (!isNative()) {
			isLoading.value = false;
			return;
		}

		isLoading.value = true;
		try {
			const { customerInfo } = await Purchases.getCustomerInfo();
			const active =
				typeof customerInfo.entitlements.active[PRO_ENTITLEMENT] !==
				"undefined";

			if (active !== isPro.value) {
				isPro.value = active;
				await syncWithBackend(active);
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

	async function presentPaywall(): Promise<boolean> {
		if (!isNative()) {
			const { toast } = useToast();
			toast("Pro features are currently available only on the mobile app! 📱", {
				color: "warning",
			});
			return false;
		}
		trackEvent(mixpanelEvents.presentPaywall);

		const offerings = await Purchases.getOfferings();
		const specificOffering = offerings.all["paywall_items"];
		const { result } = await RevenueCatUI.presentPaywall({
			offering: specificOffering,
		});

		const successStates = [PAYWALL_RESULT.PURCHASED, PAYWALL_RESULT.RESTORED];
		const isSuccess = successStates.includes(result);

		if (isSuccess) {
			showConfetti.value = true;
			isPro.value = true;
			await syncWithBackend(true);
		} else {
			await checkProStatus();
		}

		return isSuccess;
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

			// trackEvent(mixpanelEvents.shopPurchaseAttempt, { sku: skuId });

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

			// Optimistic update — UI feels instant
			const inventoryStore = useInventoryStore();
			inventoryStore.grantOptimistic(grantsForSku(skuId));

			// Reconcile with backend after webhook has a chance to fire (~2-3s)
			setTimeout(() => {
				void inventoryStore.refresh();
			}, 3000);

			// trackEvent(mixpanelEvents.shopPurchaseSuccess, { sku: skuId });
			showConfetti.value = true;

			const { toast } = useToast();
			toast(`Unlocked ${sku.name}! 🎉`, { color: "success" });

			return true;
		} catch (e: any) {
			if (!e.userCancelled) {
				console.error("[purchaseSku] error", e);
				const { toast } = useToast();
				toast("Purchase failed. Please try again.", { color: "danger" });
				// trackEvent(mixpanelEvents.shopPurchaseFailed, {
				// 	sku: skuId,
				// 	error: e.message,
				// });
			}
			return false;
		}
	}

	function clearSubscriptionState() {
		isPro.value = false;
	}

	async function manageSubscription() {
		try {
			await RevenueCatUI.presentCustomerCenter();
			await checkProStatus();
		} catch (error) {
			console.error("Error opening Customer Center", error);
		}
	}

	return {
		isPro,
		isLoading,
		checkProStatus,
		clearSubscriptionState,
		presentPaywall,
		purchaseSku,
		manageSubscription,
		showConfetti,
	};
});
