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
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawEvent, Menu, ShapeCreationMode } from '@/types/draw.types'
import { useMenuStore } from '@/store/draw/menu.store'
import { useHistory } from '@/service/draw/history.service'
import { useEventManager } from '@/service/draw/eventManager.service'

const { selectTool } = useDrawStore()
const { unsubscribe } = useEventManager()
const { saveState, enableHistorySaving } = useHistory()
const { openMenu } = useMenuStore()
const { shapeCreationMode } = storeToRefs(useDrawStore())

const shapeEvents = ['mouse:down', 'mouse:move', 'mouse:up']

function exitShapeCreationMode() {
  shapeEvents.forEach(e => unsubscribe({ type: DrawEvent.ShapeCreation, on: e }))
  if (shapeCreationMode.value == ShapeCreationMode.Click) {
    saveState()
    enableHistorySaving()
  }
  shapeCreationMode.value = undefined

  const { selectedTool } = useDrawStore()
  selectTool(selectedTool)
}

function openShapesMenu(e: any) {
  openMenu(Menu.Shapes, e)
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
