<template>
  <div class="divide-y divide-primary bg-background">
    <div class="px-2 py-1" v-if="showOpacity && color">
      <label for="slider">Opacity: {{ alphaHexToPercent(opacityHex) }}</label>
      <ion-range
        aria-label="Volume"
        id="slider"
        :value="alphaHexToPercent(opacityHex)"
        @ionChange="(e: any) => emit('update:color', hexWithOpacity(c, percentToAlphaHex(e.target.value)))"
        min="0"
        max="100"
        color="secondary"
      />
    </div>
    <div class="py-1 px-2">
      <label for="color-picker">Color</label>
      <div class="mt-1">
        <div v-for="(row, rowIndex) in COLORSWATCHES" :key="'row-' + rowIndex" class="flex justify-between mb-2">
          <div
            v-for="(color, colorIndex) in row"
            :key="'color-' + colorIndex"
            :class="{ brush_selected: props.color == color }"
            :style="{ backgroundColor: color }"
            class="color_swatch"
            @click="emit('update:color', hexWithOpacity(color, opacityHex))"
          />
        </div>
        <div class="flex mb-2 justify-between" v-if="colorHistory.length > 0">
          <div
            v-for="(color, colorIndex) in colorHistory"
            :key="'color_history-' + colorIndex"
            :class="{ brush_selected: props.color == color }"
            :style="{ backgroundColor: color }"
            class="color_swatch"
            @click="emit('update:color', color)"
          />

          <div v-for="i in emptySpaces" :key="'empty-' + i" class="color_swatch" />
        </div>
      </div>
    </div>

    <div class="py-1 px-2">
      <label for="color-picker">Color recommendations</label>
      <div class="mt-1">
        <div
          v-for="(row, rowIndex) in getColorRecommendations(c)"
          :key="'row-' + rowIndex"
          class="flex justify-between mb-2"
        >
          <div
            v-for="(color, colorIndex) in row"
            :key="'color-' + colorIndex"
            :class="{ brush_selected: props.color == color }"
            :style="{ backgroundColor: color }"
            class="color_swatch"
            @click="onCustomColorSelected(color)"
          />
        </div>
      </div>
    </div>

    <ion-item color="tertiary" class="px-2" :button="true" @click="brushColorPicker?.click()">
      <div class="color_swatch" :style="{ backgroundColor: color }" />
      <p class="pl-3 text-base">Choose color</p>
      <input
        type="color"
        :value="props.color"
        @change="e => onCustomColorSelected(e.target.value)"
        ref="brushColorPicker"
        class="hidden"
      />
    </ion-item>
  </div>
</template>

<script lang="ts" setup>
import { BLACK, COLORSWATCHES } from '@/config/draw/draw.config'
import { IonItem, IonRange } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'
import {
  alphaHexToPercent,
  getColorRecommendations,
  hexWithOpacity,
  percentToAlphaHex
} from '@/helper/draw/draw.helper'

const colorHistory = ref<string[]>([])
const emptySpaces = computed(() => 6 - colorHistory.value.length)

getSavedColorHistory()

const props = defineProps<{
  color?: string
  reset?: boolean
  showOpacity?: boolean
}>()

const brushColorPicker = ref<HTMLInputElement>()

const emit = defineEmits(['update:color'])

const c = computed(() => props?.color || BLACK)
const opacityHex = computed(() => (c.value.substring(7, 9) != '' ? c.value.substring(7, 9) : 'FF'))

function getSavedColorHistory() {
  Preferences.get({ key: LocalStorage.color_history }).then(
    res => (colorHistory.value = res.value ? JSON.parse(res.value) : [])
  )
}

async function onCustomColorSelected(newColor: string) {
  emit('update:color', hexWithOpacity(newColor, opacityHex.value))
  if (colorHistory.value.includes(newColor) || COLORSWATCHES.some(arr => arr.includes(newColor))) return
  colorHistory.value.unshift(newColor)
  if (colorHistory.value.length > 6) colorHistory.value.pop()
  Preferences.set({ key: LocalStorage.color_history, value: JSON.stringify(colorHistory.value) })
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
