<template>
  <div
    v-if="def && def.kind !== 'none'"
    class="absolute inset-0 overflow-hidden pointer-events-none rounded-[2.5rem]"
    aria-hidden="true"
  >
    <div v-if="def.kind === 'ocean'" class="absolute inset-0 z-20 opacity-40">
      <div
        v-for="j in jellyfishes"
        :key="'jf' + j.id"
        class="absolute animate-jellyfish-drift"
        :style="{
          left: j.left,
          width: j.size,
          height: j.size,
          animationDelay: j.delay,
          animationDuration: j.duration,
        }"
      >
        <DotLottieVue
          :src="jellyFishLottie"
          :autoplay="true"
          :loop="true"
          class="w-full h-full lottie-strict-bounds"
        />
      </div>

      <div
        v-for="t in experimentalTurtles"
        :key="'t' + t.id"
        class="absolute animate-turtle-swim-lane"
        :style="{
          width: t.size,
          height: t.size,
          top: t.initialTop,
          animationDelay: t.delay,
          animationDuration: t.duration,
        }"
      >
        <DotLottieVue
          :src="turtleLottie"
          :autoplay="true"
          :loop="true"
          class="w-full h-full lottie-strict-bounds"
        />
      </div>

      <div
        v-for="f in fishes"
        :key="'f' + f.id"
        class="absolute animate-fish-swim-lane"
        :style="{
          width: f.size,
          height: f.size,
          top: f.top,
          animationDelay: f.delay,
          animationDuration: f.duration,
        }"
      >
        <DotLottieVue
          :src="fishLottie"
          :autoplay="true"
          :loop="true"
          class="w-full h-full lottie-strict-bounds"
        />
      </div>
    </div>

    <div v-else-if="def.kind === 'cat'" class="absolute inset-0 z-20 opacity-60">
      <div
        v-for="m in dustMotes"
        :key="'dm' + m.id"
        class="absolute bg-white rounded-full blur-[1px] animate-dust-drift"
        :style="{
          left: m.left,
          top: m.top,
          width: m.size,
          height: m.size,
          animationDelay: m.delay,
          animationDuration: m.duration,
          '--target-opacity': m.opacity
        }"
      ></div>

      <div class="absolute top-[26%] left-[0%] w-36 h-36 flex items-end justify-center pointer-events-none z-10">
        <div class="absolute bottom-[35%] left-[-10%] w-20 h-20 origin-bottom animate-plant-sway opacity-70 z-0">
          <DotLottieVue :src="plantLottie" :autoplay="true" :loop="true"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
        <div
          class="absolute bottom-[40%] right-[-10%] w-18 h-18 origin-bottom animate-plant-sway opacity-60 z-0 transform scaleX(-1)">
          <DotLottieVue :src="plantLottie" :autoplay="true" :loop="true"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
        <div class="w-32 h-32 opacity-95 filter drop-shadow-sm z-10">
          <DotLottieVue :src="catLottie" :autoplay="true" :loop="true"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
      </div>
    </div>

    <div v-else-if="def.kind === 'autumn'" class="absolute inset-0 z-20 opacity-70">
      <div
        v-for="leaf in fallingLeaves"
        :key="'lf' + leaf.id"
        class="absolute animate-leaf-fall"
        :style="{
          left: leaf.left,
          width: leaf.size,
          height: leaf.size,
          animationDelay: leaf.delay,
          animationDuration: leaf.duration,
        }"
      >
        <DotLottieVue :src="autumn_leaves" :autoplay="true" :loop="true"
                      class="w-full h-full lottie-strict-bounds" />
      </div>

      <div
        v-for="shroom in walkers"
        :key="'sh' + shroom.id"
        class="absolute animate-walker-cross"
        :style="{
          top: shroom.top,
          width: shroom.size,
          height: shroom.size,
          animationDelay: shroom.delay,
          animationDuration: shroom.duration,
        }"
      >
        <DotLottieVue :src="mushroom_walking" :autoplay="true" :loop="true"
                      class="w-full h-full lottie-strict-bounds" />
      </div>
    </div>

    <div v-else-if="def.kind === 'dragon'" class="absolute inset-0 z-20 opacity-90">
      <div
        v-for="f in fieryPits"
        :key="'fr' + f.id"
        class="absolute animate-fire-flicker mix-blend-screen"
        :style="{
          left: f.left,
          top: f.top,
          width: f.size,
          height: f.size,
          animationDelay: f.delay,
        }"
      >
        <DotLottieVue :src="fire" :autoplay="true" :loop="true"
                      class="w-full h-full lottie-strict-bounds" />
      </div>

      <div
        v-for="d in wanderingDragons"
        :key="'dr' + d.id"
        class="absolute animate-dragon-roam"
        :style="{
          width: d.size,
          height: d.size,
          animationDelay: d.delay,
          animationDuration: d.duration,
        }"
      >
        <DotLottieVue :src="dragon" :autoplay="true" :loop="true"
                      class="w-full h-full lottie-strict-bounds drop-shadow-[0_15px_25px_rgba(0,0,0,0.7)]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  resolveAtmosphere,
  type AtmosphereDef
} from '@/config/profile_options.config'
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import turtleLottie from '@/assets/lottie/avatar/turtle.lottie'
import fishLottie from '@/assets/lottie/avatar/fish.lottie'
import jellyFishLottie from '@/assets/lottie/avatar/jellyfish.lottie'
import catLottie from '@/assets/lottie/avatar/cat.lottie'
import plantLottie from '@/assets/lottie/avatar/plant.lottie'
import mushroom_walking from '@/assets/lottie/avatar/mushroom.lottie'
import autumn_leaves from '@/assets/lottie/avatar/autumn_leaves.lottie'

