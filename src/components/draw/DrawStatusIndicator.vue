<template>
  <transition name="pop-down">
    <div
      v-if="isActive"
      class="absolute mt-18 top-safe left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center px-4 py-2.5 bg-background backdrop-blur-md rounded-full shadow-lg border border-white/20"
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
        <circle cx="12" cy="12" r="10" class="sketch-circle" stroke-dasharray="45 20" />
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
import { useBucket } from "@/draw/store/tools/bucket.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { useDrawUIStore } from "@/draw/store/drawUI.store";

const drawSyncer = useDrawSyncer();
const { isSending } = storeToRefs(useShareService());
const { isLoadingCanvas } = storeToRefs(drawSyncer);
const { isSavingDrawing } = storeToRefs(useDrawUIStore());
const { isFilling } = storeToRefs(useBucket());

const isActive = computed(
	() =>
		isSending.value ||
		isLoadingCanvas.value ||
		isSavingDrawing.value ||
		isFilling.value,
);

const message = computed(() => {
	if (isSending.value) return "Sending...";
	if (isSavingDrawing.value) return "Saving...";
	if (isLoadingCanvas.value) return "Loading...";
	if (isFilling.value) return "Filling...";
	return "Working...";
});
</script>

<style scoped>
.animate-spin-slow {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
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