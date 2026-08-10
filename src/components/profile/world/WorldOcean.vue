<template>
  <div class="absolute inset-0 z-20 opacity-90 sprite-stage">
    <div
      v-for="jellyfish in jellyfishes"
      :key="jellyfish.id"
      class="absolute animate-jellyfish-drift opacity-75"
      :style="{
        left: jellyfish.left,
        width: jellyfish.size,
        height: jellyfish.size,
        animationDelay: jellyfish.delay,
        animationDuration: jellyfish.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.jellyfish)" class="w-full h-full object-contain"></canvas>
    </div>

    <div
      v-for="turtle in turtles"
      :key="turtle.id"
      class="absolute animate-turtle-swim-lane"
      :style="{
        top: turtle.top,
        left: staticMode ? turtle.staticLeft : undefined,
        width: turtle.size,
        height: turtle.size,
        animationDelay: turtle.delay,
        animationDuration: turtle.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.turtle)" class="w-full h-full object-contain"></canvas>
    </div>

    <div
      v-for="fish in fishes"
      :key="fish.id"
      class="absolute animate-fish-swim-lane"
      :style="{
        top: fish.top,
        left: staticMode ? fish.staticLeft : undefined,
        width: fish.size,
        height: fish.size,
        animationDelay: fish.delay,
        animationDuration: fish.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.fish)" class="w-full h-full object-contain"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { SPRITES } from "./world_sprites";
import { useWorldStage } from "./world_stage";

const { bind, cap, staticMode } = useWorldStage();

const JELLYFISHES = [
	{ id: "jf1", size: "6.0rem", left: "15%", delay: "-10s", duration: "52s" },
	{ id: "jf2", size: "4.8rem", left: "70%", delay: "-28s", duration: "68s" },
];

const TURTLES = [
	{
		id: "tu1",
		size: "7.2rem",
		top: "14%",
		staticLeft: "8%",
		delay: "0s",
		duration: "36s",
	},
	{
		id: "tu2",
		size: "5.5rem",
		top: "28%",
		staticLeft: "58%",
		delay: "-9s",
		duration: "46s",
	},
];

const FISHES = [
	{
		id: "fi1",
		size: "4.0rem",
		top: "20%",
		staticLeft: "12%",
		delay: "-5s",
		duration: "28s",
	},
	{
		id: "fi2",
		size: "3.2rem",
		top: "44%",
		staticLeft: "48%",
		delay: "-14s",
		duration: "24s",
	},
	{
		id: "fi3",
		size: "3.6rem",
		top: "8%",
		staticLeft: "74%",
		delay: "-25s",
		duration: "32s",
	},
];

const jellyfishes = computed(() => cap(JELLYFISHES, 1));
const turtles = computed(() => cap(TURTLES, 1));
const fishes = computed(() => cap(FISHES, 2));
</script>

<style scoped>
.sprite-stage { container-type: size; }

@keyframes turtle-swim-lane {
  0% { transform: translateX(-35cqw) translateY(0px) rotate(-6deg); }
  50% { transform: translateX(50cqw) translateY(20px) rotate(4deg); }
  100% { transform: translateX(135cqw) translateY(-5px) rotate(-3deg); }
}
@keyframes fish-swim-lane {
  0% { transform: translateX(135cqw) translateY(0px) rotate(4deg); }
  50% { transform: translateX(50cqw) translateY(-25px) rotate(-5deg); }
  100% { transform: translateX(-35cqw) translateY(0px) rotate(3deg); }
}
@keyframes jellyfish-drift {
  0% { transform: translateY(110cqh) translateX(0px) rotate(-5deg); }
  50% { transform: translateY(42.5cqh) translateX(20px) rotate(5deg); }
  100% { transform: translateY(-25cqh) translateX(-5px) rotate(-2deg); }
}

.animate-turtle-swim-lane,
.animate-fish-swim-lane,
.animate-jellyfish-drift { will-change: transform; }

.animate-turtle-swim-lane { animation: turtle-swim-lane linear infinite; }
.animate-fish-swim-lane { animation: fish-swim-lane linear infinite; }
.animate-jellyfish-drift { animation: jellyfish-drift ease-in-out infinite; }
</style>
