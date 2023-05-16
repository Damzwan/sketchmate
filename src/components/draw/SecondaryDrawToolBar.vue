<template>
  <ion-toolbar color="primary">
    <ion-buttons slot="start">
      <ion-button @click="undo" :disabled="undoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

      <ion-button id="image">
        <ion-icon slot="icon-only" :icon="svg(mdiImage)"></ion-icon>
      </ion-button>
      <ImageMenu />
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiImage, mdiRedo, mdiUndo } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import ImageMenu from '@/components/draw/ImageMenu.vue'

const { undo, redo } = useDrawStore()
const { undoStack, redoStack } = storeToRefs(useDrawStore())
</script>

<style scoped></style>
