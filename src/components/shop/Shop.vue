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

        <!-- Quiet, opt-in access to owned items — no pushy "collect them all"
             shelf. Only appears once the user actually owns something. -->
        <button
          v-if="ready && ownedSkus.length"
          class="ml-auto mr-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-tertiary text-black text-[13px] font-black tracking-tight cursor-pointer active:scale-95 md:hover:brightness-95 transition"
          @click="collectionOpen = true"
        >
          <ion-icon :icon="svg(mdiTreasureChestOutline)" class="text-base text-secondary" />
          Collection
        </button>
      </div>

      <div class="px-4 pt-4 pb-24 space-y-6">

        <ShopSupportNote />

        <!-- ─── Membership ─── -->
        <template v-if="ready">
          <!-- Free: two compact tappable tiers -->
          <div v-if="!subStore.isPro" class="grid grid-cols-2 gap-3">
            <button
              class="rounded-[1.25rem] px-4 py-3 text-left border border-primary/50 bg-tertiary active:scale-[0.98] transition-transform cursor-pointer md:hover:scale-[1.02]"
              @click="subStore.openPaywall()"
            >
              <h2 class="text-[18px] font-black text-black leading-none">Pro</h2>
              <p class="text-[13px] font-bold text-secondary mt-1.5 leading-none">Unlock more</p>
            </button>
            <button
              class="rounded-[1.25rem] px-4 py-3 text-left border-2 border-secondary bg-secondary/10 active:scale-[0.98] transition-transform cursor-pointer md:hover:scale-[1.02]"
              @click="subStore.openPaywall()"
            >
              <h2 class="text-[18px] font-black text-black leading-none">Lifetime</h2>
              <p class="text-[13px] font-bold text-secondary mt-1.5 leading-none">Everything, forever</p>
            </button>
          </div>

          <!-- Pro (not lifetime): upsell button + a distinct little manage card -->
          <div v-else-if="!subStore.isLifetime" class="space-y-2">
            <ion-button
              expand="block"
              color="secondary"
              shape="round"
              class="m-0 tracking-tight"
              @click="subStore.openPaywall()"
            >
              Go Lifetime, unlock everything
              <ion-icon :icon="svg(mdiArrowRight)" slot="end" />
            </ion-button>
            <div class="rounded-xl px-3.5 py-1.5 border border-primary/40 flex items-center justify-between">
            <span class="text-[14px] text-black/80 flex items-center gap-1.5">
              <ion-icon :icon="svg(mdiCheckCircle)" class="text-emerald-500 text-base" />
              Pro is active
            </span>
              <ion-button fill="clear" size="small" color="secondary" class="m-0"
                          @click="subStore.manageSubscription()">
                Manage
              </ion-button>
            </div>
          </div>

          <!-- Lifetime: nothing to renew or cancel. Restore is the only useful
               action (re-sync on a new device); no Customer Center maze. -->
          <div v-else
               class="rounded-xl px-3.5 py-1.5 border border-emerald-400/60 bg-emerald-50/50 flex items-center justify-between">
          <span class="text-[15px] font-black text-black flex items-center gap-1.5">
            <ion-icon :icon="svg(mdiCrown)" class="text-secondary text-lg" />
            Lifetime, all access
          </span>
            <ion-button fill="clear" size="small" color="secondary" class="m-0"
                        @click="subStore.restorePurchases()">
              Restore
            </ion-button>
          </div>

        </template>
        <!-- Membership skeleton while sub/inventory stores load -->
        <div v-else class="grid grid-cols-2 gap-3">
          <div class="h-[58px] rounded-[1.25rem] bg-[#3d1a14]/5 border border-[#3d1a14]/5 animate-pulse"></div>
          <div class="h-[58px] rounded-[1.25rem] bg-[#3d1a14]/5 border border-[#3d1a14]/5 animate-pulse"></div>
        </div>

        <!-- Loading skeleton -->
        <div v-if="!ready" class="grid grid-cols-2 gap-3.5">
          <div v-for="i in 4" :key="i"
               class="h-44 bg-[#3d1a14]/5 rounded-[1.75rem] border-2 border-[#3d1a14]/5 animate-pulse"></div>
        </div>

        <template v-else>
          <!-- ─── New (hero highlights) ─── -->
          <section v-if="highlights.length">
            <h2 class="text-[18px] font-black text-black tracking-tight mb-2 px-1">New</h2>
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
            <h2 class="text-[18px] font-black text-black tracking-tight mb-2 px-1">Bundles</h2>
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

          <!-- ─── Browse + category filter ─── -->
          <!-- Nav + grid share ONE section so the filter bar stays stuck for the
               whole scroll of the feed (a sticky element only sticks while its
               containing block is on screen). -->
          <section>
            <h2 class="text-[18px] font-black text-black tracking-tight mb-2 px-1">Browse</h2>
            <div class="sticky top-[54px] z-40 -mx-4 px-4 py-2.5 backdrop-blur-md border-y border-primary/40 navbar-bg">
              <div class="flex gap-2 overflow-x-auto hide-scrollbar">
                <button
                  v-for="cat in categories"
                  :key="cat.id"
                  class="shrink-0 px-4 py-1.5 rounded-full text-[14px] font-black tracking-tight border transition-colors cursor-pointer hover:brightness-95 active:scale-95"
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

            <!-- Filtered item feed. In 'all' the order is shuffled (see
                 activeItems) so it reads as a mixed shelf, not category blocks. -->
            <div class="min-h-[260px] mt-3">
              <div class="grid grid-cols-2 gap-3">
                <component
                  v-for="sku in activeItems"
                  :is="cardFor(sku.category)"
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

      <!-- ─── Collection sheet (owned items) ─── -->
      <BaseSheetModal :is-open="collectionOpen" scrollable @close="collectionOpen = false">
        <template #header>
          <div class="shrink-0 text-center px-2">
            <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none cabin-sketch-regular">
              Your collection
            </h1>
            <p class="text-[14px] text-black/60 mt-2 leading-snug">
              {{ ownedSkus.length }} {{ ownedSkus.length === 1 ? 'item' : 'items' }} you own
            </p>
          </div>
        </template>

        <div data-content-scroll="true" @touchmove.stop class="grid grid-cols-2 gap-3 pb-4">
          <div
            v-for="sku in ownedSkus"
            :key="sku.id"
            class="rounded-[1.5rem] overflow-hidden border border-primary/40 bg-tertiary shadow-sm"
          >
            <div class="h-24 border-b border-primary/30">
              <ShopGrantPreview :item-id="sku.id" :user-img="user?.img" />
            </div>
            <div class="px-3 py-2">
              <p class="text-[15px] font-black text-black leading-none truncate">{{ sku.name }}</p>
              <p class="text-[12px] text-black/70 tracking-tight mt-1 capitalize">
                {{ sku.category.replace('_', ' ') }}
              </p>
            </div>
          </div>
        </div>
      </BaseSheetModal>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { IonModal, IonContent, IonIcon, IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { mdiArrowRight, mdiCheckCircle, mdiCrown, mdiTreasureChestOutline } from '@mdi/js'
import { chevronBackOutline } from 'ionicons/icons'
import bigbossImage from '@/assets/bigboss.jpg'

import { isNative, svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/menu.store'
import { useSubscriptionStore } from '@/store/subscription.store'
import { useInventoryStore } from '@/store/inventory.store'
import { useToast } from '@/service/toast.service'
import {
  CATALOG,
  CATALOG_BY_ID,
  HIGHLIGHT_IDS,
  type ShopSku,
  type ItemCategory
} from '@/config/catalog.config'

import ShopSupportNote from './ShopSupportNote.vue'
import ShopHero from './ShopHero.vue'
import ShopCardPack from './ShopCardPack.vue'
import ShopBundleModal from './ShopBundleModal.vue'
import ShopCardTheme from './ShopCardTheme.vue'
import ShopCardBrush from './ShopCardBrush.vue'
import ShopCardDecoration from './ShopCardDecoration.vue'
import ShopCardEffect from './ShopCardEffect.vue'
import ShopCardWorld from './ShopCardWorld.vue'
import ShopCardFont from './ShopCardFont.vue'
import ShopCardFontEffect from './ShopCardFontEffect.vue'
import ShopGrantPreview from './ShopGrantPreview.vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
import { useAuthStore } from '@/store/auth.store'

const menuStore = useMenuStore()
const subStore = useSubscriptionStore()
const inventoryStore = useInventoryStore()
const userStore = useAuthStore()
const { toast } = useToast()

const { isShopOpen, shopScrollTarget } = storeToRefs(menuStore)
const user = computed(() => userStore.user)
const isLoading = ref(true)
// Shop content waits on ALL of: RC prices, subscription status resolved, and
// inventory hydrated — else it flashes upsell/unowned to an owner before load.
const ready = computed(
  () => !isLoading.value && !subStore.isLoading && inventoryStore.hydrated
)
const skusWithPrices = ref<
  Record<string, ShopSku & { priceString?: string; rcPackage?: any }>
>({})
const contentEl = ref<any>(null)
const highlightedId = ref<string | null>(null)
const previewBundle = ref<ShopSku | null>(null)
const collectionOpen = ref(false)

function withPrice(sku: ShopSku) {
  return skusWithPrices.value[sku.id] || sku
}

const featuredPacks = computed(() =>
  CATALOG.filter((s) => s.kind === 'bundle' && s.featured).map(withPrice)
)

const highlights = computed(() =>
  HIGHLIGHT_IDS.map((id) => CATALOG_BY_ID[id])
    .filter(Boolean)
    .map(withPrice)
)

// Browse-all by default, then filter down. 'all' shows every single item so
// users can just scroll; the rest narrow to one category. Grouped by feel:
// card looks first, then text, then tools.
type CategoryFilter = ItemCategory | 'all'
const categories: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'theme', label: 'Themes' },
  { id: 'world', label: 'Worlds' },
  { id: 'effect', label: 'Effects' },
  { id: 'decoration', label: 'Decor' },
  { id: 'font', label: 'Fonts' },
  { id: 'font_effect', label: 'Text' },
  { id: 'brush', label: 'Brushes' }
]

