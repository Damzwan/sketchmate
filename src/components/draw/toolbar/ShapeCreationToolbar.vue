<template>
  <ion-toolbar color="primary" mode="md">
    <ion-buttons slot="start" v-if="colorPickerMode">
      <ion-button @click="exitColorPickerMode">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>
      <ion-title>Pick a color</ion-title>
    </ion-buttons>

    <ion-buttons slot="start" v-if="addTextMode">
      <ion-button @click="exitTextAddingMode">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>
      <ion-title>Tap to add text</ion-title>
    </ion-buttons>

    <ion-buttons slot="end" v-else>
      <ion-button id="select_color_shape">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          trigger="select_color_shape"
          :strokeWidth="shapeCreationSettings.strokeWidth!"
          :stroke-color="shapeCreationSettings.stroke"
          :fill-color="shapeCreationSettings.fill as string"
          :backgroundColor-color="shapeCreationSettings.backgroundColor"
          @update:stroke-color="color => handleColorUpdate(color, 'stroke')"
          @update:fill-color="color => handleColorUpdate(color, 'fill')"
          @update:background-color="color => handleColorUpdate(color, 'background')"
          @update:strokeWidth="handleStrokeWidthUpdate"
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
import { mdiCheck, mdiClose, mdiPaletteOutline, mdiRedo, mdiUndo } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar, IonTitle } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useHistory } from '@/service/draw/history.service'
import { exitColorPickerMode, exitShapeCreationMode, exitTextAddingMode } from '@/helper/draw/draw.helper'
import { useDrawStore } from '@/store/draw/draw.store'
import SelectColorMenu from '@/components/draw/menu/SelectColorMenu.vue'

const { shapeCreationSettings, colorPickerMode, addTextMode } = storeToRefs(useDrawStore())
const { undo, redo } = useHistory()
const { undoStackCounter, redoStackCounter } = storeToRefs(useHistory())

type ColorUpdate = 'stroke' | 'fill' | 'background'

function handleColorUpdate(color: string | undefined, type: ColorUpdate) {
  if (type === 'stroke') shapeCreationSettings.value.stroke = color!
  if (type === 'fill') shapeCreationSettings.value.fill = color
  if (type === 'background') shapeCreationSettings.value.backgroundColor = color

  // Call the popoverController.dismiss() after the settings are updated
  // popoverController.dismiss()
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
