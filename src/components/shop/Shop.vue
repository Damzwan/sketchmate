<template>
  <ion-modal :is-open="isShopOpen" @didDismiss="closeShop" class="full-screen-modal">
    <ion-content class="--bg-canvas relative cabin-sketch-regular" ref="contentEl">

      <!-- ─── Header with left back button ─── -->
      <div
        class="sticky top-0 z-50 px-2 pb-3 backdrop-blur-xl flex items-center gap-1 border-b border-primary/40 header-bg"
        :style="{ paddingTop: 'calc(8px + var(--ion-safe-area-top, 0px))' }"
      >
        <ion-button fill="clear" class="m-0 active:scale-90 transition-transform" @click="closeShop">
          <ion-icon :icon="chevronBackOutline" class="text-[26px] text-black" slot="icon-only" />
        </ion-button>
        <h1 class="text-2xl font-light text-black cabin-sketch-regular leading-none">Shop</h1>
      </div>

      <div class="px-4 pt-4 pb-24 space-y-6">

        <ShopSupportNote />

        <!-- ─── Membership ─── -->
        <!-- Free: two compact tappable tiers -->
        <div v-if="!subStore.isPro" class="grid grid-cols-2 gap-3">
          <button
            class="rounded-[1.25rem] px-4 py-3 text-left border border-primary/50 bg-tertiary active:scale-[0.98] transition-transform"
            @click="subStore.presentPaywall()"
          >
            <h2 class="text-[16px] font-black text-black leading-none">Pro</h2>
            <p class="text-[12px] font-bold text-secondary mt-1.5 leading-none">Unlock more →</p>
          </button>
          <button
            class="rounded-[1.25rem] px-4 py-3 text-left border-2 border-secondary bg-secondary/10 active:scale-[0.98] transition-transform"
            @click="subStore.presentPaywall()"
          >
            <h2 class="text-[16px] font-black text-black leading-none">Lifetime</h2>
            <p class="text-[12px] font-bold text-secondary mt-1.5 leading-none">Everything, forever →</p>
          </button>
        </div>

        <!-- Pro (not lifetime): upsell button + a distinct little manage card -->
        <div v-else-if="!subStore.isLifetime" class="space-y-2">
          <ion-button
            expand="block"
            color="secondary"
            shape="round"
            class="m-0 tracking-tight"
            @click="subStore.presentPaywall()"
          >
            Go Lifetime, unlock everything
            <ion-icon :icon="mdiArrowRight" slot="end" />
          </ion-button>
          <div class="rounded-xl px-3.5 py-1.5 border border-primary/40 flex items-center justify-between">
            <span class="text-[13px] text-black/80 flex items-center gap-1.5">
              <ion-icon :icon="mdiCheckCircle" class="text-emerald-500 text-base" />
              Pro is active
            </span>
            <ion-button fill="clear" size="small" color="secondary" class="m-0 font-black" @click="subStore.manageSubscription()">
              Manage
            </ion-button>
          </div>
        </div>

        <!-- Lifetime: nothing to sell, slim status + manage -->
        <div v-else class="rounded-xl px-3.5 py-1.5 border border-emerald-400/60 bg-emerald-50/50 flex items-center justify-between">
          <span class="text-[14px] font-black text-black flex items-center gap-1.5">
            <ion-icon :icon="mdiCrown" class="text-secondary text-lg" />
            Lifetime, all access
          </span>
          <ion-button fill="clear" size="small" color="secondary" class="m-0 font-black" @click="subStore.manageSubscription()">
            Manage
          </ion-button>
        </div>

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="grid grid-cols-2 gap-3.5">
          <div v-for="i in 4" :key="i" class="h-44 bg-[#3d1a14]/5 rounded-[1.75rem] border-2 border-[#3d1a14]/5"></div>
        </div>

        <template v-else>
          <!-- ─── New (hero highlights) ─── -->
          <section v-if="highlights.length">
            <h2 class="text-[17px] font-black text-black tracking-tight mb-2 px-1">New this season</h2>
            <div class="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory hide-scrollbar -mx-4 px-4">
              <ShopHero
                v-for="item in highlights"
                :key="item.id"
                :sku="item"
                :owned="isItemOwned(item.id)"
                :data-shop-id="item.id"
                @purchase="purchaseItem(item)"
              />
            </div>
          </section>

          <!-- ─── Bundles ─── -->
          <section v-if="featuredPacks.length">
            <h2 class="text-[17px] font-black text-black tracking-tight mb-1 px-1">Bundles</h2>
            <p class="text-[13px] text-black/80 mb-2 px-1">A whole look for less. Tap one to peek inside.</p>
            <div class="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory hide-scrollbar -mx-4 px-4">
              <ShopCardPack
                v-for="pack in featuredPacks"
                :key="pack.id"
                :sku="pack"
                :owned="isItemOwned(pack.id)"
                :user-img="user?.img"
                :data-shop-id="pack.id"
                :highlight="highlightedId === pack.id"
                @purchase="purchaseItem(pack)"
                @preview="previewBundle = pack"
              />
            </div>
          </section>

          <!-- ─── Category nav ─── -->
          <div class="sticky top-[54px] z-40 -mx-4 px-4 py-2.5 backdrop-blur-md border-y border-primary/40 navbar-bg">
            <div class="flex gap-2 overflow-x-auto hide-scrollbar">
              <button
                v-for="cat in categories"
                :key="cat.id"
                class="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-black tracking-tight border transition-colors"
                :class="
                  activeCategory === cat.id
                    ? 'bg-secondary text-white border-secondary'
                    : 'bg-white text-black/70 border-primary/40'
                "
                @click="activeCategory = cat.id"
              >
                {{ cat.label }}
              </button>
            </div>
          </div>

          <!-- ─── Active category grid ─── -->
          <div class="min-h-[260px]">
            <div class="grid grid-cols-2 gap-3">
              <component
                v-for="sku in activeItems"
                :is="cardFor(activeCategory)"
                :key="sku.id"
                :sku="sku"
                :user="user"
                :owned="isItemOwned(sku.id)"
                :data-shop-id="sku.id"
                :highlight="highlightedId === sku.id"
                @purchase="purchaseItem(sku)"
              />
            </div>
          </div>

          <!-- ─── Owned archive ─── -->
          <section v-if="ownedSkus.length && !subStore.isPro">
            <h2 class="text-[15px] font-black text-black tracking-tight mb-2 px-1">
              Your collection · {{ ownedSkus.length }}
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="sku in ownedSkus"
                :key="sku.id"
                class="px-2.5 py-1 bg-white border border-primary/40 rounded-full text-[12px] text-black"
              >
                {{ sku.name }}
              </span>
            </div>
          </section>
        </template>
      </div>

      <ShopBundleModal
        :is-open="!!previewBundle"
        :sku="previewBundle"
        :owned="previewBundle ? isItemOwned(previewBundle.id) : false"
        :user-img="user?.img"
        @close="previewBundle = null"
        @purchase="previewBundle && purchaseItem(previewBundle)"
      />
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IonModal, IonContent, IonIcon, IonButton } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { mdiArrowRight, mdiCheckCircle, mdiCrown } from "@mdi/js";
import { chevronBackOutline } from "ionicons/icons";
import bigbossImage from "@/assets/bigboss.jpg"

