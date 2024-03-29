<template>
  <ion-popover trigger="img-style" :showBackdrop="false">
    <ion-content class="divide-y divide-primary">
      <ion-list lines="none" class="p-0">
        <ion-item color="tertiary">
          <ion-toggle color="secondary" :checked="isGrayScale" @ionChange="addGrayScaleFilter">Black/White</ion-toggle>
        </ion-item>
        <ion-item color="tertiary">
          <ion-toggle color="secondary" :checked="isSepia" @ionChange="addSepiaFilter">Sepia</ion-toggle>
        </ion-item>
        <ion-item color="tertiary">
          <ion-toggle color="secondary" :checked="isInvert" @ionChange="addInvertFilter">Invert</ion-toggle>
        </ion-item>
      </ion-list>
      <ion-list lines="none" class="p-0 divide-y divide-primary">
        <ion-item color="tertiary" v-if="colorFilter" :button="true" :detail="false" @click="removeColorFilter">
          <ion-icon :icon="svg(mdiClose)" color="danger" />
          <p class="px-2 text-sm">Remove color</p>
          <div class="rounded-full w-[26px] h-[26px]" :style="{ backgroundColor: colorFilter.color }" />
        </ion-item>
        <ColorPicker
          :color="colorFilter?.color"
          @update:color="addColorFilter"
          :show-opacity="true"
          :color-picker-action="DrawAction.ChangeBackgroundColor"
        />
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonList, IonPopover, IonToggle, IonItem, IonIcon } from '@ionic/vue'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { DrawAction } from '@/types/draw.types'
import { fabric } from 'fabric'
import { computed } from 'vue'
import { svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import { opacityFromOpacityHex } from '@/helper/draw/draw.helper'

const props = defineProps<{
  img: fabric.Image
}>()

const isGrayScale = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Grayscale'))
const isSepia = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Sepia'))
const isInvert = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Invert'))
const colorFilter = computed(() => props.img.filters?.find((f: any) => f.type == 'BlendColor'))

function addGrayScaleFilter(e: any) {
  emits('add-filter', { filter: new fabric.Image.filters.Grayscale(), remove: !e.detail.checked })
}

function addSepiaFilter(e: any) {
  emits('add-filter', { filter: new fabric.Image.filters.Sepia(), remove: !e.detail.checked })
}

function addInvertFilter(e: any) {
  emits('add-filter', { filter: new fabric.Image.filters.Invert(), remove: !e.detail.checked })
}

function removeColorFilter() {
  emits('add-filter', {
    filter: new fabric.Image.filters.BlendColor({
      color: '#000000',
      mode: 'tint'
    }),
    remove: true
  })
}

function addColorFilter(c: string) {
  emits('add-filter', {
    filter: new fabric.Image.filters.BlendColor({
      color: c,
      mode: 'tint',
      alpha: opacityFromOpacityHex(c)
    })
  })
}

const emits = defineEmits<{
  (e: 'add-filter', options: any): void
}>()
</script>

<style scoped></style>
