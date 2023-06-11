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
      </div>
    </div>

    <ion-item color="tertiary" class="px-2" :button="true" @click="brushColorPicker?.click()">
      <div class="color_swatch" :style="{ backgroundColor: color }" />
      <p class="pl-3 text-base">Choose color</p>
      <input
        type="color"
        :value="props.color"
        @change="e => emit('update:color', e.target.value)"
        ref="brushColorPicker"
        class="hidden"
      />
    </ion-item>
  </div>
</template>

<script lang="ts" setup>
import { COLORSWATCHES } from '@/config/draw.config'
import { IonItem } from '@ionic/vue'
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  color: {
    type: String,
    required: true
  }
})

const brushColorPicker = ref<HTMLInputElement>()

const emit = defineEmits(['update:color'])
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