import { isNative } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useToast } from "@/service/toast.service";
import {
	CATALOG,
	CATALOG_BY_ID,
	HIGHLIGHT_IDS,
	type ShopSku,
	type ItemCategory,
} from "@/config/catalog.config";

import ShopSupportNote from "./ShopSupportNote.vue";
import ShopHero from "./ShopHero.vue";
import ShopCardPack from "./ShopCardPack.vue";
import ShopBundleModal from "./ShopBundleModal.vue";
import ShopCardTheme from "./ShopCardTheme.vue";
import ShopCardBrush from "./ShopCardBrush.vue";
import ShopCardDecoration from "./ShopCardDecoration.vue";
import ShopCardEffect from "./ShopCardEffect.vue";
import ShopCardWorld from "./ShopCardWorld.vue";
import ShopCardFont from "./ShopCardFont.vue";
import ShopCardFontEffect from "./ShopCardFontEffect.vue";
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
const previewBundle = ref<ShopSku | null>(null);

function withPrice(sku: ShopSku) {
	return skusWithPrices.value[sku.id] || sku;
}

const featuredPacks = computed(() =>
	CATALOG.filter((s) => s.kind === "bundle" && s.featured).map(withPrice),
);

const highlights = computed(() =>
	HIGHLIGHT_IDS.map((id) => CATALOG_BY_ID[id])
		.filter(Boolean)
		.map(withPrice),
);

// Grouped by feel: card looks first, then text, then tools.
const categories: { id: ItemCategory; label: string }[] = [
	{ id: "theme", label: "Themes" },
	{ id: "world", label: "Worlds" },
	{ id: "effect", label: "Effects" },
	{ id: "decoration", label: "Decor" },
	{ id: "font", label: "Fonts" },
	{ id: "font_effect", label: "Text" },
	{ id: "brush", label: "Brushes" },
];

const cardComponents: Partial<Record<ItemCategory, any>> = {
	theme: ShopCardTheme,
	world: ShopCardWorld,
	effect: ShopCardEffect,
	decoration: ShopCardDecoration,
	brush: ShopCardBrush,
	font: ShopCardFont,
	font_effect: ShopCardFontEffect,
};
const cardFor = (cat: ItemCategory) => cardComponents[cat] || ShopCardTheme;

const activeCategory = ref<ItemCategory>("theme");
const activeItems = computed(() =>
	CATALOG.filter((s) => s.category === activeCategory.value).map(withPrice),
);

const ownedSkus = computed(() =>
	CATALOG.filter((s) => s.kind === "single" && inventoryStore.owned.has(s.id)),
);

// Ownership is decided entirely by the inventory store (which knows the
// Lifetime / Pro / locked-category rules). A bundle is owned only when every
// grant inside it is.
const isItemOwned = (skuId: string): boolean => {
	const sku = CATALOG_BY_ID[skuId];
	if (!sku) return false;
	if (sku.kind === "bundle")
		return sku.grants.every((g) => inventoryStore.isOwned(g));
	return inventoryStore.isOwned(sku.id);
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
  background-color: rgba(245, 230, 211, 0.95);
}
.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}
</style>
