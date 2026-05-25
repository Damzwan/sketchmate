<template>
  <ion-modal
    :is-open="isShopOpen"
    @didDismiss="closeShop"
    class="full-screen-modal"
  >
    <ion-content class="bg-[#FAE0C2] relative cabin-sketch-regular" ref="contentEl">
      <!-- ─── Sticky header ───────────────────────────────────────────── -->
      <div class="sticky top-0 z-50 px-5 pt-12 pb-3 bg-[#FAE0C2]/95 backdrop-blur-md flex items-center justify-between border-b-2 border-[#B9463A]/10">
        <div class="flex items-baseline gap-2">
          <h1 class="text-3xl font-black text-[#3d1a14] tracking-tighter italic leading-none">
            Shop
          </h1>
          <span class="text-lg">🛍️</span>
        </div>
        <button
          @click="closeShop"
          class="w-10 h-10 bg-[#3d1a14]/8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-xl text-[#3d1a14]/70" />
        </button>
      </div>

      <div class="px-5 pb-32">
        <!-- ─── Hero: Pro / Lifetime ───────────────────────────────────── -->
        <div v-if="!subStore.isPro" class="mt-5 mb-7">
          <div class="grid grid-cols-2 gap-3">
            <!-- Pro card -->
            <button
              class="relative rounded-[2rem] p-4 text-white text-left shadow-xl overflow-hidden active:scale-[0.97] transition-transform group min-h-[180px]"
              style="background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%)"
              @click="subStore.presentPaywall()"
            >
              <div class="absolute -right-8 -top-8 w-32 h-32 bg-white/20 blur-3xl rounded-full"></div>
              <div class="absolute inset-0 grain-bg opacity-30 mix-blend-overlay"></div>

              <div class="relative">
                <div class="text-3xl mb-2">⚡</div>
                <h2 class="text-xl font-black leading-none mb-1 drop-shadow-md">Pro</h2>
                <p class="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-3">Monthly</p>
                <p class="text-xs font-medium text-white/90 leading-snug mb-4">
                  Everything. Forever updating.
                </p>
              </div>

              <div class="absolute bottom-3 right-3 left-3 flex items-center justify-between text-white">
                <span class="text-[10px] font-black uppercase tracking-wider">View</span>
                <ion-icon :icon="svg(mdiArrowRight)" class="text-lg" />
              </div>
            </button>

            <!-- Lifetime card -->
            <button
              class="relative rounded-[2rem] p-4 text-left shadow-xl overflow-hidden active:scale-[0.97] transition-transform min-h-[180px]"
              style="background: linear-gradient(135deg, #fde68a 0%, #d97706 100%)"
              @click="subStore.presentPaywall()"
            >
              <div class="absolute -right-8 -top-8 w-32 h-32 bg-white/30 blur-3xl rounded-full"></div>
              <div class="absolute inset-0 grain-bg opacity-30 mix-blend-overlay"></div>

              <div class="relative text-[#78350f]">
                <div class="text-3xl mb-2">👑</div>
                <h2 class="text-xl font-black leading-none mb-1">Lifetime</h2>
                <p class="text-[10px] font-bold uppercase tracking-widest mb-3 opacity-70">Pay once</p>
                <p class="text-xs font-medium leading-snug mb-4 opacity-90">
                  Own everything. No subs.
                </p>
              </div>

              <div class="absolute bottom-3 right-3 left-3 flex items-center justify-between text-[#78350f]">
                <span class="text-[10px] font-black uppercase tracking-wider">View</span>
                <ion-icon :icon="svg(mdiArrowRight)" class="text-lg" />
              </div>
            </button>
          </div>
        </div>

        <!-- ─── Pro confirmation banner ─────────────────────────────────── -->
        <div
          v-else
          class="mt-5 mb-7 rounded-[2rem] p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg flex items-center gap-4"
        >
          <div class="text-3xl">✨</div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-black leading-none mb-1">You're Pro!</h2>
            <p class="text-xs font-medium opacity-90 leading-tight">
              Every item below is unlocked for you.
            </p>
          </div>
          <button
            class="px-3 py-2 bg-white/20 backdrop-blur-sm rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95"
            @click="subStore.manageSubscription()"
          >
            Manage
          </button>
        </div>

        <!-- ─── Loading skeleton ────────────────────────────────────────── -->
        <div v-if="isLoading" class="flex flex-col gap-6">
          <div class="h-32 bg-[#3d1a14]/5 rounded-[2rem] animate-pulse"></div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="i in 4" :key="i" class="h-44 bg-[#3d1a14]/5 rounded-[2rem] animate-pulse"></div>
          </div>
        </div>

        <template v-else>
          <!-- ─── Featured packs carousel ───────────────────────────────── -->
          <section v-if="featuredPacks.length" class="mb-8" :data-shop-id="'__featured__'">
            <div class="flex items-baseline justify-between mb-3 px-1">
              <h2 class="text-xl font-black text-[#3d1a14] tracking-tight">
                Featured Packs
              </h2>
              <span class="text-[10px] font-black text-[#B9463A] uppercase tracking-widest">
                Best Value
              </span>
            </div>

            <div class="flex overflow-x-auto gap-3 pb-3 snap-x snap-mandatory hide-scrollbar -mx-5 px-5">
              <ShopCardPack
                v-for="pack in featuredPacks"
                :key="pack.id"
                :sku="pack"
                :owned="isItemOwned(pack.id)"
                :data-shop-id="pack.id"
                :highlight="highlightedId === pack.id"
                @purchase="purchaseItem(pack)"
              />
            </div>
          </section>

          <!-- ─── Category tabs ─────────────────────────────────────────── -->
          <div class="sticky top-[88px] z-40 -mx-5 px-5 py-2 bg-[#FAE0C2]/95 backdrop-blur-md mb-4">
            <div class="flex gap-2 overflow-x-auto hide-scrollbar">
              <button
                v-for="cat in categories"
                :key="cat.id"
                class="shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all active:scale-95 border-2"
                :class="
                  activeCategory === cat.id
                    ? 'bg-[#B9463A] text-white border-[#B9463A] shadow-md'
                    : 'bg-white/60 text-[#3d1a14] border-white hover:bg-white/80'
                "
                @click="activeCategory = cat.id"
              >
                {{ cat.icon }} {{ cat.label }}
              </button>
            </div>
          </div>

          <!-- ─── Category content ──────────────────────────────────────── -->
          <section v-if="activeCategory === 'theme'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardTheme
                v-for="sku in themesInCategory"
                :key="sku.id"
                :sku="sku"
                :user="user"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <section v-else-if="activeCategory === 'brush'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardBrush
                v-for="sku in brushesInCategory"
                :key="sku.id"
                :sku="sku"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <section v-else-if="activeCategory === 'decoration'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardDecoration
                v-for="sku in decorationsInCategory"
                :key="sku.id"
                :sku="sku"
                :user="user"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <section v-else-if="activeCategory === 'effect'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardEffect
                v-for="sku in effectsInCategory"
                :key="sku.id"
                :sku="sku"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <section v-else-if="activeCategory === 'font'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardFont
                v-for="sku in fontsInCategory"
                :key="sku.id"
                :sku="sku"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <section v-else-if="activeCategory === 'title'">
            <div class="grid grid-cols-2 gap-3">
              <ShopCardTitle
                v-for="sku in titlesInCategory"
                :key="sku.id"
                :sku="sku"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </section>

          <!-- ─── Your Collection ───────────────────────────────────────── -->
          <section v-if="ownedSkus.length && !subStore.isPro" class="mt-10">
            <div class="flex items-baseline justify-between mb-3 px-1">
              <h2 class="text-lg font-black text-[#3d1a14] tracking-tight">
                Your Collection
              </h2>
              <span class="text-[10px] font-black text-[#3d1a14]/40 uppercase tracking-widest">
                {{ ownedSkus.length }} items
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="sku in ownedSkus"
                :key="sku.id"
                class="px-3 py-1.5 bg-white/70 border border-[#B9463A]/20 rounded-full text-[11px] font-bold text-[#3d1a14]"
              >
                ✓ {{ sku.name }}
              </span>
            </div>
          </section>
        </template>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IonModal, IonContent, IonIcon } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { mdiClose, mdiArrowRight } from "@mdi/js";

