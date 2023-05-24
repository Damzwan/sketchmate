<template>
  <ion-popover trigger="select_color">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="strokeColorPicker?.click()">
          <ion-icon :icon="svg(mdiBorderColor)" />
          <p class="pl-2 text-base">Stroke Colour</p>
          <input
            type="color"
            v-model="selectedObjectStrokeColor"
            @change="() => onStrokeColorChange()"
            ref="strokeColorPicker"
            class="hidden"
          />
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="fillColorPicker?.click()">
          <ion-icon :icon="svg(mdiFormatColorFill)" />
          <p class="pl-2 text-base">Fill Colour</p>
          <input
            type="color"
            v-model="selectedObjectFillColor"
            @change="() => onFillColorChange()"
            ref="fillColorPicker"
            class="hidden"
          />
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="backgroundColorPicker?.click()">
          <ion-icon :icon="svg(mdiBucketOutline)" />
          <p class="pl-2 text-base">Background Colour</p>
          <input
            type="color"
            v-model="selectedBackgroundColor"
            @change="() => onBackgroundColorChange()"
            ref="backgroundColorPicker"
            class="hidden"
          />
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiBorderColor, mdiBucketOutline, mdiFormatColorFill } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw.store'

const { selectedObjectStrokeColor, selectedObjectFillColor, selectedBackgroundColor } = storeToRefs(useDrawStore())

const strokeColorPicker = ref<HTMLInputElement>()
const fillColorPicker = ref<HTMLInputElement>()
const backgroundColorPicker = ref<HTMLInputElement>()

const emits = defineEmits<{
  (e: 'update:stroke-color', color: string): void
  (e: 'update:fill-color', color: string): void
  (e: 'update:background-color', color: string): void
}>()

function onStrokeColorChange() {
  emits('update:stroke-color', selectedObjectStrokeColor.value)
}

function onFillColorChange() {
  emits('update:fill-color', selectedObjectFillColor.value)
}

function onBackgroundColorChange() {
  emits('update:background-color', selectedBackgroundColor.value)
}

function close() {
  popoverController.dismiss()
}
</script>

<style scoped></style>
