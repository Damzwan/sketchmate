<template>
  <div class="absolute -inset-[100%] shimmer-sweep" :class="speedClass" :style="{ background }"></div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ speedClass: string; color?: string }>();

const RAINBOW =
	"linear-gradient(115deg, transparent 30%, rgba(255,0,150,0.3) 40%, rgba(0,200,255,0.3) 50%, rgba(255,200,0,0.3) 60%, transparent 70%)";

const background = computed(() =>
	props.color === "rainbow"
		? RAINBOW
		: `linear-gradient(115deg, transparent 40%, ${props.color || "rgba(255,255,255,0.4)"} 50%, transparent 60%)`,
);
</script>

<style scoped>
@keyframes shimmer {
  0% { transform: translateX(-50%) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateX(50%) rotate(0deg); opacity: 0; }
}

.shimmer-sweep {
  animation-name: shimmer;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}

.speed-slow { animation-duration: 6s; }
.speed-normal { animation-duration: 4s; }
.speed-fast { animation-duration: 2s; }
</style>
