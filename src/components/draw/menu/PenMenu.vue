<template>
  <ion-popover
    :is-open="penMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
  >
    <ion-content class="divide-y divide-primary">
      <!-- Stroke Preview -->
      <div class="relative">
        <canvas ref="preview_canvas"></canvas>
      </div>

      <!-- Brush Size Slider -->
      <div class="px-2 pt-1">
        <label for="slider">Stroke Width: {{ brushSize }}</label>
        <ion-range aria-label="Volume" id="slider" v-model="brushSize" min="2" max="50" color="secondary" />
      </div>

      <div class="px-2 pt-1">
        <label for="slider">Opacity: {{ opacity }}</label>
        <ion-range aria-label="Volume" id="slider" v-model="opacity" min="0" max="100" color="secondary" />
      </div>

      <!-- Brush Type -->
      <div class="p-1">
        <label for="brush-type">Brush Type</label>
        <div class="flex justify-between mt-1 px-2" id="brush-type">
          <div
            class="brush_option bg-green-400"
            @click="selectBrushType(BrushType.Pencil)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Pencil) }"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" />
          </div>

          <div
            class="brush_option bg-pink-400"
            @click="selectBrushType(BrushType.Ink)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Ink) }"
          >
            <ion-icon :icon="svg(mdiLiquidSpot)" />
          </div>

          <div
            class="brush_option bg-blue-400"
            @click="selectBrushType(BrushType.Spray)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Spray) }"
          >
            <ion-icon :icon="svg(mdiSpray)" />
          </div>

          <div
            class="brush_option bg-yellow-400"
            @click="selectBrushType(BrushType.Circle)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Circle) }"
          >
            <ion-icon :icon="svg(mdiCircleOutline)" />
          </div>

          <div
            class="brush_option bg-purple-400"
            @click="selectTool(DrawTool.Bucket)"
            :class="{ brush_selected: selectedTool === DrawTool.Bucket }"
          >
            <ion-icon :icon="svg(mdiFormatColorFill)" />
          </div>
        </div>
      </div>

      <!-- Color Picker -->
      <ColorPicker v-model:color="brushColor" :reset="penMenuOpen" />
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { BLACK, PENMENUTOOLS, WHITE } from '@/config/draw/draw.config'
import { BrushType, DrawTool } from '@/types/draw.types'
import { mdiCircleOutline, mdiFormatColorFill, mdiLiquidSpot, mdiPencilOutline, mdiSpray } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/draw/menu.store'
import { brushMapping, usePen } from '@/service/draw/tools/pen.tool'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { hexWithOpacity, isColorTooLight, percentToAlphaHex, setObjectSelection } from '@/helper/draw/draw.helper'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { useDrawStore } from '@/store/draw/draw.store'

const { selectTool, getCanvas } = useDrawStore()
const { selectedTool } = storeToRefs(useDrawStore())
const { brushSize, brushColor, brushType, opacity } = storeToRefs(usePen())
const { penMenuOpen, menuEvent } = storeToRefs(useMenuStore())

const preview_canvas = ref<HTMLCanvasElement>()

let canvas: Canvas | undefined

onMounted(() => {
  renderPreview()
})

const renderPreview = () => {
  // Initialize canvas only once
  if (!canvas) {
    canvas = new fabric.Canvas(preview_canvas.value!, {
      width: preview_canvas.value!.width,
      height: 64,
      selection: false
    })
  } else {
    canvas.clear() // clear canvas before re-drawing
  }

  const brushColorValue = hexWithOpacity(brushColor.value, percentToAlphaHex(opacity.value))

  if (selectedTool.value == DrawTool.Bucket) {
    canvas.backgroundColor = brushColorValue
    canvas.renderAll()
    return
  }

  const brushSizeValue = brushSize.value

  canvas.backgroundColor = isColorTooLight(brushColorValue) ? BLACK : WHITE

  // Assign the selected brush to the canvas
  // TOOD this should be somewhere else
  canvas.freeDrawingBrush = brushMapping[brushType.value](canvas)
  const brush = canvas.freeDrawingBrush as any
  brush.width = brushSizeValue
  brush.color = brushColorValue

  const amplitude = 20
  const frequency = 0.05
  const yOffset = canvas.height! / 2

  // To create a custom path with the free drawing brush, we will need to simulate the mouse events.
  const points = [[0, yOffset]]
  for (let x = 1; x <= canvas.width!; x += 10) {
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

  canvas.getObjects().forEach(obj => {
    setObjectSelection(obj, false)
  })
  canvas.renderAll()
}

function onDismiss() {
  penMenuOpen.value = false
}

function selectBrushType(newBrushType: BrushType) {
  if (selectedTool.value != DrawTool.Pen) selectTool(DrawTool.Pen)
  brushType.value = newBrushType
  renderPreview()
}

function isBrushTypeSelected(type: BrushType) {
  return brushType.value == type && selectedTool.value == DrawTool.Pen
}

watch(brushSize, renderPreview)
watch(opacity, renderPreview)
watch(brushColor, renderPreview)
watch(selectedTool, () => (selectedTool.value && PENMENUTOOLS.includes(selectedTool.value) ? renderPreview() : null))
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

ion-item {
  --inner-padding-end: 0;
  --padding-start: 0;
}

label {
  @apply block text-sm font-medium text-gray-700;
}
</style>
