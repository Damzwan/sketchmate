<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-title-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Artist Title
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          Your Earned Honors
        </p>
      </div>

      <div
        class="flex-1 overflow-y-auto px-1 space-y-3 hide-scrollbar pb-4"
        style="min-height: 300px;"
        @touchmove.stop
      >
        <div
          v-for="title in TITLES"
          :key="title.id"
          class="group relative flex items-center gap-4 p-4 rounded-[2rem] border transition-all duration-300 active:scale-[0.97]"
          :class="localSelection === title.id
            ? 'bg-white border-secondary shadow-md'
            : 'bg-white/40 border-white shadow-sm hover:bg-white/60'"
          @click="localSelection = localSelection === title.id ? '' : title.id"
        >
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all"
            :class="localSelection === title.id ? 'bg-secondary/10' : 'bg-white/80 shadow-inner'"
          >
            {{ title.emoji }}
          </div>

          <div class="flex-1 min-w-0">
            <span
              class="font-black text-lg leading-none block"
              :class="localSelection === title.id ? 'text-secondary' : 'text-black'"
            >
              {{ title.name }}
            </span>
            <p class="text-[11px] font-bold text-black/40 mt-1 leading-tight italic">
              {{ title.desc }}
            </p>
          </div>

          <div
            class="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
            :class="localSelection === title.id ? 'bg-secondary border-secondary shadow-lg' : 'border-black/5 bg-black/5'"
          >
            <ion-icon v-if="localSelection === title.id" :icon="svg(mdiCheck)" class="text-white text-lg" />
          </div>
        </div>
      </div>

      <!-- Action Area -->
      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-16 font-black uppercase tracking-widest shadow-lg"
          @click="confirmSelection"
        >
          Confirm Title
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-2 opacity-60"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonModal, IonButton, IonIcon } from '@ionic/vue'
import { mdiCheck } from '@mdi/js'
import { svg } from '@/helper/general.helper'
// Assuming you move the data to your config file
import { TITLES } from '../../../config/profile_options.config'

const props = defineProps<{
  isOpen: boolean
  currentTitleId: string
}>()

const emit = defineEmits(['close', 'select'])

// Local state so we only emit once they hit "Confirm"
const localSelection = ref(props.currentTitleId)

// Keep local state in sync when modal opens
watch(() => props.isOpen, (open) => {
  if (open) localSelection.value = props.currentTitleId
})

const confirmSelection = () => {
  emit('select', localSelection.value)
  emit('close')
}

const handleDismiss = () => {
  emit('close')
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.liquid-title-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary);
}

ion-modal.liquid-title-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

.overflow-y-auto {
  mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
}
</style>