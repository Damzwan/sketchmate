import { Browser } from "@capacitor/browser";
import {
	mdiBrush,
	mdiCloudCheckOutline,
	mdiCrownOutline,
	mdiImage,
	mdiLayersTripleOutline,
	mdiMotionPlayOutline,
	mdiPalette,
} from "@mdi/js";
import {
	Purchases,
	type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { LIFETIME_RC_PRODUCT } from "@/config/catalog.config";
import { isNative } from "@/helper/platform.helper";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";

const PRIVACY_URL = "https://sketchmate.ninja/legal";
type PlanId = "monthly" | "yearly" | "lifetime";

const proBullets = [
	// First on purpose: every other perk adds something, this one is the only
	// one that stops the user LOSING something.
	{ label: "Drafts backed up & on all devices", icon: mdiCloudCheckOutline },
	{ label: "All brushes", icon: mdiBrush },
	{ label: "10 layers per drawing", icon: mdiLayersTripleOutline },
	{ label: "6 image references per drawing", icon: mdiImage },
	{ label: "Animated avatar", icon: mdiMotionPlayOutline },
	{ label: "Advanced profile customization", icon: mdiPalette },
	{ label: "VIP lobby slots", icon: mdiCrownOutline },
	{ label: "More posts & balloons", icon: mdiCrownOutline },
];
const cosmeticTypes = ["Themes", "Worlds", "Effects", "Decor", "Fonts", "Text"];
const compare: Array<{
	label: string;
	pro: boolean | string;
	life: boolean | string;
}> = [
	{ label: "Unlock all cosmetics", pro: false, life: true },
	{ label: "Draft backup & cross-device sync", pro: true, life: true },
	{ label: "All brushes", pro: true, life: true },
	{ label: "Layers per drawing", pro: "10", life: "10" },
	{ label: "Images references per drawing", pro: "6", life: "6" },
	{ label: "Animated avatar", pro: true, life: true },
	{ label: "Custom signature & card doodle", pro: true, life: true },
	{ label: "Custom chat background", pro: true, life: true },
	{ label: "VIP lobby slots", pro: true, life: true },
	{ label: "More posts", pro: "6", life: "6" },
	{ label: "More balloons", pro: "5", life: "5" },
];

export function usePaywallController() {
	const subscriptions = useSubscriptionStore();
	const { isPaywallOpen } = storeToRefs(useMenuStore());
	const isPro = computed(() => subscriptions.isPro);
	const monthly = ref<PurchasesPackage>();
	const yearly = ref<PurchasesPackage>();
	const lifetime = ref<PurchasesPackage>();
	const proCycle = ref<"yearly" | "monthly">("yearly");
	const purchasing = ref(false);
	const selectOpen = ref(false);
	const selectedPlan = ref<PlanId>("yearly");

	const selectedProPkg = computed(() =>
		proCycle.value === "yearly" ? yearly.value : monthly.value,
	);
	const yearlyDiscount = computed(() => {
		const monthlyPrice = monthly.value?.product.price;
		const yearlyPrice = yearly.value?.product.price;
		if (!monthlyPrice || !yearlyPrice) return null;
		const discount = Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
		return discount > 0 ? discount : null;
	});

	async function loadPackages() {
		if (!isNative()) {
			if (import.meta.env.DEV) {
				monthly.value = mockPackage("sm_pro_monthly", "MONTHLY", 2.99, "$2.99");
				yearly.value = mockPackage("sm_pro_yearly", "ANNUAL", 19.99, "$19.99");
				lifetime.value = mockPackage(
					LIFETIME_RC_PRODUCT,
					"LIFETIME",
					39.99,
					"$39.99",
				);
			}
			return;
		}
		try {
			const offerings = await Purchases.getOfferings();
			const packages = offerings.all.paywall_items?.availablePackages ?? [];
			monthly.value = packages.find((item) => item.packageType === "MONTHLY");
			yearly.value = packages.find((item) => item.packageType === "ANNUAL");
			lifetime.value =
				packages.find(
					(item) => item.product.identifier === LIFETIME_RC_PRODUCT,
				) ?? packages.find((item) => item.packageType === "LIFETIME");
		} catch (error) {
			console.error("[paywall] failed to load offerings", error);
		}
	}

	watch(
		isPaywallOpen,
		(open) => {
			if (!open) return;
			if (isPro.value) selectedPlan.value = "lifetime";
			if (!monthly.value && !yearly.value && !lifetime.value)
				void loadPackages();
		},
		{ immediate: true },
	);

	async function buyPackage(pkg?: PurchasesPackage) {
		if (!pkg || purchasing.value) return false;
		purchasing.value = true;
		try {
			return await subscriptions.purchaseSubscription(pkg);
		} finally {
			purchasing.value = false;
		}
	}

	const planOptions = computed(() => {
		const options: Array<{
			id: PlanId;
			title: string;
			sub: string;
			price: string;
			badge?: string;
		}> = [];
		if (yearly.value && !isPro.value)
			options.push({
				id: "yearly",
				title: "Yearly",
				sub: "Billed once a year",
				price: yearly.value.product.priceString,
				badge: yearlyDiscount.value
					? `Save ${yearlyDiscount.value}%`
					: "Best value",
			});
		if (monthly.value && !isPro.value)
			options.push({
				id: "monthly",
				title: "Monthly",
				sub: "Billed monthly",
				price: monthly.value.product.priceString,
			});
		if (lifetime.value)
			options.push({
				id: "lifetime",
				title: "Lifetime",
				sub: "One-time · forever yours",
				price: lifetime.value.product.priceString,
			});
		return options;
	});
	const selectedPkg = computed(() => {
		if (selectedPlan.value === "yearly") return yearly.value;
		if (selectedPlan.value === "monthly") return monthly.value;
		return lifetime.value;
	});

	async function buy() {
		if (await buyPackage(selectedPkg.value)) selectOpen.value = false;
	}

	return {
		PRIVACY_URL,
		proBullets,
		cosmeticTypes,
		compare,
		isPaywallOpen,
		subStore: subscriptions,
		isPro,
		monthly,
		yearly,
		lifetime,
		proCycle,
		yearlyDiscount,
		selectedProPkg,
		purchasing,
		selectOpen,
		selectedPlan,
		planOptions,
		selectedPkg,
		buyCycle: () => buyPackage(selectedProPkg.value),
		buyLifetime: () => buyPackage(lifetime.value),
		buy,
		close: () => (isPaywallOpen.value = false),
		openLink: (url: string) => void Browser.open({ url }),
	};
}

function mockPackage(
	id: string,
	type: string,
	price: number,
	priceString: string,
): PurchasesPackage {
	return {
		identifier: id,
		packageType: type,
		product: { identifier: id, price, priceString },
	} as unknown as PurchasesPackage;
}
