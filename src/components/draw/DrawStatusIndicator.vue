<template>
  <transition name="pop-down">
    <div
      v-if="isActive"
      class="absolute mt-18 top-safe left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center px-4 py-2.5 bg-background backdrop-blur-md rounded-full shadow-lg"
    >
      <svg
        class="w-5 h-5 mr-3 text-secondary animate-spin-slow"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- dasharray="45 20" creates the gap so you can actually see it spin -->
        <circle
          cx="12"
          cy="12"
          r="10"
          class="sketch-circle"
          stroke-dasharray="45 20"
        />
      </svg>
      <span class="text-sm font-bold text-black tracking-widest uppercase cabin-sketch-regular pt-0.5">
        {{ message }}
      </span>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useShareService } from "@/draw/store/useShareService.store";

const drawSyncer = useDrawSyncer();

const { isSending } = storeToRefs(useShareService());
const { isLoadingCanvas } = storeToRefs(drawSyncer);

const isActive = computed(() => isSending.value || isLoadingCanvas.value);

const message = computed(() => {
	if (isSending.value) return "Sending...";
	if (isLoadingCanvas.value) return "Loading...";
	return "Working...";
});
</script>

<style scoped>
/* Define the slow spin specifically for this component */
.animate-spin-slow {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.pop-down-enter-active,
.pop-down-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-down-enter-from,
.pop-down-leave-to {
  opacity: 0;
  /* Maintain the -50% to keep it centered during the transition */
  transform: translate(-50%, -20px) scale(0.95);
}
</style>