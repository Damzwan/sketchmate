<template>
  <ion-popover trigger="select_extra_options" :showBackdrop="false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="copyObjects">
          <ion-icon :icon="svg(mdiContentCopy)" />
          <p class="pl-2 text-base">Copy</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="mergeObjects" v-if="selectedObjectsRef.length > 1">
          <ion-icon :icon="svg(mdiMerge)" />
          <p class="pl-2 text-base">Merge</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="saveObjects">
          <ion-icon :icon="svg(mdiContentSave)" />
          <p class="pl-2 text-base">Save</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="flip(true, false)">
          <ion-icon :icon="svg(mdiFlipHorizontal)" />
          <p class="pl-2 text-base">Flip X</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="flip(false, true)">
          <ion-icon :icon="svg(mdiFlipVertical)" />
          <p class="pl-2 text-base">Flip Y</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="bringToFront">
          <ion-icon :icon="svg(mdiFlipToFront)" />
          <p class="pl-2 text-base">Move to front</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="bringToBack">
          <ion-icon :icon="svg(mdiFlipToBack)" />
          <p class="pl-2 text-base">Move to back</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="moveUpOneLayer">
          <ion-icon :icon="svg(mdiNumericPositive1)" />
          <p class="pl-2 text-base">Move up 1 layer</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="moveDownOneLayer">
          <ion-icon :icon="svg(mdiNumericNegative1)" />
          <p class="pl-2 text-base">Move down 1 layer</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { DrawAction } from '@/types/draw.types'
import { svg } from '@/helper/general.helper'
import {
  mdiContentCopy,
  mdiContentSave,
  mdiFlipToBack,
  mdiFlipToFront,
  mdiMerge,
  mdiNumericNegative1,
  mdiNumericPositive1,
  mdiFlipHorizontal,
  mdiFlipVertical
} from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'

const { selectAction } = useDrawStore()
const { selectedObjectsRef } = storeToRefs(useSelect())
const { getSelectedObjects } = useSelect()
function saveObjects() {
  selectAction(DrawAction.CreateSaved, { objects: getSelectedObjects() })
  closePopover()
}

function copyObjects() {
  selectAction(DrawAction.CopyObject, { objects: getSelectedObjects() })
  closePopover()
}

function mergeObjects() {
  selectAction(DrawAction.Merge, { objects: getSelectedObjects() })
  closePopover()
}

function bringToFront() {
  selectAction(DrawAction.BringToFront, { objects: getSelectedObjects() })
  closePopover()
}

function bringToBack() {
  selectAction(DrawAction.BringToBack, { objects: getSelectedObjects() })
  closePopover()
}

function moveUpOneLayer() {
  selectAction(DrawAction.MoveUpOneLayer, { objects: getSelectedObjects() })
  closePopover()
}

function moveDownOneLayer() {
  selectAction(DrawAction.MoveDownOneLayer, { objects: getSelectedObjects() })
  closePopover()
}

function flip(flipX: boolean, flipY: boolean) {
  selectAction(DrawAction.Flip, { objects: getSelectedObjects(), flipX, flipY })
  closePopover()
}

function closePopover() {
  popoverController.dismiss()
}
</script>

<style scoped></style>
