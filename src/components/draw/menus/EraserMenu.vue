<template>
  <ion-popover :is-open="eraserMenuOpen" :event="menuEvent" @didDismiss="eraserMenuOpen = false" :showBackdrop="false">
    <ion-content class="bg-background divide-y divide-primary">
      <div class="px-2 pt-1">
        <label for="slider">Eraser Size: {{ eraserSize }}</label>
        <ion-range aria-label="Volume" id="slider" v-model="eraserSize" :min="1" :max="100" color="secondary" />
      </div>
      <ion-list lines="none" class="divide-y divide-primary" color="tertiary">
        <ion-item color="tertiary" :button="true" @click="clearAll">
          <ion-icon :icon="svg(mdiNuke)" />
          <p class="pl-2 text-sm">Clear all</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonItem, IonList, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { svg } from '@/helper/general.helper'
import { mdiNuke } from '@mdi/js'
import { DrawAction, DrawTool, EraserSize } from '@/draw/types/draw.types'
import { useMenuStore } from '@/store/menu.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'


const drawStore = useDrawStore()
const { selectTool } = useToolSelection()
const { eraserSize } = storeToRefs(useEraser())
const { eraserMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function clearAll() {
  drawStore.selectAction(DrawAction.FullErase, undefined)
  close()
}

function selectEraserSize(size: EraserSize) {
  eraserSize.value = size
}


function selectEraser() {
  selectTool(DrawTool.MobileEraser)
  close()
}

function close() {
  eraserMenuOpen.value = false
}
</script>

<style scoped>
@reference "@/theme/main.css";

ion-item {
  --inner-padding-end: 5px;
  --padding-start: 10px;
}

ion-list {
  padding: 0;
}


label {
  @apply block text-sm font-medium text-gray-700;
}
</style>