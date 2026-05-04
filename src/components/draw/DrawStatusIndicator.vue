<template>
  <transition name="pop-down">
    <div
      v-if="isActive"
      class="absolute top-18 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-md border-2 border-primary/40 rounded-full shadow-lg"
    >
      <svg class="w-5 h-5 mr-3 text-secondary animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" class="sketch-circle" />
      </svg>
      <span class="text-sm font-bold text-black tracking-widest uppercase cabin-sketch-regular pt-0.5">
        {{ message }}
      </span>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

const drawStore = useDrawStore()
const drawSyncer = useDrawSyncer()

const { isSendingDrawing } = storeToRefs(drawStore)
const { isLoadingCanvas } = storeToRefs(drawSyncer)

const isActive = computed(() => isSendingDrawing.value || isLoadingCanvas.value)

const message = computed(() => {
  if (isSendingDrawing.value) return 'Sending...'
  if (isLoadingCanvas.value) return 'Loading...'
  return 'Working...'
})
</script>

<style scoped>
.pop-down-enter-active,
.pop-down-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-down-enter-from,
.pop-down-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.95);
}
</style>