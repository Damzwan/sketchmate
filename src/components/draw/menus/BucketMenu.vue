<template>
  <ion-popover
    :is-open="bucketMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    side="top" alignment="center"
  >
    <ion-content class="divide-y divide-primary bg-background menu-scroll-container">
      <!-- Fill Preview -->
      <div class="relative flex items-center justify-center p-2 h-16">
        <div
          class="w-full h-full rounded-md border border-primary shadow-inner"
          :style="{ backgroundColor: previewColor }"
        ></div>
      </div>

      <!-- Opacity Slider -->
      <div class="px-4 pt-4 pb-2">
        <label class="text-xs uppercase tracking-wider opacity-60">Fill Opacity: {{ opacity }}%</label>
        <ion-range
          v-model="opacity"
          :min="0"
          :max="100"
          color="secondary"
        />
      </div>

      <!-- Shared Color Picker -->
      <ColorPicker v-model:color="brushColor" :reset="bucketMenuOpen" />
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useMenuStore } from '@/store/menu.store'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { usePen } from '@/draw/store/tools/pen.store'
import { hexWithOpacity, percentToAlphaHex } from '@/draw/utils/color.utils'

const { bucketMenuOpen, menuEvent } = storeToRefs(useMenuStore())
const { brushColor, opacity } = storeToRefs(usePen())

const previewColor = computed(() => {
  return hexWithOpacity(brushColor.value, percentToAlphaHex(opacity.value))
})

function onDismiss() {
  bucketMenuOpen.value = false
}
</script>

<style scoped>
@reference "@/theme/main.css";

label {
  @apply block text-sm font-medium text-gray-700;
}

.menu-scroll-container {
  --max-height: 50vh;
  height: var(--max-height);
}

ion-content::part(scroll) {
  max-height: var(--max-height);
}
</style>