import { svg, isNative } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useToast } from "@/service/toast.service";
import {
	CATALOG,
	CATALOG_BY_ID,
	type ShopSku,
	type ItemCategory,
} from "@/config/catalog.config";

import ShopCardPack from "./ShopCardPack.vue";
import ShopCardTheme from "./ShopCardTheme.vue";
import ShopCardBrush from "./ShopCardBrush.vue";
import ShopCardDecoration from "./ShopCardDecoration.vue";
import ShopCardEffect from "./ShopCardEffect.vue";
import ShopCardFont from "./ShopCardFont.vue";
import ShopCardTitle from "./ShopCardTitle.vue";
import { useAuthStore } from "@/store/auth.store";

const menuStore = useMenuStore();
const subStore = useSubscriptionStore();
const inventoryStore = useInventoryStore();
const userStore = useAuthStore();
const { toast } = useToast();

const { isShopOpen, shopScrollTarget } = storeToRefs(menuStore);
const user = computed(() => userStore.user);

const isLoading = ref(true);

// Catalog with live RC prices merged in. Keyed by SKU id.
const skusWithPrices = ref<
	Record<string, ShopSku & { priceString?: string; rcPackage?: any }>
>({});

const contentEl = ref<any>(null);
const highlightedId = ref<string | null>(null);

