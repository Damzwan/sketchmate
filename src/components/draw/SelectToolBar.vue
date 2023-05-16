<template>
  <ion-toolbar color="primary">
    <ion-buttons slot="start">
      <ion-button @click="cancelSelect">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>

      <ion-button @click="strokeColorPicker?.click()" v-if="!containsImage">
        <input
          type="color"
          v-model="selectedObjectStrokeColor"
          @change="e => setStrokeColor(e)"
          ref="strokeColorPicker"
          class="hidden"
        />
        <ion-icon slot="icon-only" :icon="svg(mdiVectorLine)" :style="{ color: selectedObjectStrokeColor }" />
      </ion-button>

      <ion-button @click="fillColorPicker?.click()" v-if="!containsImage">
        <input
          type="color"
          v-model="selectedObjectFillColor"
          @change="e => setFillColor(e)"
          ref="fillColorPicker"
          class="hidden"
        />
        <ion-icon slot="icon-only" :icon="svg(mdiBucket)" :style="{ color: selectedObjectFillColor }" />
      </ion-button>

      <ion-button @click="selectAction(DrawAction.CopyObject, { objects: selectedObjectsRef })">
        <ion-icon slot="icon-only" :icon="svg(mdiContentCopy)" />
      </ion-button>
    </ion-buttons>

    <ion-buttons slot="end">
      <ion-button @click="removeObjects">
        <ion-icon slot="icon-only" :icon="svg(mdiDeleteOutline)"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiBucket, mdiClose, mdiContentCopy, mdiDeleteOutline, mdiVectorLine } from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { DrawAction } from '@/types/draw.types'

const { setSelectedObjects, refresh, getSelectedObjects, saveState, selectAction, deleteObjects } = useDrawStore()
const { selectedObjectsRef, selectedObjectStrokeColor, selectedObjectFillColor } = storeToRefs(useDrawStore())
const strokeColorPicker = ref<HTMLInputElement>()
const fillColorPicker = ref<HTMLInputElement>()

const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))

function cancelSelect() {
  setSelectedObjects([])
}

function removeObjects() {
  deleteObjects(getSelectedObjects())
  setSelectedObjects([])
  refresh()
}

function setStrokeColor(c: string) {
  selectedObjectsRef.value?.forEach(obj => obj.set({ stroke: selectedObjectStrokeColor.value }))
  saveState()
  refresh()
}

function setFillColor(c: string) {
  selectedObjectsRef.value?.forEach(obj => obj.set({ fill: selectedObjectFillColor.value }))
  saveState()
  refresh()
}
</script>

<style scoped></style>
