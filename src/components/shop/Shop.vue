<template>
  <ion-modal
    :is-open="isShopOpen"
    @didDismiss="closeShop"
    class="full-screen-modal"
  >
    <ion-content class="--bg-canvas relative cabin-sketch-regular" ref="contentEl">

      <!-- ─── Safe-Area Calibrated Sticky Header ─── -->
      <div
        class="sticky top-0 z-50 px-5 pb-4 backdrop-blur-xl flex items-end justify-between border-b-2 border-primary/20 header-bg"
        :style="{ paddingTop: 'calc(12px + var(--ion-safe-area-top, 0px))' }"
      >
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-black text-[var(--ion-color-dark)] tracking-tight leading-none">
            Art Supplies
          </h1>
          <span class="text-xl inline-block">🎨</span>
        </div>
        <button
          @click="closeShop"
          class="w-9 h-9 bg-[var(--ion-color-dark)]/5 hover:bg-[var(--ion-color-dark)]/10 rounded-xl flex items-center justify-center border border-[var(--ion-color-dark)]/10"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-base text-[var(--ion-color-dark)]" />
        </button>
      </div>

      <!-- Main Shelf Content Area -->
      <div class="px-5 pt-4 pb-24">

        <!-- ─── Core Product Tier Toggles ─── -->
        <div v-if="!subStore.isPro" class="mb-6">
          <div class="grid grid-cols-2 gap-3">

            <!-- Pro Tier Entry Node -->
            <button
              class="relative rounded-[1.75rem] p-4 text-[var(--ion-color-dark)] text-left border-2 border-[var(--ion-color-dark)]/80 bg-[var(--ion-color-tertiary)] shadow-[3px_3px_0px_0px_rgba(61,26,20,0.15)] flex flex-col justify-between min-h-[140px] transition-transform active:scale-[0.98]"
              @click="subStore.presentPaywall()"
            >
              <div class="absolute inset-0 grain-bg opacity-5 pointer-events-none"></div>
              <div>
                <div class="text-2xl mb-1">⚡</div>
                <h2 class="text-base font-black leading-tight text-[var(--ion-color-dark)]">Pro Membership</h2>
                <p class="text-[11px] font-bold text-[var(--ion-color-dark)]/60 mt-1 leading-snug">
                  Unlock features, higher limits, and custom profile options.
                </p>
              </div>
              <div class="flex items-center gap-1 text-[var(--ion-color-secondary)] font-black text-[10px] uppercase tracking-wider mt-3">
                <span>View Options</span>
                <ion-icon :icon="svg(mdiArrowRight)" class="text-xs" />
              </div>
            </button>

            <!-- Lifetime Premium Entry Node -->
            <button
              class="relative rounded-[1.75rem] p-4 text-[var(--ion-color-dark)] text-left border-2 border-[var(--ion-color-dark)]/80 bg-[var(--ion-color-primary)] shadow-[3px_3px_0px_0px_rgba(61,26,20,0.15)] flex flex-col justify-between min-h-[140px] transition-transform active:scale-[0.98]"
              @click="subStore.presentPaywall()"
            >
              <div class="absolute inset-0 grain-bg opacity-5 pointer-events-none"></div>
              <div>
                <div class="text-2xl mb-1">👑</div>
                <h2 class="text-base font-black leading-tight text-[var(--ion-color-dark)]">Lifetime Buy</h2>
                <p class="text-[11px] font-bold text-[var(--ion-color-dark)]/60 mt-1 leading-snug">
                  Get Pro forever plus instant access to all present and future shop catalog items.
                </p>
              </div>
              <div class="flex items-center gap-1 text-[var(--ion-color-dark)] font-black text-[10px] uppercase tracking-wider mt-3">
                <span>Unlock All</span>
                <ion-icon :icon="svg(mdiArrowRight)" class="text-xs" />
              </div>
            </button>
          </div>
        </div>

        <!-- ─── Pro Active Confirmation Box ─── -->
        <div
          v-else
          class="mb-6 rounded-[1.75rem] p-4 bg-[#E6F4EA] border-2 border-[var(--ion-color-dark)]/20 text-[var(--ion-color-dark)] shadow-[3px_3px_0px_0px_rgba(61,26,20,0.05)] flex items-center gap-3 relative"
        >
          <div class="text-2xl">✨</div>
          <div class="flex-1 min-w-0">
            <h2 class="text-sm font-black leading-none mb-0.5">Premium Enabled</h2>
            <p class="text-[11px] font-bold text-[var(--ion-color-dark)]/60 leading-tight">
              All supply sets and premium account limits have been lifted.
            </p>
          </div>
          <button
            class="px-3 py-1 bg-white border border-[var(--ion-color-dark)]/20 rounded-lg text-[9px] font-black uppercase tracking-widest"
            @click="subStore.manageSubscription()"
          >
            Manage
          </button>
        </div>

        <!-- Static Item Display Area Placeholder -->
        <div v-if="isLoading" class="grid grid-cols-2 gap-3.5 mt-4">
          <div v-for="i in 4" :key="i" class="h-36 bg-[var(--ion-color-dark)]/5 rounded-[1.75rem] border border-[var(--ion-color-dark)]/5"></div>
        </div>

        <template v-else>
          <!-- Featured Items -->
          <section v-if="featuredPacks.length" class="mb-6" :data-shop-id="'__featured__'">
            <div class="flex items-baseline justify-between mb-2 px-1">
              <h2 class="text-sm font-black text-[var(--ion-color-dark)]/40 uppercase tracking-widest">
                Special Edition Packs
              </h2>
            </div>

            <div class="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory hide-scrollbar -mx-5 px-5 overflow-visible">
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

          <!-- Category Selection Dock -->
          <div class="sticky top-[52px] z-40 -mx-5 px-5 py-2.5 backdrop-blur-md border-b border-primary/10 mb-4 navbar-bg">
            <div class="flex gap-1.5 overflow-x-auto hide-scrollbar overflow-visible">
              <button
                v-for="cat in categories"
                :key="cat.id"
                class="shrink-0 px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border"
                :class="
                  activeCategory === cat.id
                    ? 'bg-[var(--ion-color-dark)] text-white border-[var(--ion-color-dark)]'
                    : 'bg-white text-[var(--ion-color-dark)] border-[var(--ion-color-dark)]/20'
                "
                @click="activeCategory = cat.id"
              >
                <span class="mr-1 inline-block">{{ cat.icon }}</span>{{ cat.label }}
              </button>
            </div>
          </div>

          <!-- Catalog Shelf Component Selection Grid -->
          <div class="overflow-visible min-h-[250px]">
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


          </div>

          <!-- Unlocked Collector list -->
          <section v-if="ownedSkus.length && !subStore.isPro" class="mt-10">
            <div class="flex items-baseline justify-between mb-2 px-1">
              <h2 class="text-[9px] font-black text-[var(--ion-color-dark)]/40 uppercase tracking-widest">
                Unlocked Archive
              </h2>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="sku in ownedSkus"
                :key="sku.id"
                class="px-2.5 py-1 bg-white border border-[var(--ion-color-dark)]/20 rounded-xl text-[10px] font-black text-[var(--ion-color-dark)]"
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
import { useAuthStore } from "@/store/auth.store";

