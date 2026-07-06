<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Text Effect"
    subtitle="Drama for your name"
    @close="handleDismiss"
  >
    <template #sub-header>
      <div class="px-3">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>
    </template>

    <div data-content-scroll="true" @touchmove.stop class="pb-4">
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="e in FONT_EFFECTS"
            :key="e.value"
            class="relative rounded-[2rem] border-2 bg-tertiary p-5 active:scale-95 transition-all overflow-hidden flex flex-col items-center justify-center min-h-[110px]"
            :class="[
              localSelection === e.value
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-primary/40 shadow-sm',
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
            <span class="block text-[9px] italic text-black/40 leading-tight mt-0.5">
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

    <template #footer>
      <div class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          v-if="selectionLocked"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
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
          size="large"
          @click="confirm"
        >
          Apply Effect
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
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
.locked-tile { opacity: 0.92; }
</style>