const cardComponents: Partial<Record<ItemCategory, any>> = {
  theme: ShopCardTheme,
  world: ShopCardWorld,
  effect: ShopCardEffect,
  decoration: ShopCardDecoration,
  brush: ShopCardBrush,
  font: ShopCardFont,
  font_effect: ShopCardFontEffect
}
const cardFor = (cat: ItemCategory) => cardComponents[cat] || ShopCardTheme

// The single item feed. Bundles live in their own section, so this is singles
// only — either all of them ('all') or one category.
const activeCategory = ref<CategoryFilter>('all')

// Fisher-Yates. 'all' shows a shuffled mix so the shelf feels browseable
// instead of grouped in obvious category blocks. Shuffled ONCE per session so
// the order is stable (doesn't jump when prices finish loading / user filters).
const shuffle = <T, >(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const shuffledSingleIds = shuffle(
  CATALOG.filter((s) => s.kind === 'single').map((s) => s.id)
)

const activeItems = computed(() => {
  if (activeCategory.value === 'all')
    return shuffledSingleIds.map((id) => withPrice(CATALOG_BY_ID[id]))
  return CATALOG.filter(
    (s) => s.kind === 'single' && s.category === activeCategory.value
  ).map(withPrice)
})

const ownedSkus = computed(() =>
  CATALOG.filter((s) => s.kind === 'single' && inventoryStore.owned.has(s.id))
)

// Ownership is decided entirely by the inventory store (which knows the
// Lifetime / Pro / locked-category rules). A bundle is owned only when every
// grant inside it is.
const isItemOwned = (skuId: string): boolean => {
  const sku = CATALOG_BY_ID[skuId]
  if (!sku) return false
  if (sku.kind === 'bundle')
    return sku.grants.every((g) => inventoryStore.isOwned(g))
  return inventoryStore.isOwned(sku.id)
}

const closeShop = () => {
  isShopOpen.value = false
  highlightedId.value = null
}

const loadOfferings = async () => {
  if (!isNative()) {
    skusWithPrices.value = Object.fromEntries(
      CATALOG.map((s) => [
        s.id,
        { ...s, priceString: s.kind === 'bundle' ? '$4.99' : '$1.99' }
      ])
    )
    isLoading.value = false
    return
  }
  try {
    isLoading.value = true
    const offerings = await Purchases.getOfferings()
    const shopPackages = offerings.all['shop_items']?.availablePackages || []
    const priced: Record<
      string,
      ShopSku & { priceString?: string; rcPackage?: any }
    > = {}
    for (const sku of CATALOG) {
      const pkg = shopPackages.find(
        (p) => p.product.identifier === sku.rcProductId
      )
      priced[sku.id] = {
        ...sku,
        priceString: pkg?.product.priceString,
        rcPackage: pkg
      }
    }
    skusWithPrices.value = priced
  } catch (e) {
    toast('Could not load shop prices', { color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

const purchaseItem = async (sku: ShopSku) => {
  const ok = await subStore.purchaseSku(sku.id)
  if (ok) highlightedId.value = null
}

watch(isShopOpen, async (open) => {
  if (!open) return
  if (Object.keys(skusWithPrices.value).length === 0) await loadOfferings()
  if (shopScrollTarget.value) {
    const targetItem = shopScrollTarget.value
    const targetSku =
      CATALOG_BY_ID[targetItem] ??
      CATALOG.find((s) => s.grants.includes(targetItem))
    if (targetSku) {
      if (targetSku.category !== 'pack')
        activeCategory.value = targetSku.category
      highlightedId.value = targetSku.id
      await nextTick()
      setTimeout(() => {
        const el = document.querySelector(
          `[data-shop-id="${targetSku.id}"]`
        ) as HTMLElement | null
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
      setTimeout(() => {
        highlightedId.value = null
      }, 4000)
    }
    shopScrollTarget.value = null
  }
})
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

.hide-scrollbar::-webkit-scrollbar {
  display: none !important;
}

.hide-scrollbar {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}
</style>
