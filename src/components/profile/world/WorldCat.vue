<template>
  <div class="absolute inset-0 z-20">
    <div
      v-for="mote in dustMotes"
      :key="mote.id"
      class="absolute bg-white rounded-full blur-[1px] animate-dust-drift"
      :style="{
        left: mote.left,
        top: mote.top,
        width: mote.size,
        height: mote.size,
        animationDelay: mote.delay,
        animationDuration: mote.duration,
        '--target-opacity': mote.opacity,
      }"
    ></div>

    <div class="absolute top-[26%] left-0 w-36 h-36 flex items-end justify-center pointer-events-none z-10">
      <div class="absolute bottom-[35%] left-[-10%] w-20 h-20 origin-bottom animate-plant-sway opacity-70 z-0">
        <canvas :ref="(el) => bind(el, SPRITES.plant)" class="w-full h-full object-contain"></canvas>
      </div>
      <div class="absolute bottom-[40%] right-[-10%] w-18 h-18 origin-bottom animate-plant-sway opacity-60 z-0">
        <canvas :ref="(el) => bind(el, SPRITES.plant)" class="w-full h-full object-contain"></canvas>
      </div>
      <div class="w-32 h-32 filter drop-shadow-sm z-10">
        <canvas :ref="(el) => bind(el, SPRITES.cat)" class="w-full h-full object-contain"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { seededRandom } from "./world_layout";
import { SPRITES } from "./world_sprites";
import { useWorldStage } from "./world_stage";

const { bind, cap } = useWorldStage();

const DUST_MOTES = Array.from({ length: 10 }, (_, i) => ({
	id: `dm${i}`,
	left: `${seededRandom(i * 42) * 100}%`,
	top: `${seededRandom(i * 13) * 100}%`,
	size: `${Math.floor(seededRandom(i * 42) * 4) + 2}px`,
	delay: `-${seededRandom(i * 7) * 20}s`,
	duration: `${Math.floor(seededRandom(i * 3) * 15) + 15}s`,
	opacity: seededRandom(i * 9) * 0.4 + 0.2,
}));

const dustMotes = computed(() => cap(DUST_MOTES, 5));
</script>

<style scoped>
@keyframes dust-drift {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  25%, 75% { opacity: var(--target-opacity); }
  100% { transform: translateY(-60px) translateX(20px); opacity: 0; }
}
@keyframes plant-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg) scale(1.01); }
}

.animate-dust-drift { animation: dust-drift linear infinite; }
.animate-plant-sway { animation: plant-sway 9s ease-in-out infinite; }
</style>
