<template>
  <ion-modal
    :is-open="isShopOpen"
    @didDismiss="closeShop"
    class="full-screen-modal"
  >
    <ion-content class="bg-[#FAF0E6] relative">
      <!-- Header -->
      <div class="sticky top-0 z-50 px-4 pt-12 pb-4 bg-[#FAF0E6]/90 backdrop-blur-md flex items-center justify-between border-b border-black/5">
        <h1 class="text-2xl font-black text-black tracking-tight" :style="{ fontFamily: resolveFontFamily('sketch') }">
          Sketch Shop 🎨
        </h1>
        <button
          @click="closeShop"
          class="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-xl text-black/70" />
        </button>
      </div>

      <div class="px-4 pb-20">
        <!-- Pro Banner (Hidden if already Pro) -->
        <transition name="fade">
          <div
            v-if="!subStore.isPro"
            class="mt-4 mb-8 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden group cursor-pointer active:scale-95 transition-transform"
            style="background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%)"
            @click="subStore.presentPaywall()"
          >
            <!-- Background effects -->
            <div class="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay"></div>
            <div class="absolute -right-10 -top-10 w-40 h-40 bg-white/20 blur-3xl rounded-full"></div>

            <div class="relative z-10 flex flex-col items-start">
              <span class="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 backdrop-blur-sm">
                Best Value
              </span>
              <h2 class="text-2xl font-black mb-1 drop-shadow-md">SketchMate Pro</h2>
              <p class="text-sm font-medium text-white/80 leading-snug mb-4 max-w-[200px]">
                Unlock ALL brushes, themes, and unlimited daily balloons!
              </p>
              <button class="px-5 py-2.5 bg-white text-purple-600 font-black rounded-2xl text-sm shadow-md active:scale-95">
                View Plans
              </button>
            </div>

