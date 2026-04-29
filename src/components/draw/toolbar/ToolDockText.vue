<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-lg space-x-1"
  >
    <ToolButton
      :icon="svg(mdiClose)"
      @click="exitTextMode"
      custom-class="hover:bg-primary/20"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <div class="px-3 flex items-center justify-center">
      <span class="text-sm font-bold text-black/80 whitespace-nowrap animate-pulse tracking-tight">
        Tap canvas to type...
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDrawStore } from '@/draw/store/draw.store'
import ToolButton from './ToolButton.vue'
import { mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { DrawAction } from '@/draw/types/draw.types'

const { selectAction } = useDrawStore()

const exitTextMode = () => {
  // Cleans up the "Add Text" state and returns to the default tool
  selectAction(DrawAction.ExitTextAddingMode, undefined)
}
</script>

<style scoped>
/* Optional: Subtle pulse speed adjustment for a smoother feel */
.animate-pulse {
  animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>