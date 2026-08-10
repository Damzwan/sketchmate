<template>
  <div class="absolute inset-0 z-20 opacity-70 sprite-stage">
    <div
      v-for="leaf in fallingLeaves"
      :key="leaf.id"
      class="absolute animate-leaf-fall"
      :style="{
        left: leaf.left,
        width: leaf.size,
        height: leaf.size,
        animationDelay: leaf.delay,
        animationDuration: leaf.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.leaves)" class="w-full h-full object-contain"></canvas>
    </div>

    <div
      v-for="walker in walkers"
      :key="walker.id"
      class="absolute animate-walker-cross"
      :style="{
        top: walker.top,
        width: walker.size,
        height: walker.size,
        animationDelay: walker.delay,
        animationDuration: walker.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.mushroom)" class="w-full h-full object-contain"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { SPRITES } from "./world_sprites";
import { useWorldStage } from "./world_stage";

const { bind, cap } = useWorldStage();

const LEAVES = [
	{ id: "lf1", left: "6%", size: "11rem", delay: "-1s", duration: "17s" },
	{ id: "lf2", left: "34%", size: "13.5rem", delay: "-8s", duration: "20s" },
	{ id: "lf3", left: "60%", size: "10rem", delay: "-14s", duration: "16s" },
	{ id: "lf4", left: "85%", size: "12.5rem", delay: "-4s", duration: "19s" },
];

const WALKERS = [
	{ id: "sh1", top: "30%", size: "8.5rem", delay: "0s", duration: "10s" },
	{ id: "sh2", top: "62%", size: "7.5rem", delay: "-5s", duration: "12s" },
];

const fallingLeaves = computed(() => cap(LEAVES, 2));
const walkers = computed(() => cap(WALKERS, 1));
</script>

<style scoped>
.sprite-stage { container-type: size; }

@keyframes leaf-fall {
  0% { transform: translateY(-20cqh) translateX(0) rotate(0deg); }
  50% { transform: translateY(49cqh) translateX(28px) rotate(180deg); }
  100% { transform: translateY(118cqh) translateX(-18px) rotate(360deg); }
}
@keyframes walker-cross {
  from { transform: translateX(-40cqw); }
  to { transform: translateX(140cqw); }
}

.animate-leaf-fall,
.animate-walker-cross { will-change: transform; }

.animate-leaf-fall { animation: leaf-fall linear infinite; }
.animate-walker-cross { animation: walker-cross linear infinite; }
</style>
