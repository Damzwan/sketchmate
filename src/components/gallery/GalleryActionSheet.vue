<template>
  <ion-modal
    :is-open="selectedMode"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="action-sheet-modal"
    @didDismiss="emits('cancel')"
    :backdropDismiss="false"
    :backdropBreakpoint="1"
  >
    <div class="p-6 bg-primary/80 h-full">
      <div class="flex items-center justify-between mb-6">
        <div class="flex flex-col">
          <span class="text-2xl font-black text-black">{{ count }}</span>
          <span class="text-xs font-bold text-black/40 uppercase tracking-widest">Items Selected</span>
        </div>
        <button
          @click="emits('cancel')"
          class="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-xl" />
        </button>
      </div>

      <ion-list lines="none" color="tertiary">
        <ion-item color="tertiary" :button="true" @click="emits('share')">
          <ion-icon :icon="svg(mdiShareVariantOutline)" />
          <p class="pl-2 text-sm">Share</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="emits('delete')">
          <ion-icon :icon="svg(mdiDeleteOutline)" />
          <p class="pl-2 text-sm">Delete</p>
        </ion-item>
      </ion-list>


    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonIcon, IonList, IonItem } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiClose, mdiDeleteOutline, mdiNuke, mdiShareVariantOutline } from '@mdi/js'

defineProps<{
  selectedMode: boolean;
  count: number;
}>()

const emits = defineEmits(['cancel', 'delete', 'share'])
</script>

<style scoped>
.action-sheet-modal {
  --height: auto;
}
ion-list {
  padding: 0;
}
</style>