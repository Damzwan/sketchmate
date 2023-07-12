<template>
  <div class="divide-y divide-primary bg-background">
    <div class="py-1 px-2">
      <label for="color-picker">Color</label>
      <div class="color-swatches mt-1">
        <div v-for="(row, rowIndex) in COLORSWATCHES" :key="'row-' + rowIndex" class="flex justify-between mb-2">
          <div
            v-for="(color, colorIndex) in row"
            :key="'color-' + colorIndex"
            :class="{ brush_selected: props.color == color }"
            :style="{ backgroundColor: color }"
            class="color_swatch"
            @click="emit('update:color', color)"
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

    <ion-item color="tertiary" class="px-2" :button="true" @click="brushColorPicker?.click()">
      <div class="color_swatch" :style="{ backgroundColor: color }" />
      <p class="pl-3 text-base">Choose color</p>
      <input type="color" :value="props.color" @change="onCustomColorSelected" ref="brushColorPicker" class="hidden" />
    </ion-item>
  </div>
</template>

<script lang="ts" setup>
import { COLORSWATCHES } from '@/config/draw.config'
import { IonItem } from '@ionic/vue'
import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

const colorHistory = ref<string[]>([])
Preferences.get({ key: LocalStorage.color_history }).then(
  res => (colorHistory.value = res.value ? JSON.parse(res.value) : [])
)
const emptySpaces = computed(() => 6 - colorHistory.value.length)

const props = defineProps({
  color: {
    type: String,
    required: true
  }
})

const brushColorPicker = ref<HTMLInputElement>()

const emit = defineEmits(['update:color'])

async function onCustomColorSelected(e: any) {
  emit('update:color', e.target.value)
  colorHistory.value.unshift(e.target.value)
  if (colorHistory.value.length > 6) colorHistory.value.pop()

  Preferences.set({ key: LocalStorage.color_history, value: JSON.stringify(colorHistory.value) })
}
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
