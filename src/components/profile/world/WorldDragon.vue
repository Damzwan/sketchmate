<template>
  <div class="absolute inset-0 z-20">
    <div
      v-for="pit in fieryPits"
      :key="pit.id"
      class="absolute animate-fire-flicker mix-blend-screen"
      :style="{
        left: pit.left,
        top: pit.top,
        width: pit.size,
        height: pit.size,
        animationDelay: pit.delay,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.fire)" class="w-full h-full object-contain"></canvas>
    </div>

    <div
      v-for="dragon in DRAGONS"
      :key="dragon.id"
      class="absolute animate-dragon-roam"
      :style="{
        width: dragon.size,
        height: dragon.size,
        animationDelay: dragon.delay,
        animationDuration: dragon.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.dragon)" class="w-full h-full object-contain"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { seededRandom } from "./world_layout";
import { SPRITES } from "./world_sprites";
import { useWorldStage } from "./world_stage";

const { bind, cap } = useWorldStage();

const FIERY_PITS = Array.from({ length: 5 }, (_, i) => ({
	id: `fr${i}`,
	left: `${seededRandom(i * 17) * 88}%`,
	top: `${seededRandom(i * 29) * 82}%`,
	size: `${Math.floor(seededRandom(i * 41) * 4) + 4}rem`,
	delay: `-${seededRandom(i * 11) * 5}s`,
}));

const DRAGONS = [{ id: "dr1", size: "18rem", delay: "0s", duration: "17s" }];

const fieryPits = computed(() => cap(FIERY_PITS, 2));
</script>

<style scoped>
@keyframes fire-flicker {
  0%, 100% { transform: scale(1) rotate(-1deg); opacity: 0.75; }
  50% { transform: scale(1.15) rotate(3deg); opacity: 1; filter: brightness(1.2); }
}
@keyframes dragon-roam {
  0%   { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
  17%  { left: 100%;   top: 20%; transform: rotateY(180deg) scale(1); }
  19%  { left: 100%;   top: 52%; transform: rotateY(0deg) scale(1.12); }
  45%  { left: -19rem; top: 44%; transform: rotateY(0deg) scale(1.12); }
  47%  { left: -19rem; top: 28%; transform: rotateY(180deg) scale(0.95); }
  70%  { left: 100%;   top: 62%; transform: rotateY(180deg) scale(0.95); }
  72%  { left: 100%;   top: 6%;  transform: rotateY(0deg) scale(1.05); }
  90%  { left: -19rem; top: 14%; transform: rotateY(0deg) scale(1.05); }
  92%  { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
  100% { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
}

.animate-dragon-roam { will-change: transform; animation: dragon-roam linear infinite; }
.animate-fire-flicker { animation: fire-flicker 1.5s ease-in-out infinite alternate; }
</style>
