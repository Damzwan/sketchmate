<template>
  <ion-popover trigger="img-style" :showBackdrop="false">
    <ion-content class="divide-y divide-primary">
      <ion-list lines="none" class="p-0">
        <ion-item color="tertiary">
          <ion-toggle color="secondary" :checked="isGrayScale" @ionChange="localChange">Black/White</ion-toggle>
        </ion-item>
        <ion-item color="tertiary">
          <ion-toggle
            color="secondary"
            :checked="isSepia"
            @ionChange="
              e => emits('add-filter', { filter: new fabric.Image.filters.Sepia(), remove: !e.detail.checked })
            "
            >Sepia</ion-toggle
          >
        </ion-item>
        <ion-item color="tertiary">
          <ion-toggle
            color="secondary"
            :checked="isInvert"
            @ionChange="
              e => emits('add-filter', { filter: new fabric.Image.filters.Invert(), remove: !e.detail.checked })
            "
            >Invert</ion-toggle
          >
        </ion-item>
      </ion-list>
      <ion-list lines="none" class="p-0 divide-y divide-primary">
        <ColorPicker
          @update:color="
            c =>
              emits('add-filter', {
                filter: new fabric.Image.filters.BlendColor({
                  color: c,
                  mode: 'tint'
                })
              })
          "
          :show-opacity="true"
          :color-picker-action="DrawAction.ChangeBackgroundColor"
        />
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonList, IonPopover, IonToggle, IonItem } from '@ionic/vue'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { DrawAction } from '@/types/draw.types'
import { fabric } from 'fabric'
import { computed } from 'vue'

const props = defineProps<{
  img: fabric.Image
}>()

const isGrayScale = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Grayscale'))
const isSepia = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Sepia'))
const isInvert = computed(() => !!props.img.filters?.find((f: any) => f.type == 'Invert'))

function localChange(e: any) {
  emits('add-filter', { filter: new fabric.Image.filters.Grayscale(), remove: !e.detail.checked })
}

const emits = defineEmits<{
  (e: 'add-filter', options: any): void
}>()
</script>

<style scoped></style>