const menuStore = useMenuStore();
const subStore = useSubscriptionStore();
const inventoryStore = useInventoryStore();
const userStore = useAuthStore();
const { toast } = useToast();

const { isShopOpen, shopScrollTarget } = storeToRefs(menuStore);
const user = computed(() => userStore.user);
const isLoading = ref(true);
const skusWithPrices = ref<
	Record<string, ShopSku & { priceString?: string; rcPackage?: any }>
>({});
const contentEl = ref<any>(null);
const highlightedId = ref<string | null>(null);

const featuredPacks = computed(() =>
	CATALOG.filter((s) => s.kind === "bundle" && s.featured).map(withPrice),
);

const categories: { id: ItemCategory; label: string; icon: string }[] = [
	{ id: "theme", label: "Themes", icon: "🎨" },
	{ id: "brush", label: "Brushes", icon: "🖌️" },
	{ id: "decoration", label: "Decor", icon: "✨" },
	{ id: "effect", label: "Effects", icon: "💫" },
	{ id: "font", label: "Fonts", icon: "Aa" },
];

const activeCategory = ref<ItemCategory>("theme");
const skusByCategory = (cat: ItemCategory) =>
	CATALOG.filter((s) => s.category === cat).map(withPrice);

const themesInCategory = computed(() => skusByCategory("theme"));
const brushesInCategory = computed(() => skusByCategory("brush"));
const decorationsInCategory = computed(() => skusByCategory("decoration"));
const effectsInCategory = computed(() => skusByCategory("effect"));
const fontsInCategory = computed(() => skusByCategory("font"));
const ownedSkus = computed(() =>
	CATALOG.filter((s) => s.kind === "single" && inventoryStore.owned.has(s.id)),
);

function withPrice(sku: ShopSku) {
	return skusWithPrices.value[sku.id] || sku;
}

const isItemOwned = (skuId: string): boolean => {
	if (subStore.isPro) return true;
	const sku = CATALOG_BY_ID[skuId];
	if (!sku) return false;
	if (sku.kind === "bundle")
		return sku.grants.every((g) => inventoryStore.owned.has(g));
	return inventoryStore.owned.has(sku.id);
};

const closeShop = () => {
	isShopOpen.value = false;
	highlightedId.value = null;
};

const loadOfferings = async () => {
	if (!isNative()) {
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
		toast("Could not load shop prices", { color: "danger" });
	} finally {
		isLoading.value = false;
	}
};

const purchaseItem = async (sku: ShopSku) => {
	const ok = await subStore.purchaseSku(sku.id);
	if (ok) highlightedId.value = null;
};

watch(isShopOpen, async (open) => {
	if (!open) return;
	if (Object.keys(skusWithPrices.value).length === 0) await loadOfferings();
	if (shopScrollTarget.value) {
		const targetItem = shopScrollTarget.value;
		const targetSku =
			CATALOG_BY_ID[targetItem] ??
			CATALOG.find((s) => s.grants.includes(targetItem));
		if (targetSku) {
			if (targetSku.category !== "pack")
				activeCategory.value = targetSku.category;
			highlightedId.value = targetSku.id;
			await nextTick();
			setTimeout(() => {
				const el = document.querySelector(
					`[data-shop-id="${targetSku.id}"]`,
				) as HTMLElement | null;
				el?.scrollIntoView({ behavior: "smooth", block: "center" });
			}, 150);
			setTimeout(() => {
				highlightedId.value = null;
			}, 4000);
		}
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
.--bg-canvas {
  --background: var(--ion-color-background) !important;
}
.header-bg, .navbar-bg {
  background-color: rgba(245, 230, 211, 0.95); /* Decoupled to match exact hex variable tint */
}
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none !important;
}
.hide-scrollbar {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}
</style>