// ─── Catalog filtering ───────────────────────────────────────────────────────
const featuredPacks = computed(() =>
	CATALOG.filter((s) => s.kind === "bundle" && s.featured).map(withPrice),
);

const categories: { id: ItemCategory; label: string; icon: string }[] = [
	{ id: "theme", label: "Themes", icon: "🎨" },
	{ id: "brush", label: "Brushes", icon: "🖌️" },
	{ id: "decoration", label: "Decor", icon: "✨" },
	{ id: "effect", label: "Effects", icon: "💫" },
	{ id: "font", label: "Fonts", icon: "Aa" },
	{ id: "title", label: "Titles", icon: "🏷️" },
];

const activeCategory = ref<ItemCategory>("theme");

const skusByCategory = (cat: ItemCategory) =>
	CATALOG.filter((s) => s.category === cat).map(withPrice);

const themesInCategory = computed(() => skusByCategory("theme"));
const brushesInCategory = computed(() => skusByCategory("brush"));
const decorationsInCategory = computed(() => skusByCategory("decoration"));
const effectsInCategory = computed(() => skusByCategory("effect"));
const fontsInCategory = computed(() => skusByCategory("font"));
const titlesInCategory = computed(() => skusByCategory("title"));

const ownedSkus = computed(() =>
	CATALOG.filter((s) => s.kind === "single" && inventoryStore.owned.has(s.id)),
);

function withPrice(sku: ShopSku) {
	return skusWithPrices.value[sku.id] || sku;
}

// ─── Ownership ───────────────────────────────────────────────────────────────
const isItemOwned = (skuId: string): boolean => {
	if (subStore.isPro) return true;
	const sku = CATALOG_BY_ID[skuId];
	if (!sku) return false;
	// For bundles, owned if all grants are in inventory
	if (sku.kind === "bundle") {
		return sku.grants.every((g) => inventoryStore.owned.has(g));
	}
	return inventoryStore.owned.has(sku.id);
};

// ─── Lifecycle ───────────────────────────────────────────────────────────────
const closeShop = () => {
	isShopOpen.value = false;
	highlightedId.value = null;
};

const loadOfferings = async () => {
	if (!isNative()) {
		// Mock prices for dev
		skusWithPrices.value = Object.fromEntries(
			CATALOG.map((s) => [
				s.id,
				{ ...s, priceString: s.kind === "bundle" ? "$4.99" : "$1.99" },
			]),
		);
		isLoading.value = false;
		return;
	}

	try {
		isLoading.value = true;
		const offerings = await Purchases.getOfferings();
		const shopPackages = offerings.all["shop_items"]?.availablePackages || [];

		const priced: Record<
			string,
			ShopSku & { priceString?: string; rcPackage?: any }
		> = {};
		for (const sku of CATALOG) {
			const pkg = shopPackages.find(
				(p) => p.product.identifier === sku.rcProductId,
			);
			priced[sku.id] = {
				...sku,
				priceString: pkg?.product.priceString,
				rcPackage: pkg,
			};
		}
		skusWithPrices.value = priced;
	} catch (e) {
		console.error("Error loading offerings", e);
		toast("Could not load shop prices", { color: "danger" });
	} finally {
		isLoading.value = false;
	}
};

const purchaseItem = async (sku: ShopSku) => {
	const ok = await subStore.purchaseSku(sku.id);
	if (ok) highlightedId.value = null;
};

// ─── Open + scroll-to-target ─────────────────────────────────────────────────
watch(isShopOpen, async (open) => {
	if (!open) return;

	if (Object.keys(skusWithPrices.value).length === 0) {
		await loadOfferings();
	}

	if (shopScrollTarget.value) {
		// Resolve target → SKU id (it might be an item ID like "theme.midnight")
		const targetItem = shopScrollTarget.value;
		const targetSku =
			CATALOG_BY_ID[targetItem] ??
			CATALOG.find((s) => s.grants.includes(targetItem));

		if (targetSku) {
			// Switch to the right category tab
			if (targetSku.category !== "pack") {
				activeCategory.value = targetSku.category;
			}

			highlightedId.value = targetSku.id;

			await nextTick();
			// Allow tab content to render
			setTimeout(() => {
				const el = document.querySelector(
					`[data-shop-id="${targetSku.id}"]`,
				) as HTMLElement | null;
				el?.scrollIntoView({ behavior: "smooth", block: "center" });
			}, 150);

			// Auto-fade highlight
			setTimeout(() => {
				highlightedId.value = null;
			}, 4000);
		}

		// Clear target so re-opening shop doesn't re-trigger
		shopScrollTarget.value = null;
	}
});
</script>

<style scoped>
ion-modal.full-screen-modal {
  --height: 100%;
  --width: 100%;
  --border-radius: 0;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
</style>