import dragon from '@/assets/lottie/avatar/dragon.lottie'
import fire from '@/assets/lottie/avatar/fire.lottie'

const props = withDefaults(
  defineProps<{
    atmosphereId?: string;
    def?: AtmosphereDef;
    preview?: boolean;
  }>(),
  { preview: false }
)
const def = computed<AtmosphereDef>(
  () => props.def || resolveAtmosphere(props.atmosphereId)
)

const jellyfishes = [
  { id: 1, size: '6.0rem', left: '15%', delay: '-10s', duration: '52s' },
  { id: 2, size: '4.8rem', left: '70%', delay: '-28s', duration: '68s' }
]
const experimentalTurtles = [
  { id: 1, size: '7.2rem', initialTop: '14%', delay: '0s', duration: '36s' },
  { id: 2, size: '5.5rem', initialTop: '28%', delay: '-9s', duration: '46s' },
  { id: 3, size: '8.5rem', initialTop: '5%', delay: '-22s', duration: '40s' }
]
const fishes = [
  { id: 1, size: '4.0rem', top: '20%', delay: '-5s', duration: '28s' },
  { id: 2, size: '3.2rem', top: '36%', delay: '-14s', duration: '24s' },
  { id: 3, size: '3.6rem', top: '8%', delay: '-25s', duration: '32s' }
]

const fallingLeaves = [
  { id: 1, left: '6%', size: '11rem', delay: '-1s', duration: '17s' },
  { id: 2, left: '30%', size: '13.5rem', delay: '-8s', duration: '20s' },
  { id: 3, left: '53%', size: '10rem', delay: '-14s', duration: '16s' },
  { id: 4, left: '74%', size: '12.5rem', delay: '-4s', duration: '19s' },
  { id: 5, left: '89%', size: '11.5rem', delay: '-11s', duration: '18s' }
]

const walkers = [
  { id: 1, top: '21%', size: '8.5rem', delay: '0s', duration: '10s' },
  { id: 2, top: '47%', size: '7.0rem', delay: '-4s', duration: '12s' },
  { id: 3, top: '69%', size: '9.5rem', delay: '-8s', duration: '8s' }
]

const seededRandom = (seed: number) => {
  let x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

const dustMotes = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  left: `${seededRandom(i * 42) * 100}%`,
  top: `${seededRandom(i * 13) * 100}%`,
  size: `${Math.floor(seededRandom(i * 42) * 4) + 2}px`,
  delay: `-${seededRandom(i * 7) * 20}s`,
  duration: `${Math.floor(seededRandom(i * 3) * 15) + 15}s`,
  opacity: seededRandom(i * 9) * 0.4 + 0.2
}))

const fieryPits = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  left: `${seededRandom(i * 17) * 90}%`,
  top: `${seededRandom(i * 29) * 85}%`,
  size: `${Math.floor(seededRandom(i * 41) * 5) + 4}rem`,
  delay: `-${seededRandom(i * 11) * 5}s`,
}))

// Extended duration to support 6 complex interchanging movement profiles fluidly
const wanderingDragons = [
  { id: 1, size: '22rem', delay: '0s', duration: '54s' }
]
</script>

<style scoped>
@keyframes turtle-swim-lane {
  0% { left: -35vw; transform: translateY(0px) rotate(-6deg); }
  50% { transform: translateY(20px) rotate(4deg); }
  100% { left: 135vw; transform: translateY(-5px) rotate(-3deg); }
}

@keyframes fish-swim-lane {
  0% { left: 135vw; transform: translateY(0px) rotate(4deg); }
  50% { transform: translateY(-25px) rotate(-5deg); }
  100% { left: -35vw; transform: translateY(0px) rotate(3deg); }
}

