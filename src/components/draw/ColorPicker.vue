<template>
  <div class="divide-y divide-primary bg-background" ref="hmm">
    <div class="px-2 py-1" v-if="showOpacity && color">
      <label for="slider">Opacity: {{ alphaHexToPercent(opacityHex) }}</label>
      <ion-range aria-label="Volume" id="slider" :value="alphaHexToPercent(opacityHex)"
                 @ionChange="(e: any) => emit('update:color', hexWithOpacity(c, percentToAlphaHex(e.target.value)))"
                 :min="0"
                 :max="100" color="secondary" />
    </div>
    <div class="py-1 px-2">
      <label for="color-picker" class="!flex justify-between items-center">
        Color
        <ion-button @click="pickColor" size="small" fill="clear" class="text-black">
          <ion-icon :icon="svg(mdiEyedropper)" size="large" />
        </ion-button>
      </label>

      <div class="mt-1">
        <div v-for="(row, rowIndex) in COLORSWATCHES" :key="'row-' + rowIndex" class="flex justify-between mb-2">
          <div v-for="(color, colorIndex) in row" :key="'color-' + colorIndex"
               :class="{ brush_selected: props.color == hexWithOpacity(color, opacityHex) }"
               :style="{ backgroundColor: hexWithOpacity(color, opacityHex) }" class="color_swatch"
               @click="emit('update:color', hexWithOpacity(color, opacityHex))" />
        </div>
        <div class="flex mb-2 justify-between" v-if="colorHistory.length > 0">
          <div v-for="(color, colorIndex) in colorHistory" :key="'color_history-' + colorIndex"
               :class="{ brush_selected: props.color == hexWithOpacity(color, opacityHex) }"
               :style="{ backgroundColor: hexWithOpacity(color, opacityHex) }" class="color_swatch"
               @click="emit('update:color', hexWithOpacity(color, opacityHex))" />

          <div v-for="i in emptySpaces" :key="'empty-' + i" class="color_swatch" />
        </div>
      </div>
    </div>

    <div class="py-1 px-2">
      <label for="color-picker">Color recommendations</label>
      <div class="mt-1">
        <div v-for="(row, rowIndex) in getColorRecommendations(c)" :key="'row-' + rowIndex"
             class="flex justify-between mb-2">
          <div v-for="(color, colorIndex) in row" :key="'color-' + colorIndex" :style="{ backgroundColor: color }"
               class="color_swatch" @click="onCustomColorSelected(color)" />
        </div>
      </div>
    </div>

    <ion-item color="tertiary" class="px-2" :button="true" :id="customColorPopoverId">
      <div class="color_swatch" :style="{ backgroundColor: color }" />
      <p class="pl-3 text-base">Choose color</p>
      <input type="color" :value="props.color" @change="e => onCustomColorSelected(e.target.value)"
             ref="brushColorPicker"
             class="hidden" />
    </ion-item>

    <ion-popover :trigger="customColorPopoverId" :keep-contents-mounted="true" side="top"
                 @willPresent="() => props.color ? picker.setColor(props.color) : null">
      <div ref="customColorParent" class="bg-primary"></div>
    </ion-popover>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonItem, IonPopover, IonRange, popoverController, IonButton } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

import { DrawAction } from '@/draw/types/draw.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { isMobile, svg } from '@/helper/general.helper'
import { mdiEyedropper } from '@mdi/js'
import { v4 as uuidv4 } from 'uuid'
import Picker from 'vanilla-picker'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { exitColorPickerMode } from '@/draw/actions/color.action'
import { disableSelection } from '@/draw/helpers/select.helper'
import {
  alphaHexToPercent,
  getColorRecommendations,
  hexWithOpacity,
  hexWithoutOpacity,
  percentToAlphaHex
} from '@/draw/utils/color.utils'
import { BLACK, COLORSWATCHES } from '@/draw/config/canvas.config'
import { ERASERS, PENMENUTOOLS } from '@/draw/config/tools.config'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

const hmm = ref() // TODO hack to only close top popover
const customColorPopoverId = uuidv4()
const customColorParent = ref()
const colorHistory = ref<string[]>([])
const emptySpaces = computed(() => 6 - colorHistory.value.length)

let picker: any

getSavedColorHistory()

onMounted(() => {
  picker = new Picker({
    parent: customColorParent.value,
    popup: false,
    alpha: false,
    editor: false,
    color: props.color,
    onDone: async (c) => {
      onCustomColorSelected(c.hex)
      hmm.value.click() // hack to close current popover
    }
  })
})

const props = defineProps<{
  color?: string
  reset?: boolean
  showOpacity?: boolean
  colorPickerAction?: DrawAction
}>()


const emit = defineEmits(['update:color'])

const c = computed(() => props?.color || BLACK)
const opacityHex = computed(() => (c.value.substring(7, 9) != '' ? c.value.substring(7, 9) : 'FF'))

