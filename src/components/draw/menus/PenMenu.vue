<template>
  <ion-popover
    :is-open="penMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
  >
    <ion-content class="divide-y divide-primary bg-background">
      <!-- Stroke Preview -->
      <div class="relative">
        <canvas ref="preview_canvas"></canvas>
      </div>

      <!-- Brush Size Slider -->
      <div class="px-2 pt-1">
        <label for="slider">Stroke Width: {{ brushSize }}</label>
        <ion-range aria-label="Volume" id="slider" v-model="brushSize" :min="0.1" :step="0.1" :max="50" color="secondary" />
      </div>

      <div class="px-2 pt-1">
        <label for="slider">Opacity: {{ opacity }}</label>
        <ion-range aria-label="Volume" id="slider" v-model="opacity" :min="0" :max="100" color="secondary" />
      </div>

      <tempate v-if="brushType === BrushType.Spray">
        <div class="px-2 pt-1">
          <label for="slider">Density: {{ density }}</label>
          <ion-range aria-label="Volume" id="slider" v-model="density" :min="1" :max="100" color="secondary" />
        </div>

        <div class="px-2 pt-1">
          <label for="slider">DotWidth: {{ dotWidth }}</label>
          <ion-range aria-label="Volume" id="slider" v-model="dotWidth" :min="0.5" :max="5" color="secondary" />
        </div>
      </tempate>

      <!-- Brush Type -->
      <div class="p-1">
        <label for="brush-type">Brush Type</label>
        <div class="flex justify-between mt-1 px-1" id="brush-type">
          <div
            class="brush_option bg-green-400"
            @click="selectBrushType(BrushType.Pencil)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Pencil) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Pencil])" />
          </div>


          <div
            class="brush_option bg-red-400"
            @click="selectBrushType(BrushType.WaterColor)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.WaterColor) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.WaterColor])" />
          </div>

          <div
            class="brush_option bg-blue-400"
            @click="selectBrushType(BrushType.Spray)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Spray) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Spray])" />
          </div>

          <div
            class="brush_option bg-yellow-400"
            @click="selectBrushType(BrushType.Circle)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Circle) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Circle])" />
          </div>

          <div
            class="brush_option bg-purple-400"
            @click="selectTool(DrawTool.Bucket)"
            :class="{ brush_selected: selectedTool === DrawTool.Bucket }"
          >
            <ion-icon :icon="svg(mdiFormatColorFill)" />
          </div>
        </div>

        <div class="flex justify-between mt-1 px-1" id="brush-type">
          <div
            class="brush_option bg-emerald-500"
            @click="selectBrushType(BrushType.Pixel)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Pixel) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Pixel])" />
          </div>


          <div
            class="brush_option bg-orange-400"
            @click="selectBrushType(BrushType.Crayon)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Crayon) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Crayon])" />
          </div>

          <div
            class="brush_option bg-neutral-600"
            @click="selectBrushType(BrushType.Charcoal)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Charcoal) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Charcoal])" />
          </div>

          <div
            class="brush_option bg-indigo-500"
            @click="selectBrushPaywall(BrushType.Neon)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.Neon) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.Neon])" />
          </div>

          <div
            class="brush_option bg-sky-400"
            @click="selectBrushPaywall(BrushType.CalliGraphy)"
            :class="{ brush_selected: isBrushTypeSelected(BrushType.CalliGraphy) }"
          >
            <ion-icon :icon="svg(penIconMapping[BrushType.CalliGraphy])" />
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
import { BrushType, DrawTool } from '@/draw/types/draw.types'
import { mdiFormatColorFill } from '@mdi/js'
import { isNative, svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/menu.store'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { usePen } from '@/draw/store/tools/pen.store'
import { Canvas, Point } from 'fabric'
import { hexWithOpacity, isColorTooLight, percentToAlphaHex } from '@/draw/utils/color.utils'
import { BLACK, WHITE } from '@/draw/config/canvas.config'
import { penBrushMapping, penIconMapping, PENMENUTOOLS } from '@/draw/config/tools.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useSubscriptionStore } from '@/store/subscription.store'
import { useBrushTrial } from '@/service/draw/brushTrial'

const { selectTool } = useToolSelection()
const { selectedTool } = storeToRefs(useToolSelection())
const { brushSize, brushColor, brushType, opacity, density, dotWidth } = storeToRefs(usePen())
const { penMenuOpen, menuEvent } = storeToRefs(useMenuStore())
const { useBrush } = useBrushTrial()
const subStore = useSubscriptionStore()


const preview_canvas = ref<HTMLCanvasElement>()

let canvas: Canvas | undefined

onMounted(() => {
  renderPreview()
})

const renderPreview = () => {
  if (!canvas) {
    canvas = new Canvas(preview_canvas.value!, {
      width: 256, // TODO hardcoded bad :c
      height: 64,
      selection: false
    })
  } else {
    canvas.clear()
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
  canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas)
  const brush = canvas.freeDrawingBrush as any
  brush.color = brushColorValue
  if (brushType.value === BrushType.Spray) {
    brush.density = density.value
    brush.dotWidth = dotWidth.value
  }
  brush.width = brushSizeValue


  const amplitude = 20
  const frequency = 0.05
  const yOffset = canvas.height! / 2

  // To create a custom path with the free drawing brush, we will need to simulate the mouse events.
  const points = [[0, yOffset]]
  for (let x = 1; x <= canvas.width!; x += 10) {
    const y = yOffset + amplitude * Math.sin(frequency * x)
    points.push([x, y])
  }

  const convertedPoints = points.map((p) => new Point(p[0], p[1]))


  // Synthetic mousedown event
  brush.onMouseDown(convertedPoints[0], {
    e: new MouseEvent('mousedown')
  })

  // Synthetic mousemove events
  for (let i = 1; i < points.length; i++) {
    brush.onMouseMove(convertedPoints[i], {
      e: new MouseEvent('mousemove')
    })
  }

  // Synthetic mouseup event
  brush.onMouseUp({
    e: new MouseEvent('mouseup')
  })
  canvas.getObjects().forEach((obj) => {
    obj.set('selectable', false)
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

async function selectBrushPaywall(type: BrushType) {
  if (!isNative()) {
    selectBrushType(type)
  } else {
    if (subStore.isPro) {
      selectBrushType(type)
      return
    }

    const allowed = await useBrush(type)

    if (allowed) {
      selectBrushType(type)
    } else {
      await subStore.presentPaywall()
    }
  }

}

watch(brushSize, renderPreview)
watch(opacity, renderPreview)
watch(brushColor, renderPreview)
watch(density, renderPreview)
watch(dotWidth, renderPreview)
watch(selectedTool, () => (selectedTool.value && PENMENUTOOLS.includes(selectedTool.value) ? renderPreview() : null))
</script>

<style scoped>
@reference "@/theme/main.css";

.brush_option {
  @apply cursor-pointer rounded-full w-[34px] h-[34px] flex justify-center items-center;
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