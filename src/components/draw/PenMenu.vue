<template>
  <ion-popover :is-open="penMenuOpen" :event="event" @didDismiss="penMenuOpen = false" @willPresent="renderPreview">
    <ion-content class="divide-y divide-primary">
      <!-- Stroke Preview -->
      <div class="relative">
        <canvas id="preview-canvas" ref="ca" class="w-full h-16 bg-white"></canvas>
      </div>

      <!-- Brush Size Slider -->
      <div class="brush-size px-1 pt-1">
        <label for="slider" class="block text-sm font-medium text-gray-700">Size</label>
        <ion-range aria-label="Volume" id="slider" v-model="brushSize" min="1" max="50" color="secondary"></ion-range>
      </div>

      <!-- Brush Type -->
      <div class="py-2 px-1">
        <label for="brush-type" class="block text-sm font-medium text-gray-700">Brush Type</label>
        <div class="flex justify-between mt-1 px-6" id="brush-type">
          <div
            class="brush_option bg-green-400"
            @click="brushType = BrushType.Pencil"
            :class="{ brush_selected: brushType === BrushType.Pencil }"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" />
          </div>

          <div
            class="brush_option bg-blue-400"
            @click="brushType = BrushType.Spray"
            :class="{ brush_selected: brushType === BrushType.Spray }"
          >
            <ion-icon :icon="svg(mdiSpray)" />
          </div>

          <div
            class="brush_option bg-yellow-400"
            @click="brushType = BrushType.Circle"
            :class="{ brush_selected: brushType === BrushType.Circle }"
          >
            <ion-icon :icon="svg(mdiCircleOutline)" />
          </div>

          <div
            class="brush_option bg-purple-400"
            @click="onBucketClick"
            :class="{ brush_selected: brushType === BrushType.Bucket }"
          >
            <ion-icon :icon="svg(mdiBucketOutline)" />
          </div>
        </div>
      </div>

      <!-- Color Picker -->
      <div class="py-1 px-1">
        <label for="color-picker" class="block text-sm font-medium text-gray-700">Color</label>
        <div class="color-swatches mt-1">
          <div
            v-for="(row, rowIndex) in COLORSWATCHES"
            :key="'row-' + rowIndex"
            class="color-row flex justify-between mb-2"
          >
            <div
              v-for="(color, colorIndex) in row"
              :key="'color-' + colorIndex"
              :style="{ backgroundColor: color }"
              class="color-swatch w-8 h-8 border border-gray-300 rounded-full cursor-pointer"
              @click="brushColor = color"
            />
          </div>
        </div>
      </div>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw.store'
import { watch } from 'vue'
import { COLORSWATCHES } from '@/config/draw.config'
import { BrushType, DrawAction } from '@/types/draw.types'
import { mdiBucketOutline, mdiCircleOutline, mdiPencilOutline, mdiSpray } from '@mdi/js'
import { svg } from '@/helper/general.helper'

const drawStore = useDrawStore()
const { penMenuOpen, event, brushSize, brushColor, brushType, c } = storeToRefs(drawStore)

const renderPreview = () => {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  ctx!.clearRect(0, 0, canvas.width, canvas.height)

  ctx!.strokeStyle = brushColor.value
  ctx!.lineWidth = brushSize.value

  const amplitude = 20
  const frequency = 0.05
  const yOffset = canvas.height / 2

  ctx!.beginPath()
  ctx!.moveTo(0, yOffset)

  for (let x = 1; x <= canvas.width; x++) {
    const y = yOffset + amplitude * Math.sin(frequency * x)
    ctx!.lineTo(x, y)
  }

  ctx!.stroke()
}

function onBucketClick() {
  brushType.value = BrushType.Bucket
  drawStore.selectAction(DrawAction.Bucket)
}

watch(brushSize, () => {
  renderPreview()
})
watch(brushColor, renderPreview)
</script>

<style>
.brush_option {
  @apply cursor-pointer rounded-full w-[32px] h-[32px] flex justify-center items-center;
}

.brush_option ion-icon {
  @apply w-[20px] h-[20px];
}

.brush_selected {
  @apply border-2 border-secondary;
}
</style>
