import { Purchases } from "@revenuecat/purchases-capacitor";
import { storeToRefs } from "pinia";
import { computed, nextTick, type Ref, ref, watch } from "vue";
import {
	CATALOG,
	CATALOG_BY_ID,
	HIGHLIGHT_IDS,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";
import { isNative } from "@/helper/platform.helper";
import { updateProfile } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";

type CategoryFilter = ItemCategory | "all";
const CHAT_CATEGORIES = new Set<ItemCategory>(["theme", "font", "font_effect"]);
const ALL_CATEGORIES: { id: CategoryFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "theme", label: "Themes" },
	{ id: "world", label: "Worlds" },
	{ id: "effect", label: "Effects" },
	{ id: "decoration", label: "Decor" },
	{ id: "font", label: "Fonts" },
	{ id: "font_effect", label: "Text" },
	{ id: "brush", label: "Brushes" },
];

export function useShopPageController(previewSku: Ref<ShopSku | null>) {
	const menu = useMenuStore();
	const subscriptions = useSubscriptionStore();
	const inventory = useInventoryStore();
	const auth = useAuthStore();
	const { toast } = useToast();
	const { isShopOpen, shopScrollTarget, shopEquipTarget } = storeToRefs(menu);
	const user = computed(() => auth.user);
	const isLoading = ref(true);
	const skusWithPrices = ref<
		Record<string, ShopSku & { priceString?: string; rcPackage?: any }>
	>({});
	const highlightedId = ref<string | null>(null);
	const collectionOpen = ref(false);
	const activeCategory = ref<CategoryFilter>("all");
	const ready = computed(
		() => !isLoading.value && !subscriptions.isLoading && inventory.hydrated,
	);

	const withPrice = (sku: ShopSku) => skusWithPrices.value[sku.id] || sku;
	const isChatCompatible = (sku: ShopSku) =>
		sku.kind === "bundle"
			? sku.grants.every((grant) =>
					CHAT_CATEGORIES.has(grant.split(".")[0] as ItemCategory),
				)
			: CHAT_CATEGORIES.has(sku.category);
	const visibleCatalog = computed(() =>
		shopEquipTarget.value === "chat"
			? CATALOG.filter(isChatCompatible)
			: CATALOG,
	);
	const featuredPacks = computed(() =>
		visibleCatalog.value
			.filter((sku) => sku.kind === "bundle" && sku.featured)
			.map(withPrice),
	);
	const highlights = computed(() =>
		HIGHLIGHT_IDS.map((id) => CATALOG_BY_ID[id])
			.filter(
				(sku): sku is ShopSku =>
					!!sku && (shopEquipTarget.value !== "chat" || isChatCompatible(sku)),
			)
			.map(withPrice),
	);

	function priceOf(id: string): number | null {
		const priced = skusWithPrices.value[id];
		const revenueCatPrice = priced?.rcPackage?.product?.price;
		if (typeof revenueCatPrice === "number" && revenueCatPrice > 0)
			return revenueCatPrice;
		const parsed = Number(priced?.priceString?.replace(/[^0-9.]/g, ""));
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}

	function bundleSavingsPct(pack: ShopSku) {
		const bundlePrice = priceOf(pack.id);
		if (!bundlePrice) return 0;
		let separatePrice = 0;
		for (const grant of pack.grants) {
			const price = priceOf(grant);
			if (!price) return 0;
			separatePrice += price;
		}
		return separatePrice > bundlePrice
			? Math.round((1 - bundlePrice / separatePrice) * 100)
			: 0;
	}

	const categories = computed(() =>
		shopEquipTarget.value === "chat"
			? ALL_CATEGORIES.filter(
					(category) =>
						category.id === "all" ||
						CHAT_CATEGORIES.has(category.id as ItemCategory),
				)
			: ALL_CATEGORIES,
	);
	const shuffledSingleIds = shuffle(
		CATALOG.filter((sku) => sku.kind === "single").map((sku) => sku.id),
	);
	const activeItems = computed(() => {
		if (activeCategory.value === "all") {
			return shuffledSingleIds
				.map((id) => CATALOG_BY_ID[id])
				.filter(
					(sku) => shopEquipTarget.value !== "chat" || isChatCompatible(sku),
				)
				.map(withPrice);
		}
		return visibleCatalog.value
			.filter(
				(sku) => sku.kind === "single" && sku.category === activeCategory.value,
			)
			.map(withPrice);
	});
	const ownedSkus = computed(() =>
		CATALOG.filter(
			(sku) => sku.kind === "single" && inventory.owned.has(sku.id),
		),
	);
	const isItemOwned = (id: string) => {
		const sku = CATALOG_BY_ID[id];
		if (!sku) return false;
		return sku.kind === "bundle"
			? sku.grants.every((grant) => inventory.isOwned(grant))
			: inventory.isOwned(sku.id);
	};

	function closeShop() {
		isShopOpen.value = false;
		highlightedId.value = null;
		shopEquipTarget.value = "profile";
	}

	async function loadOfferings() {
		if (!isNative()) {
			skusWithPrices.value = Object.fromEntries(
				CATALOG.map((sku) => [
					sku.id,
					{
						...sku,
						priceString: sku.kind === "bundle" ? "$4.99" : "$1.99",
					},
				]),
			);
			isLoading.value = false;
			return;
		}
		try {
			isLoading.value = true;
			const offerings = await Purchases.getOfferings();
			const packages = offerings.all.shop_items?.availablePackages ?? [];
			skusWithPrices.value = Object.fromEntries(
				CATALOG.map((sku) => {
					const rcPackage = packages.find(
						(item) => item.product.identifier === sku.rcProductId,
					);
					return [
						sku.id,
						{
							...sku,
							priceString: rcPackage?.product.priceString,
							rcPackage,
						},
					];
				}),
			);
		} catch {
			toast("Could not load shop prices", { color: "danger" });
		} finally {
			isLoading.value = false;
		}
	}

	async function purchaseItem(sku: ShopSku) {
		if (await subscriptions.purchaseSku(sku.id)) highlightedId.value = null;
	}

	async function equipSku(patch: Record<string, any>) {
		const currentUser = user.value;
		if (!currentUser || !Object.keys(patch).length) {
			previewSku.value = null;
			return;
		}
		const target = shopEquipTarget.value;
		const supported =
			target === "chat"
				? Object.fromEntries(
						Object.entries(patch).filter(([key]) =>
							["themeId", "fontId", "fontEffectId"].includes(key),
						),
					)
				: patch;
		if (!Object.keys(supported).length) {
			toast("That item is for profiles or drawing tools.");
			return;
		}
		const field = target === "chat" ? "chat_customization" : "customization";
		const previous = { ...((currentUser as any)[field] ?? {}) };
		const next = { ...previous, ...supported };
		(currentUser as any)[field] = next;
		previewSku.value = null;
		try {
			await updateProfile({ [field]: next } as any);
			toast(target === "chat" ? "Equipped to Chat! ✨" : "Equipped! ✨", {
				color: "success",
			});
		} catch {
			(currentUser as any)[field] = previous;
			toast("Couldn't equip that. Please try again.", { color: "danger" });
		}
	}

	watch(
		isShopOpen,
		async (open) => {
			if (!open) return;
			if (
				shopEquipTarget.value === "chat" &&
				activeCategory.value !== "all" &&
				!CHAT_CATEGORIES.has(activeCategory.value)
			) {
				activeCategory.value = "all";
			}
			if (!Object.keys(skusWithPrices.value).length) await loadOfferings();
			const targetId = shopScrollTarget.value;
			if (!targetId) return;
			const targetSku =
				CATALOG_BY_ID[targetId] ??
				CATALOG.find((sku) => sku.grants.includes(targetId));
			shopScrollTarget.value = null;
			if (!targetSku) return;
			if (targetSku.category !== "pack")
				activeCategory.value = targetSku.category;
			highlightedId.value = targetSku.id;
			await nextTick();
			setTimeout(
				() =>
					document
						.querySelector<HTMLElement>(`[data-shop-id="${targetSku.id}"]`)
						?.scrollIntoView({ behavior: "smooth", block: "center" }),
				150,
			);
			setTimeout(() => (highlightedId.value = null), 4000);
		},
		{ immediate: true },
	);

	return {
		subStore: subscriptions,
		isShopOpen,
		shopScrollTarget,
		shopEquipTarget,
		user,
		isLoading,
		ready,
		skusWithPrices,
		highlightedId,
		collectionOpen,
		withPrice,
		visibleCatalog,
		featuredPacks,
		highlights,
		bundleSavingsPct,
		categories,
		activeCategory,
		activeItems,
		ownedSkus,
		isItemOwned,
		closeShop,
		loadOfferings,
		purchaseItem,
		equipSku,
	};
}

function shuffle<T>(items: T[]) {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}
