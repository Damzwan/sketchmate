<template>
  <ion-toolbar color="primary" class="h-[46px]">
    <ion-buttons slot="end">
      <ion-button @click="openShapesMenu">
        <ion-icon slot="icon-only" :icon="svg(mdiShapeOutline)" />
      </ion-button>

      <ion-button @click="exitShapeCreationMode">
        <ion-icon slot="icon-only" :icon="svg(mdiCheck)" />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiCheck, mdiShapeOutline } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw.store'
import { ShapeCreationMode } from '@/types/draw.types'
import { enableHistorySaving } from '@/helper/draw/draw.helper'

const { saveState, getCanvas, selectTool, setShapesMenuOpen } = useDrawStore()
const { shapeCreationMode } = storeToRefs(useDrawStore())

function exitShapeCreationMode() {
  if (shapeCreationMode.value == ShapeCreationMode.Click) {
    saveState()
    enableHistorySaving(getCanvas())
  }
  shapeCreationMode.value = undefined

  const { selectedTool } = useDrawStore()

  selectTool(selectedTool, undefined, false)
}

function openShapesMenu(e: any) {
  saveState()
  setShapesMenuOpen(true, e)
}
</script>

<style scoped>
ion-button {
  width: 46px !important;
  height: 46px !important;
}

ion-button ion-icon {
  width: 100% !important;
  height: 100% !important;
}

ion-button::part(native) {
  @apply p-3;
}

ion-buttons {
  @apply h-[46px] top-0 relative;
}

ion-toolbar {
  --min-height: 46px;
}
</style>
