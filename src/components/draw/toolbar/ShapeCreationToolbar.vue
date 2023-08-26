<template>
  <ion-toolbar color="primary" mode="md">
    <ion-buttons slot="end">
      <ion-button id="line_width_shape">
        <ion-icon slot="icon-only" :icon="svg(mdiMinusThick)"></ion-icon>
        <StrokeWidthMenu
          trigger="line_width_shape"
          :strokeWidth="shapeCreationSettings.strokeWidth!"
          @update:strokeWidth="handleStrokeWidthUpdate"
        />
      </ion-button>

      <ion-button id="select_color_shape">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          trigger="select_color_shape"
          @update:stroke-color="color => handleColorUpdate(color, 'stroke')"
          @update:fill-color="color => handleColorUpdate(color, 'fill')"
          @update:background-color="color => handleColorUpdate(color, 'background')"
        />
      </ion-button>

      <ion-button @click="undo" :disabled="undoStackCounter == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStackCounter == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

      <ion-button @click="exitShapeCreationMode">
        <ion-icon slot="icon-only" :icon="svg(mdiCheck)" />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiCheck, mdiMinusThick, mdiPaletteOutline, mdiRedo, mdiUndo } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar, popoverController } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useHistory } from '@/service/draw/history.service'
import { exitShapeCreationMode } from '@/helper/draw/draw.helper'
import { useDrawStore } from '@/store/draw/draw.store'
import SelectColorMenu from '@/components/draw/menu/SelectColorMenu.vue'
import StrokeWidthMenu from '@/components/draw/menu/StrokeWidthMenu.vue'

const { shapeCreationSettings } = storeToRefs(useDrawStore())
const { undo, redo } = useHistory()
const { undoStackCounter, redoStackCounter } = storeToRefs(useHistory())

type ColorUpdate = 'stroke' | 'fill' | 'background'

function handleColorUpdate(color: string, type: ColorUpdate) {
  if (type === 'stroke') shapeCreationSettings.value.stroke = color
  if (type === 'fill') shapeCreationSettings.value.fill = color
  if (type === 'background') shapeCreationSettings.value.backgroundColor = color

  // Call the popoverController.dismiss() after the settings are updated
  popoverController.dismiss()
}

function handleStrokeWidthUpdate(strokeWidth: number) {
  shapeCreationSettings.value.strokeWidth = strokeWidth
}
</script>

<style scoped>
ion-button {
  width: var(--toolbar-height) !important;
  height: var(--toolbar-height) !important;
}

ion-button ion-icon {
  width: 100% !important;
  height: 100% !important;
}

ion-button::part(native) {
  @apply p-[11px];
}

ion-buttons {
  @apply h-[var(--toolbar-height)] top-0 relative;
}

ion-toolbar {
  --min-height: var(--toolbar-height);
  --height: var(--toolbar-height);
}
</style>
