<template>
  <div class="divide-y divide-primary bg-background" ref="hmm">
    <div class="px-2 py-1" v-if="showOpacity && color">
      <label for="slider">Opacity: {{ alphaHexToPercent(opacityHex) }}</label>
      <ion-range aria-label="Volume" id="slider" :value="alphaHexToPercent(opacityHex)"
                 @ionChange="(e: any) => emit('update:color', hexWithOpacity(c, percentToAlphaHex(e.target.value)))"
                 min="0"
                 max="100" color="secondary" />
    </div>
    <div class="py-1 px-2">
      <label for="color-picker" class="!flex justify-between items-center">
        Color
        <ion-icon :icon="svg(mdiEyedropper)" size="large" class="cursor-pointer" @click="colorPicker" />
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

    <ion-popover :trigger="customColorPopoverId" :keep-contents-mounted="true" side="top" @willPresent="() => onCustomColorSelected(picker.color.hex)">
      <div ref="customColorParent" class="bg-primary"></div>
    </ion-popover>
  </div>
</template>

<script lang="ts" setup>
import { BLACK, COLORSWATCHES, ERASERS, PENMENUTOOLS } from '@/config/draw/draw.config'
import { IonIcon, IonItem, IonRange, popoverController, IonPopover } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'
import {
  alphaHexToPercent,
  exitColorPickerMode,
  getColorRecommendations,
  hexWithOpacity,
  hexWithoutOpacity,
  percentToAlphaHex,
  resetZoom,
  setSelectionForObjects
} from '@/helper/draw/draw.helper'
import { useEventManager } from '@/service/draw/eventManager.service'
import { DrawAction, DrawEvent } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { svg } from '@/helper/general.helper'
import { mdiEyedropper } from '@mdi/js'
import { v4 as uuidv4 } from 'uuid'
import Picker from 'vanilla-picker'

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

function colorPicker() {
  const { isolatedSubscribe } = useEventManager()
  const { getCanvas, selectAction, selectedTool } = useDrawStore()
  const { colorPickerMode } = storeToRefs(useDrawStore())
  const c = getCanvas()

  const lastSelectedObject = c.getActiveObject()
  colorPickerMode.value = true

  setSelectionForObjects(
    c.getObjects().filter(o => !c.getActiveObjects().includes(o)),
    false
  )

  if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
    c.isDrawingMode = false
    c.setCursor(c.defaultCursor!)
  }

  popoverController.dismiss()
  isolatedSubscribe({
    on: 'mouse:down:before',
    type: DrawEvent.ColorPicker,
    handler: (options: any) => {
      const pointer = c.getPointer(options.e)
      const dpr = window.devicePixelRatio || 1
      const x = Math.floor(pointer.x * dpr)
      const y = Math.floor(pointer.y * dpr)

      const oldZoom = c.getZoom()
      const oldViewportTransform = c.viewportTransform

      resetZoom(c)
      c.renderAll()

      // Get pixel data
      const ctx = c.getContext()
      const pixel = ctx.getImageData(x, y, 1, 1).data

      c.setViewportTransform(oldViewportTransform!)
      c.setZoom(oldZoom)
      c.renderAll()

      const hex =
        '#' +
        ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase() +
        pixel[3].toString(16).toUpperCase().padStart(2, '0')

      onCustomColorSelected(hex)
      if (props.colorPickerAction) selectAction(props.colorPickerAction, { color: hex })
      exitColorPickerMode()
    }
  })

  isolatedSubscribe({
    on: 'selection:cleared',
    type: DrawEvent.ColorPicker,
    handler: () => {
      if (lastSelectedObject) c.setActiveObject(lastSelectedObject)
    }
  })
}

watch(props, async () => {
  if (props.reset) getSavedColorHistory()
})
</script>

<style scoped>
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
.picker_wrapper {
  background: var(--ion-color-tertiary) !important;
}


.picker_selector {
  border: 2px solid var(--ion-color-primary) !important;
}

.picker_done button {
  background-image: none !important;
  @apply bg-primary rounded-md hover:bg-primary-shade !important
}
</style>

