<template>
  <ion-toolbar color="primary" mode="md">
    <ion-buttons slot="end">
      <ion-button @click="undo" :disabled="undoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

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
import { mdiCheck, mdiRedo, mdiShapeOutline, mdiUndo } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawEvent, DrawTool, Menu, ShapeCreationMode } from '@/types/draw.types'
import { useMenuStore } from '@/store/draw/menu.store'
import { useHistory } from '@/service/draw/history.service'
import { useEventManager } from '@/service/draw/eventManager.service'
import { EventBus } from '@/main'

const { selectTool } = useDrawStore()
const { unsubscribe, enableAllEvents } = useEventManager()
const { openMenu } = useMenuStore()
const { shapeCreationMode } = storeToRefs(useDrawStore())

const { undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())

const shapeEvents = ['mouse:down', 'mouse:move', 'mouse:up']

// TODO this code is a bit cursed haha
function exitShapeCreationMode() {
  shapeEvents.forEach(e => unsubscribe({ type: DrawEvent.ShapeCreation, on: e }))
  EventBus.emit('reset-shape-creation')
  EventBus.off('reset-shape-creation')
  EventBus.off('undo')
  EventBus.off('redo')
  if (shapeCreationMode.value == ShapeCreationMode.Click) enableAllEvents()

  shapeCreationMode.value = undefined
  selectTool(DrawTool.Select)
}

function openShapesMenu(e: any) {
  openMenu(Menu.Shapes, e)
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