@keyframes jellyfish-drift {
  0% { top: 110%; transform: translateX(0px) rotate(-5deg); }
  50% { transform: translateX(20px) rotate(5deg); }
  100% { top: -25%; transform: translateX(-5px) rotate(-2deg); }
}

@keyframes dust-drift {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  25%, 75% { opacity: var(--target-opacity); }
  100% { transform: translateY(-60px) translateX(20px); opacity: 0; }
}

@keyframes plant-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg) scale(1.01); }
}

@keyframes leaf-fall {
  0% { top: -20%; transform: translateX(0) rotate(0deg); }
  50% { transform: translateX(28px) rotate(180deg); }
  100% { top: 118%; transform: translateX(-18px) rotate(360deg); }
}

@keyframes walker-cross {
  from { left: -40vw; }
  to { left: 140vw; }
}

/* ── Complex, Unpredictable Dragon Flight Paths ── */
@keyframes dragon-roam {
  /* PATTERN 1: Standard Left-to-Right High-Altitude Sweep */
  0% { left: -45vw; top: 5%; transform: rotateY(180deg); }
  10% { left: 145vw; top: 25%; transform: rotateY(180deg); }

  /* INSTANT FLIP OFF-SCREEN */
  10.001% { left: 145vw; top: 0%; transform: rotateY(0deg); }

  /* PATTERN 2: Right-to-Left Low Hover (Threatening Stare) */
  13% { left: 145vw; top: 0%; transform: rotateY(0deg); }
  21% { left: 15%; top: 40%; transform: rotateY(0deg) scale(1.15); }
  27% { left: 15%; top: 40%; transform: rotateY(0deg) scale(1.15); } /* Stillness window */
  35% { left: -45vw; top: 20%; transform: rotateY(0deg); }

  /* INSTANT FLIP OFF-SCREEN */
  35.001% { left: -45vw; top: 75%; transform: rotateY(180deg); }

  /* PATTERN 3: Bottom-Left Cross Ascent to Top-Right */
  39% { left: -45vw; top: 75%; transform: rotateY(180deg); }
  49% { left: 145vw; top: -10%; transform: rotateY(180deg); }

  /* INSTANT FLIP OFF-SCREEN */
  49.001% { left: 45%; top: -45vw; transform: rotateY(180deg); }

  /* PATTERN 4: Sudden Vertical Diving Ambush from Above */
  53% { left: 45%; top: -45vw; transform: rotateY(180deg); }
  59% { left: 40%; top: 45%; transform: rotateY(180deg) scale(1.3); } /* Close-up jump scare */
  64% { left: 40%; top: 45%; transform: rotateY(180deg) scale(1.3); }
  71% { left: 145vw; top: 85%; transform: rotateY(180deg); }

  /* INSTANT FLIP OFF-SCREEN */
  71.001% { left: 145vw; top: 60%; transform: rotateY(0deg); }

  /* PATTERN 5: Right-to-Left Level Dash */
  75% { left: 145vw; top: 60%; transform: rotateY(0deg); }
  83% { left: -45vw; top: 40%; transform: rotateY(0deg); }

  /* INSTANT FLIP OFF-SCREEN */
  83.001% { left: -45vw; top: -15%; transform: rotateY(180deg); }

  /* PATTERN 6: Top-Left Diagonal Slide to Centre Right Rest */
  86% { left: -45vw; top: -15%; transform: rotateY(180deg); }
  92% { left: 55%; top: 20%; transform: rotateY(180deg) scale(1.1); }
  95% { left: 55%; top: 20%; transform: rotateY(180deg) scale(1.1); }
  100% { left: 145vw; top: 10%; transform: rotateY(180deg); }
}

@keyframes fire-flicker {
  0%, 100% { transform: scale(1) rotate(-1deg); opacity: 0.75; }
  50% { transform: scale(1.15) rotate(3deg); opacity: 1; filter: brightness(1.2); }
}

.animate-turtle-swim-lane { animation: turtle-swim-lane linear infinite; }
.animate-fish-swim-lane { animation: fish-swim-lane linear infinite; }
.animate-jellyfish-drift { animation: jellyfish-drift ease-in-out infinite; }
.animate-dust-drift { animation: dust-drift linear infinite; }
.animate-plant-sway { animation: plant-sway 9s ease-in-out infinite; }
.animate-leaf-fall { animation: leaf-fall linear infinite; }
.animate-walker-cross { animation: walker-cross linear infinite; }

/* ── Dragon Utility Classes ── */
.animate-dragon-roam { animation: dragon-roam linear infinite; }
.animate-fire-flicker { animation: fire-flicker 1.5s ease-in-out infinite alternate; }

.lottie-strict-bounds :deep(canvas), .lottie-strict-bounds :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  display: block;
}
</style>