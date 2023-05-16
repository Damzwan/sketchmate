<template>
  <ion-popover :is-open="bucketMenuOpen" :event="event" @didDismiss="bucketMenuOpen = false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="bucketColorPicker?.click()">
          <input type="color" v-model="bucketColor" ref="bucketColorPicker" class="hidden" />
          <ion-icon :icon="svg(mdiPalette)" />
          <p class="pl-2 text-sm">Select colour</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="selectBackgroundFill">
          <ion-icon :icon="svg(mdiFormatColorFill)" />
          <p class="pl-2 text-sm">Fill background</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiFormatColorFill, mdiPalette } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw.store'
import { ref } from 'vue'
import { DrawAction } from '@/types/draw.types'

const drawStore = useDrawStore()
const bucketColorPicker = ref<HTMLInputElement>()
const { bucketMenuOpen, event, bucketColor } = storeToRefs(drawStore)

function selectBackgroundFill() {
  drawStore.selectAction(DrawAction.FillBackground)
  bucketMenuOpen.value = false
}
</script>

<style scoped></style>
