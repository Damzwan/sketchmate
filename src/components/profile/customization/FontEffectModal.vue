<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-customize-modal"
  >
    <div class="h-full flex flex-col bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">
      <div class="shrink-0 pt-4 pb-2 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Text Effect
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          Drama for your name
        </p>
      </div>

      <div class="shrink-0 px-4 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 hide-scrollbar pb-4" @touchmove.stop>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="e in FONT_EFFECTS"
            :key="e.value"
            class="relative rounded-[2rem] border-2 bg-white/60 p-5 active:scale-95 transition-all overflow-hidden flex flex-col items-center justify-center min-h-[110px]"
            :class="[
              localSelection === e.value
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-white shadow-sm',
              !isItemOwned(e.value) && 'locked-tile'
            ]"
            @click="localSelection = e.value"
          >
            <!-- Live demo of the effect using the user's chosen font -->
            <span
              class="block text-3xl font-black leading-none mb-2"
              :class="FONT_EFFECT_MAP[e.value] || ''"
              :style="{ fontFamily: resolvedFontFamily, color: e.value ? undefined : '#18181b' }"
            >
              Aa
            </span>
            <span class="block text-[10px] font-black uppercase tracking-widest text-black mt-3">
              {{ e.label }}
            </span>
            <span class="block text-[9px] font-bold italic text-black/40 leading-tight mt-0.5">
              {{ e.desc }}
            </span>

            <div
              v-if="!isItemOwned(e.value)"
              class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
            >
              <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
                <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
              </div>
            </div>

            <div
              v-if="localSelection === e.value && isItemOwned(e.value)"
              class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
            </div>
          </button>
        </div>
      </div>

      <div class="px-5 pt-3 pb-2 shrink-0 bg-background border-t border-black/5">
        <ion-button
          v-if="selectionLocked"
          expand="block"
          color="secondary"
          shape="round"
          class="h-14 font-black uppercase tracking-widest shadow-lg"
          :disabled="purchasing"
          @click="unlock"
        >
          <ion-icon :icon="svg(mdiLock)" slot="start" class="mr-1" />
          {{ purchasing ? 'Unlocking…' : `Unlock ${selectionName}` }}
        </ion-button>
        <ion-button
          v-else
          expand="block"
          color="secondary"
          shape="round"
          class="h-14 font-black uppercase tracking-widest shadow-lg"
          @click="confirm"
        >
          Apply Effect
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-1 opacity-60"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IonButton, IonIcon, IonModal } from '@ionic/vue'
import { mdiCheck, mdiLock } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import {
  FONT_EFFECT_MAP,
  FONT_EFFECTS,
  resolveFontFamily,
  type Customization
} from '@/config/profile_options.config'
import { buildItemId } from '@/config/catalog.config'
import { useInventoryStore } from '@/store/inventory.store'
import { useUnlockItem } from '@/composables/shop/useUnlockItem'
import PreviewProfileCard from '@/components/profile/PreviewProfileCard.vue'

const props = defineProps<{
  isOpen: boolean
  user: any
  customization: Partial<Customization>
}>()

const emit = defineEmits(['close', 'select'])

const inventoryStore = useInventoryStore()
const { purchasing, unlockItem } = useUnlockItem()

const localSelection = ref(props.customization.fontEffectId || '')

watch(
  () => props.isOpen,
  (open) => {
    if (open) localSelection.value = props.customization.fontEffectId || ''
  }
)

const isItemOwned = (effectId: string) =>
  inventoryStore.isOwned(buildItemId('font_effect', effectId))

const selectionLocked = computed(() => !isItemOwned(localSelection.value))

const selectionName = computed(
  () => FONT_EFFECTS.find((e) => e.value === localSelection.value)?.label || ''
)

const previewCustomization = computed(() => ({
  ...props.customization,
  fontEffectId: localSelection.value
}))

// Use the user's chosen font in the swatch previews so the effect/font combo
// is honest about what they'll actually see.
const resolvedFontFamily = computed(() => resolveFontFamily(props.customization.fontId))

const confirm = () => {
  if (selectionLocked.value) return unlock()
  emit('select', localSelection.value)
  emit('close')
}

const unlock = async () => {
  const ok = await unlockItem(buildItemId('font_effect', localSelection.value))
  if (ok) {
    emit('select', localSelection.value)
    emit('close')
  }
}

const handleDismiss = () => emit('close')
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.locked-tile { opacity: 0.92; }

ion-modal.liquid-customize-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: 90%;
  --background: var(--ion-color-tertiary);
}
ion-modal.liquid-customize-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>