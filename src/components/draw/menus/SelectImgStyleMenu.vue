<template>
  <ion-popover trigger="img-style" :showBackdrop="false" :is-open="selectImgStyleMenuOpen" :event="menuEvent"
               @didDismiss="selectImgStyleMenuOpen=false">
    <ion-content class="divide-y divide-primary">
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
          :color-picker-action="DrawAction.SetObjectBackgroundColor"
        />
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonList, IonPopover, IonToggle, IonItem, IonIcon } from '@ionic/vue'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { DrawAction } from "@/draw/actions/drawAction.types";
import { computed } from 'vue'
import { svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { FabricImage } from 'fabric'
import * as fabric from 'fabric'
import { opacityFromOpacityHex } from '@/draw/utils/color.utils'


const { selectImgStyleMenuOpen, menuEvent } = storeToRefs(useMenuStore())

const props = defineProps<{
  img: FabricImage
}>()

const isGrayScale = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Grayscale'))
const isSepia = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Sepia'))
const isInvert = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Invert'))
const colorFilter = computed(() => props.img.filters?.find((f: any) => f.type == 'BlendColor'))

function addGrayScaleFilter(e: any) {
  emits('add-filter', { filter: new fabric.filters.Grayscale(), remove: !e.detail.checked })
}

function addSepiaFilter(e: any) {
  emits('add-filter', { filter: new fabric.filters.Sepia(), remove: !e.detail.checked })
}

function addInvertFilter(e: any) {
  emits('add-filter', { filter: new fabric.filters.Invert(), remove: !e.detail.checked })
}

function removeColorFilter() {
  emits('add-filter', {
    filter: new fabric.filters.BlendColor({
      color: '#000000',
      mode: 'tint'
    }),
    remove: true
  })
}

function addColorFilter(c: string) {
  emits('add-filter', {
    filter: new fabric.filters.BlendColor({
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

<style scoped>
ion-list {
  padding: 0;
}
</style>