function getSavedColorHistory() {
  Preferences.get({ key: LocalStorage.color_history }).then(
    res => (colorHistory.value = res.value ? JSON.parse(res.value) : [])
  )
}

async function onCustomColorSelected(newColor: string) {
  newColor = hexWithoutOpacity(newColor)
  emit('update:color', hexWithOpacity(newColor, opacityHex.value))
  if (colorHistory.value.includes(newColor) || COLORSWATCHES.some(arr => arr.includes(newColor))) return
  colorHistory.value.unshift(newColor)
  if (colorHistory.value.length > 6) colorHistory.value.pop()
  Preferences.set({ key: LocalStorage.color_history, value: JSON.stringify(colorHistory.value) })
}

function pickColor(e: any) {
  const { getCanvas, selectAction } = useDrawStore()
  const { activateExclusiveEvents } = useDrawEventManager()
  const { selectedTool } = useToolSelection()
  const { colorPickerMode } = storeToRefs(useDrawUIStore())
  const c = getCanvas()


  const lastSelectedObject = c.getActiveObject()
  colorPickerMode.value = true


  disableSelection()

  if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
    c.isDrawingMode = false
  }


  function updateColorIndicator(color: string, e?: any, size = isMobile() ? 80 : 32) {
    const zoom = c.getZoom()
    const adjustedSize = size * zoom

    if (!isMobile()) {
      // --- Desktop: set custom cursor ---
      const canvas = document.createElement('canvas')
      canvas.width = adjustedSize
      canvas.height = adjustedSize
      const ctx = canvas.getContext('2d')!

      const center = adjustedSize / 2
      const radius = adjustedSize / 2 - 1

      // Main circle
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Border
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.stroke()

      // Crosshair (dual stroke)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#000'
      ctx.beginPath()
      ctx.moveTo(center, 0)
      ctx.lineTo(center, adjustedSize)
      ctx.moveTo(0, center)
      ctx.lineTo(adjustedSize, center)
      ctx.stroke()

      ctx.lineWidth = 1
      ctx.strokeStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(center, 0)
      ctx.lineTo(center, adjustedSize)
      ctx.moveTo(0, center)
      ctx.lineTo(adjustedSize, center)
      ctx.stroke()

      const url = canvas.toDataURL('image/png')
      c.freeDrawingCursor = `url(${url}) ${center} ${center}, crosshair`
      c.setCursor(c.freeDrawingCursor)

    } else if (e) {
      const pointer = e.pointer
      const ctx = c.contextTop

      ctx.clearRect(0, 0, c.width, c.height) // Clear previous indicator

      const offsetY = -60 * zoom // shift circle above finger
      const centerX = pointer.x
      const centerY = pointer.y + offsetY
      const radius = adjustedSize / 2

      // Outer stroke (black for visibility)
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.stroke()

      // Inner stroke (white for contrast)
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Fill circle
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius - 2, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    }
  }


  activateExclusiveEvents([
    {
      on: 'mouse:up', handler: (options: any) => {
        exitColorPickerMode({ lastSelectedObjectRef: lastSelectedObject })
        const pointer = options.pointer
        const dpr = window.devicePixelRatio || 1
        const ctx = c.getContext()
        const pixel = ctx.getImageData(pointer.x * dpr, pointer.y * dpr, 1, 1).data

        const hex =
          '#' +
          ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase() +
          pixel[3].toString(16).toUpperCase().padStart(2, '0')

        onCustomColorSelected(hex)
        if (props.colorPickerAction) selectAction(props.colorPickerAction, { color: hex })

        c.freeDrawingCursor = 'default'
        c.requestRenderAll()

        if (c.contextTop) {
          c.contextTop.clearRect(0, 0, c.width, c.height)
        }
      }
    },
    {
      on: 'mouse:move', handler: (options: any) => {
        const pointer = c.getViewportPoint(options.e)
        const dpr = window.devicePixelRatio || 1
        const ctx = c.getContext()
        const pixel = ctx.getImageData(pointer.x * dpr, pointer.y * dpr, 1, 1).data
        const color = `rgba(${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3] / 255})`
        updateColorIndicator(color, options)
      }
    }
  ])

  popoverController.dismiss()

}

watch(props, async () => {
  if (props.reset) getSavedColorHistory()
})
</script>

<style scoped>
@reference "@/theme/main.css";
.brush_selected {
  @apply border-[3px] border-secondary;
}

.color_swatch {
  @apply w-8 h-8 rounded-full cursor-pointer;
}

label {
  @apply block text-sm font-medium text-gray-700;
}

ion-item {
  --inner-padding-end: 0;
  --padding-start: 0;
}
</style>

<style>
@reference "@/theme/main.css";

.picker_wrapper {
  background: var(--ion-color-tertiary)
}


.picker_selector {
  border: 2px solid var(--ion-color-primary)
}

.picker_done button {
  background-image: none !important;
  @apply bg-primary rounded-md hover:bg-primary-shade
}
</style>

