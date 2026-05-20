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
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">Font</h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          The voice of your name
        </p>
      </div>

      <div class="shrink-0 px-4 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 hide-scrollbar pb-4" @touchmove.stop>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="f in FONTS"
            :key="f.value"
            class="relative rounded-[2rem] border-2 bg-white/60 p-4 active:scale-95 transition-all overflow-hidden text-left"
            :class="
              localSelection === f.value
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-white shadow-sm'
            "
            @click="localSelection = f.value"
          >
            <span class="block text-2xl font-bold leading-tight truncate" :style="{ fontFamily: f.family }">
              {{ f.preview }}
            </span>
            <span class="block text-[9px] font-black uppercase tracking-widest text-black/40 mt-2">
              {{ f.label }}
            </span>

            <div
              v-if="localSelection === f.value"
              class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
            </div>
          </button>
        </div>
      </div>

      <div class="px-5 pt-3 pb-2 shrink-0 bg-background border-t border-black/5">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-14 font-black uppercase tracking-widest shadow-lg"
          @click="confirm"
        >
          Apply Font
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
import { mdiCheck } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { DEFAULT_FONT_ID, FONTS, type Customization } from '@/config/profile_options.config'
import PreviewProfileCard from '@/components/profile/PreviewProfileCard.vue'

const props = defineProps<{
  isOpen: boolean
  user: any
  customization: Partial<Customization>
}>()

const emit = defineEmits(['close', 'select'])

const localSelection = ref(props.customization.fontId || DEFAULT_FONT_ID)

watch(
  () => props.isOpen,
  (open) => {
    if (open) localSelection.value = props.customization.fontId || DEFAULT_FONT_ID
  }
)

const previewCustomization = computed(() => ({
  ...props.customization,
  fontId: localSelection.value
}))

const confirm = () => {
  emit('select', localSelection.value)
  emit('close')
}
const handleDismiss = () => emit('close')
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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