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

        <ion-item color="tertiary" :button="true" @click="bringToFront">
          <ion-icon :icon="svg(mdiFlipToFront)" />
          <p class="pl-2 text-base">Move to front</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="bringToBack">
          <ion-icon :icon="svg(mdiFlipToBack)" />
          <p class="pl-2 text-base">Move to back</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="removeObjects">
          <ion-icon :icon="svg(mdiDeleteOutline)" />
          <p class="pl-2 text-base">Delete</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { DrawAction } from '@/types/draw.types'
import { svg } from '@/helper/general.helper'
import { mdiContentCopy, mdiContentSave, mdiDeleteOutline, mdiFlipToBack, mdiFlipToFront, mdiMerge } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'

const { selectAction } = useDrawStore()
const { selectedObjectsRef } = storeToRefs(useSelect())
const { getSelectedObjects } = useSelect()

function removeObjects() {
  selectAction(DrawAction.Delete, { objects: getSelectedObjects() })
  closePopover()
}

function saveObjects() {
  selectAction(DrawAction.CreateSaved, { objects: selectedObjectsRef.value })
  closePopover()
}

function copyObjects() {
  selectAction(DrawAction.CopyObject, { objects: selectedObjectsRef.value })
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

function closePopover() {
  popoverController.dismiss()
}
</script>

<style scoped></style>
