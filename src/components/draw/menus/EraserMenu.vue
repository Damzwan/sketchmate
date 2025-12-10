<template>
  <ion-popover :is-open="eraserMenuOpen" :event="menuEvent" @didDismiss="eraserMenuOpen = false" :showBackdrop="false">
    <ion-content class="bg-primary">
      <ion-list lines="none" class="divide-y divide-primary" color="tertiary">
        <ion-item color="tertiary" @click="selectEraser" :button="true">
          <ion-icon :icon="svg(eraserIconMapping[DrawTool.MobileEraser])" />
          <p class="pl-2 text-sm">Eraser</p>
          <div class="flex justify-center items-center m-0" slot="end">
            <div
              class="eraser_option eraser_small"
              @click="selectEraserSize(EraserSize.small)"
              :class="{ eraser_selected: eraserSize === EraserSize.small && selectedTool == DrawTool.MobileEraser }"
            />
            <div
              class="eraser_option eraser_medium ml-3"
              @click="selectEraserSize(EraserSize.medium)"
              :class="{ eraser_selected: eraserSize === EraserSize.medium && selectedTool == DrawTool.MobileEraser }"
            />
            <div
              class="eraser_option eraser_large ml-3"
              @click="selectEraserSize(EraserSize.large)"
              :class="{ eraser_selected: eraserSize === EraserSize.large && selectedTool == DrawTool.MobileEraser }"
            />
          </div>
        </ion-item>


        <ion-item color="tertiary" :button="true" @click="clearAll">
          <ion-icon :icon="svg(mdiNuke)" />
          <p class="pl-2 text-sm">Clear all</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { svg } from '@/helper/general.helper'
import { mdiNuke } from '@mdi/js'
import { DrawAction, DrawTool, EraserSize } from '@/draw/types/draw.types'
import { useMenuStore } from '@/store/menu.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { eraserIconMapping } from '@/draw/config/tools.config'


const drawStore = useDrawStore()
const { selectedTool } = storeToRefs(drawStore)
const { eraserSize } = storeToRefs(useEraser())
const { eraserMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function clearAll() {
  drawStore.selectAction(DrawAction.FullErase)
  close()
}

function selectEraserSize(size: EraserSize) {
  eraserSize.value = size
}


function selectEraser() {
  drawStore.selectTool(DrawTool.MobileEraser)
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

ion-list{
  padding: 0;
}

.eraser_option {
  @apply bg-primary rounded-full cursor-pointer hover:brightness-90;
}

.eraser_selected {
  @apply border-2 border-secondary;
}

.eraser_small {
  @apply w-[22px] h-[22px];
}

.eraser_medium {
  @apply w-[26px] h-[26px];
}

.eraser_large {
  @apply w-[30px] h-[30px];
}
</style>