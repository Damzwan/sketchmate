<!-- components/lobby/PremiumLobbyModal.vue -->
<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Lobby Full!"
    subtitle="Regular slots are taken"
    @close="handleDismiss"
  >
    <div class="flex flex-col items-center py-5">

      <div class="bg-white rounded-[2rem] border border-white shadow-sm px-6 py-5 mb-5 w-full max-w-xs">
        <div class="flex justify-center -space-x-2 mb-4">
          <div class="w-10 h-10 rounded-full bg-primary/15 border-2 border-white"></div>
          <div class="w-10 h-10 rounded-full bg-secondary/20 border-2 border-white"></div>
          <div class="w-10 h-10 rounded-full bg-green-200 border-2 border-white flex items-center justify-center">
            <ion-icon
              :icon="svg(mdiCrownOutline)"
              class="text-secondary text-lg"
            />
          </div>
        </div>

        <h2 class="text-2xl font-black text-center leading-none">
          Lobby Full
        </h2>

        <p class="text-sm text-center text-black/60 mt-3 leading-snug">
          Every public seat is taken.
          <br>
          <span class="font-black text-secondary">
        Premium keeps a few sketch spots reserved.
      </span>
        </p>
      </div>

    </div>

    <template #footer>
      <ion-button
        expand="block"
        color="secondary"
        shape="round"
        size="large"
        @click="confirmUpgrade"
      >
        <ion-icon
          :icon="svg(mdiPalette)"
          slot="start"
        />
        Get Premium
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiCrownOutline, mdiPalette } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close', 'upgrade'])

const confirmUpgrade = () => {
  emit('upgrade')
  emit('close')
}

const handleDismiss = () => {
  emit('close')
}
</script>
