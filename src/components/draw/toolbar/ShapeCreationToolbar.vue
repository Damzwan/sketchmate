<template>
  <ion-toolbar color="primary" mode="md">
    <ion-buttons slot="end">
      <ion-button @click="undo" :disabled="undoStackCounter == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStackCounter == 0">
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
import { Menu } from '@/types/draw.types'
import { useMenuStore } from '@/store/draw/menu.store'
import { useHistory } from '@/service/draw/history.service'
import { exitShapeCreationMode } from '@/helper/draw/draw.helper'

const { openMenu } = useMenuStore()

const { undo, redo } = useHistory()
const { undoStackCounter, redoStackCounter } = storeToRefs(useHistory())

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