<!--            <img src="/assets/graphics/pro-mascot.png" class="absolute -right-4 bottom-0 w-32 object-contain drop-shadow-2xl group-hover:scale-105 transition-transform" />-->
          </div>
        </transition>

        <!-- Loading Skeleton -->
        <div v-if="isLoading" class="flex flex-col gap-6">
          <div class="h-8 bg-black/5 rounded-full w-32 animate-pulse mb-2"></div>
          <div class="grid grid-cols-2 gap-4">
            <div v-for="i in 4" :key="i" class="h-40 bg-black/5 rounded-[2rem] animate-pulse"></div>
          </div>
        </div>

        <!-- Shop Categories -->
        <template v-else>
          <!-- Brushes Section -->
          <div class="mb-8">
            <div class="flex items-center justify-between mb-4 px-1">
              <h2 class="text-lg font-black text-black">Premium Brushes</h2>
              <span class="text-[10px] font-bold text-black/40 uppercase tracking-widest">Tools</span>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div
                v-for="brush in shopBrushes"
                :key="brush.id"
                class="rounded-[2rem] bg-white border border-black/5 p-4 flex flex-col items-center text-center shadow-sm relative overflow-hidden"
              >
                <!-- Tool Icon Background -->
                <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3" :class="brush.bgColorClass">
                  <ion-icon :icon="svg(brush.icon)" class="text-3xl text-white drop-shadow-sm" />
                </div>

                <h3 class="text-sm font-black text-black mb-1">{{ brush.name }}</h3>
                <p class="text-[10px] font-bold text-black/50 mb-3">{{ brush.desc }}</p>

                <!-- Purchase Button -->
                <button
                  class="w-full py-2.5 rounded-xl text-xs font-black transition-transform active:scale-95 flex items-center justify-center gap-1"
                  :class="isUnlocked(brush.id)
                    ? 'bg-green-100 text-green-700'
                    : 'bg-primary/20 text-primary-dark hover:bg-primary/30'"
                  @click="purchaseItem(brush)"
                  :disabled="isUnlocked(brush.id)"
                >
                  <span v-if="isUnlocked(brush.id)">Owned</span>
                  <template v-else>
                    {{ brush.priceString || 'Unlock' }}
                  </template>
                </button>
              </div>
            </div>
          </div>

          <!-- Themes Section -->
          <div class="mb-8">
            <div class="flex items-center justify-between mb-4 px-1">
              <h2 class="text-lg font-black text-black">Profile Themes</h2>
              <span class="text-[10px] font-bold text-black/40 uppercase tracking-widest">Aesthetics</span>
            </div>

            <div class="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar">
              <div
                v-for="theme in shopThemes"
                :key="theme.id"
                class="min-w-[140px] max-w-[140px] rounded-[2rem] p-4 flex flex-col items-center text-center shadow-sm snap-start border border-black/5"
                :style="{ background: theme.cardBg }"
              >
                <div class="w-10 h-10 rounded-full mb-2 border-2 border-white shadow-inner" :style="{ backgroundColor: theme.accentColor }"></div>
                <h3 class="text-sm font-black truncate w-full" :style="{ color: theme.nameColor }">{{ theme.name }}</h3>

                <div class="mt-auto pt-3 w-full">
                  <button
                    class="w-full py-2 rounded-xl text-[11px] font-black backdrop-blur-sm transition-transform active:scale-95 shadow-sm"
                    :style="{ backgroundColor: 'rgba(255,255,255,0.8)', color: theme.nameColor }"
                    @click="purchaseItem(theme)"
                    :disabled="isUnlocked(theme.id)"
                  >
                    {{ isUnlocked(theme.id) ? 'Owned' : (theme.priceString || 'Unlock') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { IonModal, IonContent, IonIcon } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { Purchases, PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { mdiClose, mdiBrush, mdiPen } from '@mdi/js'

import { svg, isNative } from '@/helper/general.helper'
import { useMenuStore } from '@/store/menu.store'
import { useSubscriptionStore } from '@/store/subscription.store'
import { useToast } from '@/service/toast.service'
import { resolveFontFamily, THEMES } from '@/config/profile_options.config'
import { penIconMapping } from '@/draw/config/tools.config'
import { BrushType } from '@/draw/types/draw.types'

const menuStore = useMenuStore()
const subStore = useSubscriptionStore()
const { toast } = useToast()

const { isShopOpen } = storeToRefs(menuStore)
const isLoading = ref(true)

const baseBrushes = [
  { id: 'brush_neon', rc_identifier: 'rc_brush_neon', name: 'Neon Pen', desc: 'Glows in the dark', icon: penIconMapping[BrushType.Neon], bgColorClass: 'bg-indigo-500' },
  { id: 'brush_calligraphy', rc_identifier: 'rc_brush_calligraphy', name: 'Calligraphy', desc: 'Elegant strokes', icon: penIconMapping[BrushType.CalliGraphy], bgColorClass: 'bg-sky-400' }
]

// Dynamically populated with prices from RevenueCat
const shopBrushes = ref<any[]>([])
const shopThemes = ref<any[]>([])

const unlockedItems = ref<string[]>(['classic'])

const closeShop = () => {
  isShopOpen.value = false
}

const isUnlocked = (id: string) => {
  return subStore.isPro || unlockedItems.value.includes(id)
}

const loadOfferings = async () => {
  if (!isNative()) {
    // Mock for web dev environment
    shopBrushes.value = baseBrushes.map(b => ({ ...b, priceString: '$1.99' }))
    shopThemes.value = THEMES.filter(t => t.id !== 'classic').map(t => ({ ...t, priceString: '$0.99' }))
    isLoading.value = false
    return
  }

  try {
    isLoading.value = true
    const offerings = await Purchases.getOfferings()

    // Assume you set up an offering called 'shop_items' in RevenueCat
    const shopPackages = offerings.all['shop_items']?.availablePackages || []

    // Map RC Packages to Brushes
    shopBrushes.value = baseBrushes.map(brush => {
      const rcPackage = shopPackages.find(p => p.product.identifier === brush.rc_identifier)
      return {
        ...brush,
        priceString: rcPackage ? rcPackage.product.priceString : 'N/A',
        rcPackage // Store the package to pass to the purchase function later
      }
    })

    // Map RC Packages to Themes
    shopThemes.value = THEMES.filter(t => t.id !== 'classic').map(theme => {
      const rcPackage = shopPackages.find(p => p.product.identifier === `rc_theme_${theme.id}`)
      return {
        ...theme,
        priceString: rcPackage ? rcPackage.product.priceString : 'N/A',
        rcPackage
      }
    })

  } catch (error) {
    console.error('Error fetching RC Offerings:', error)
    toast('Could not load shop prices', { color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

const purchaseItem = async (item: any) => {
  if (!isNative()) {
    toast('Purchases are only available on the mobile app!', { color: 'warning' })
    return
  }

  if (!item.rcPackage) {
    toast('Item not available right now.', { color: 'warning' })
    return
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage({ package: item.rcPackage })

    // RevenueCat webhook will update the backend, but we can optimistically update UI
    if (customerInfo.nonSubscriptionTransactions.find(t => t.productIdentifier === item.rc_identifier)) {
      unlockedItems.value.push(item.id)
      toast(`Unlocked ${item.name}! 🎉`, { color: 'success' })
    }
  } catch (e: any) {
    if (!e.userCancelled) {
      toast('Purchase failed. Please try again.', { color: 'danger' })
    }
  }
}

// Fetch prices when the modal opens
watch(isShopOpen, (newVal) => {
  if (newVal && shopBrushes.value.length === 0) {
    loadOfferings()
  }
})
</script>

<style scoped>
/* Full screen override if ion-modal defaults to a sheet */
ion-modal.full-screen-modal {
  --height: 100%;
  --width: 100%;
  --border-radius: 0;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>