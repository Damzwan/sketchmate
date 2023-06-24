<template>
  <ion-popover :is-open="eraserMenuOpen" :event="menuEvent" @didDismiss="eraserMenuOpen = false" :showBackdrop="false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" @click="selectEraser" :button="true">
          <ion-icon :icon="svg(eraserIconMapping[DrawTool.MobileEraser])" />
          <p class="pl-2 text-sm">Mobile Eraser</p>
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

        <ion-item color="tertiary" @click="selectHealingEraser" :button="true">
          <ion-icon :icon="svg(eraserIconMapping[DrawTool.HealingEraser])" />
          <p class="pl-2 text-sm">Healing Eraser</p>
          <div class="flex justify-center items-center m-0" slot="end">
            <div
              class="eraser_option eraser_small"
              @click="selectHealingEraserSize(EraserSize.small)"
              :class="{
                eraser_selected: healingEraserSize === EraserSize.small && selectedTool == DrawTool.HealingEraser
              }"
            />
            <div
              class="eraser_option eraser_medium ml-3"
              @click="selectHealingEraserSize(EraserSize.medium)"
              :class="{
                eraser_selected: healingEraserSize === EraserSize.medium && selectedTool == DrawTool.HealingEraser
              }"
            />
            <div
              class="eraser_option eraser_large ml-3"
              @click="selectHealingEraserSize(EraserSize.large)"
              :class="{
                eraser_selected: healingEraserSize === EraserSize.large && selectedTool == DrawTool.HealingEraser
              }"
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
import { useDrawStore } from '@/store/draw/draw.store'
import { setAppColors, svg } from '@/helper/general.helper'
import { mdiNuke } from '@mdi/js'
import { DrawAction, DrawTool, EraserSize } from '@/types/draw.types'
import { eraserIconMapping } from '@/config/draw.config'
import { useMenuStore } from '@/store/draw/menu.store'
import { useEraser } from '@/service/draw/tools/eraser.tool'
import { useHealingEraser } from '@/service/draw/tools/healingEraser.tool'
import { colorsPerRoute, popoverColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

const drawStore = useDrawStore()
const { selectedTool } = storeToRefs(drawStore)
const { eraserSize } = storeToRefs(useEraser())
const { healingEraserSize } = storeToRefs(useHealingEraser())
const { eraserMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function clearAll() {
  drawStore.selectAction(DrawAction.FullErase)
  close()
}

function selectEraserSize(size: EraserSize) {
  eraserSize.value = size
}

function selectHealingEraserSize(size: EraserSize) {
  healingEraserSize.value = size
}

function selectEraser() {
  drawStore.selectTool(DrawTool.MobileEraser)
  close()
}

function selectHealingEraser() {
  drawStore.selectTool(DrawTool.HealingEraser)
  close()
}

function close() {
  eraserMenuOpen.value = false
}
</script>

<style scoped>
ion-item {
  --inner-padding-end: 5px;
  --padding-start: 10px;
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
