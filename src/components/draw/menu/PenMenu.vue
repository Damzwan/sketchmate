<template>
  <ion-popover :is-open="penMenuOpen" :event="menuEvent" @didDismiss="onDismiss" @willPresent="renderPreview">
    <ion-content class="divide-y divide-primary">
      <!-- Stroke Preview -->
      <div class="relative">
        <canvas ref="preview_canvas"></canvas>
      </div>

      <!-- Brush Size Slider -->
      <div class="brush-size px-2 pt-1">
        <label for="slider">Size</label>
        <ion-range aria-label="Volume" id="slider" v-model="brushSize" min="1" max="50" color="secondary"></ion-range>
      </div>

      <!-- Brush Type -->
      <div class="p-1">
        <label for="brush-type">Brush Type</label>
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
      <div class="py-1 px-2">
        <label for="color-picker">Color</label>
        <div class="color-swatches mt-1">
          <div v-for="(row, rowIndex) in COLORSWATCHES" :key="'row-' + rowIndex" class="flex justify-between mb-2">
            <div
              v-for="(color, colorIndex) in row"
              :key="'color-' + colorIndex"
              :class="{ brush_selected: brushColor == color }"
              :style="{ backgroundColor: color }"
              class="color_swatch"
              @click="brushColor = color"
            />
          </div>
        </div>
      </div>

      <ion-item color="tertiary" class="px-2" :button="true" @click="brushColorPicker?.click()">
        <div class="color_swatch" :style="{ backgroundColor: brushColor }" />
        <p class="pl-3 text-base">Choose color</p>
        <input type="color" v-model="brushColor" ref="brushColorPicker" class="hidden" />
      </ion-item>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonItem, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { COLORSWATCHES, WHITE } from '@/config/draw.config'
import { BrushType } from '@/types/draw.types'
import { mdiBucketOutline, mdiCircleOutline, mdiPencilOutline, mdiSpray } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/draw/menu.store'
import { brushMapping, usePen } from '@/service/draw/tools/pen.service'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'

const { brushSize, brushColor, brushType } = storeToRefs(usePen())
const { penMenuOpen, menuEvent } = storeToRefs(useMenuStore())

const brushColorPicker = ref<HTMLInputElement>()
const preview_canvas = ref<HTMLCanvasElement>()

let canvas: Canvas | undefined

const renderPreview = () => {
  // Initialize canvas only once
  if (!canvas) {
    canvas = new fabric.Canvas(preview_canvas.value!, {
      width: preview_canvas.value!.width,
      height: 64,
      isDrawingMode: true
    })
  } else {
    canvas.clear() // clear canvas before re-drawing
  }

  if (brushType.value == BrushType.Bucket) {
    canvas.backgroundColor = brushColor.value
    return
  }
  canvas.backgroundColor = WHITE

  const brushColorValue = brushColor.value
  const brushSizeValue = brushSize.value

  // Assign the selected brush to the canvas
  canvas.freeDrawingBrush = brushMapping[brushType.value](canvas)
  const brush = canvas.freeDrawingBrush as any
  brush.width = brushSizeValue
  brush.color = brushColorValue

  const amplitude = 20
  const frequency = 0.05
  const yOffset = canvas.height! / 2

  // To create a custom path with the free drawing brush, we will need to simulate the mouse events.
  const points = [[0, yOffset]]
  for (let x = 1; x <= canvas.width!; x += 5) {
    const y = yOffset + amplitude * Math.sin(frequency * x)
    points.push([x, y])
  }

  // Synthetic mousedown event
  brush.onMouseDown(
    {
      x: points[0][0],
      y: points[0][1]
    },
    {
      e: new MouseEvent('mousedown')
    }
  )

  // Synthetic mousemove events
  for (let i = 1; i < points.length; i++) {
    brush.onMouseMove(
      {
        x: points[i][0],
        y: points[i][1]
      },
      {
        e: new MouseEvent('mousemove')
      }
    )
  }

  // Synthetic mouseup event
  brush.onMouseUp({
    e: new MouseEvent('mouseup')
  })

  canvas.renderAll()
}

function onDismiss() {
  penMenuOpen.value = false
  canvas = undefined
}

watch(brushSize, renderPreview)
watch(brushColor, renderPreview)
watch(brushType, renderPreview)
</script>

<style scoped>
.brush_option {
  @apply cursor-pointer rounded-full w-[38px] h-[38px] flex justify-center items-center;
}

.brush_option ion-icon {
  @apply w-[20px] h-[20px];
}

.brush_selected {
  @apply border-[3px] border-secondary;
}

.color_swatch {
  @apply w-8 h-8 rounded-full cursor-pointer;
}

ion-item {
  --inner-padding-end: 0;
  --padding-start: 0;
}

label {
  @apply block text-sm font-medium text-gray-700;
}
</style>
