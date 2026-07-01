<template>
  <div
    v-if="def && def.kind !== 'none'"
    class="absolute inset-0 overflow-hidden pointer-events-none rounded-[2.5rem]"
    :class="{ 'world-preview': preview }"
    :style="preview ? { '--world-scale': previewScale } : undefined"
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
  resolveWorld,
  type WorldDef
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
    worldId?: string;
    def?: WorldDef;
    preview?: boolean;
    /** Scale of the card-sized stage when in preview (1 = full card). */
    previewScale?: number;
  }>(),
  { preview: false, previewScale: 0.5 }
)
const def = computed<WorldDef>(
  () => props.def || resolveWorld(props.worldId)
)

// Each DotLottie is a full wasm/canvas player, so instance count is the main
// cost. We keep the on-card swarm modest and, in preview tiles, cut it hard —
// a thumbnail only needs a hint of motion, not the whole ecosystem.
const cap = <T,>(list: T[], full: number, prev: number): T[] =>
  list.slice(0, props.preview ? prev : full)

const jellyfishes = computed(() =>
  cap(
    [
      { id: 1, size: '6.0rem', left: '15%', delay: '-10s', duration: '52s' },
      { id: 2, size: '4.8rem', left: '70%', delay: '-28s', duration: '68s' }
    ],
    2,
    1
  )
)
const experimentalTurtles = computed(() =>
  cap(
    [
      { id: 1, size: '7.2rem', initialTop: '14%', delay: '0s', duration: '36s' },
      { id: 2, size: '5.5rem', initialTop: '28%', delay: '-9s', duration: '46s' }
    ],
    2,
    1
  )
)
const fishes = computed(() =>
  cap(
    [
      { id: 1, size: '4.0rem', top: '20%', delay: '-5s', duration: '28s' },
      { id: 2, size: '3.2rem', top: '36%', delay: '-14s', duration: '24s' },
      { id: 3, size: '3.6rem', top: '8%', delay: '-25s', duration: '32s' }
    ],
    3,
    2
  )
)

const fallingLeaves = computed(() =>
  cap(
    [
      { id: 1, left: '6%', size: '11rem', delay: '-1s', duration: '17s' },
      { id: 2, left: '34%', size: '13.5rem', delay: '-8s', duration: '20s' },
      { id: 3, left: '60%', size: '10rem', delay: '-14s', duration: '16s' },
      { id: 4, left: '85%', size: '12.5rem', delay: '-4s', duration: '19s' }
    ],
    4,
    2
  )
)

const walkers = computed(() =>
  cap(
    [
      { id: 1, top: '30%', size: '8.5rem', delay: '0s', duration: '10s' },
      { id: 2, top: '62%', size: '7.5rem', delay: '-5s', duration: '12s' }
    ],
    2,
    1
  )
)

const seededRandom = (seed: number) => {
  let x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

const dustMotes = computed(() =>
  cap(
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      left: `${seededRandom(i * 42) * 100}%`,
      top: `${seededRandom(i * 13) * 100}%`,
      size: `${Math.floor(seededRandom(i * 42) * 4) + 2}px`,
      delay: `-${seededRandom(i * 7) * 20}s`,
      duration: `${Math.floor(seededRandom(i * 3) * 15) + 15}s`,
      opacity: seededRandom(i * 9) * 0.4 + 0.2
    })),
    10,
    5
  )
)

const fieryPits = computed(() =>
  cap(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      left: `${seededRandom(i * 17) * 88}%`,
      top: `${seededRandom(i * 29) * 82}%`,
      size: `${Math.floor(seededRandom(i * 41) * 4) + 4}rem`,
      delay: `-${seededRandom(i * 11) * 5}s`
    })),
    5,
    2
  )
)

// A single dragon on a smooth, continuous loop that stays on-card the whole
// time (no off-screen teleports). rotateY interpolates at the turn points so it
// reads as banking, not popping. Shorter cycle → feels ever-present.
const wanderingDragons = [{ id: 1, size: '18rem', delay: '0s', duration: '17s' }]
</script>

<style scoped>
/* Preview tiles are tiny (h-28). Render the world on a full card-sized
   stage, then scale it down so rem sprite sizes shrink proportionally and the
   tile shows a faithful mini version instead of giant off-screen sprites.
   Pairs with % (not vw) travel so motion stays inside the stage. */
.world-preview {
  inset: auto;
  top: 50%;
  left: 50%;
  width: 320px;
  height: 280px;
  transform: translate(-50%, -50%) scale(var(--world-scale, 0.5));
  transform-origin: center;
}

@keyframes turtle-swim-lane {
  0% { left: -35%; transform: translateY(0px) rotate(-6deg); }
  50% { transform: translateY(20px) rotate(4deg); }
  100% { left: 135%; transform: translateY(-5px) rotate(-3deg); }
}

@keyframes fish-swim-lane {
  0% { left: 135%; transform: translateY(0px) rotate(4deg); }
  50% { transform: translateY(-25px) rotate(-5deg); }
  100% { left: -35%; transform: translateY(0px) rotate(3deg); }
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
  from { left: -40%; }
  to { left: 140%; }
}

/* ── Dragon: full-screen passes with off-screen turns ──
   The dragon always crosses the whole card, then exits, flips + repositions
   entirely off-screen (left pinned at -30% / 130%), and dives back in. Uneven
   keyframe spacing = passes at different speeds (some quick, some slow). No
   on-screen flips, no visible teleports, and only ~2% of the loop off-screen so
   it feels ever-present. */
@keyframes dragon-roam {
  /* Parking spots are one dragon-width (18rem) beyond each edge, so the flip /
     top-change ALWAYS happens fully off-screen — on any card width, incl. narrow
     mobile. `left: 100%` = left edge at the right border (element extends right,
     hidden); `left: -19rem` = right edge at the left border (hidden). */

  /* Pass 1 — quick high sweep L→R */
  0%   { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
  17%  { left: 100%;   top: 20%; transform: rotateY(180deg) scale(1); }
  /* flip (parked off right) */
  19%  { left: 100%;   top: 52%; transform: rotateY(0deg) scale(1.12); }

  /* Pass 2 — slow low glide R→L, close-up */
  45%  { left: -19rem; top: 44%; transform: rotateY(0deg) scale(1.12); }
  /* flip (parked off left) */
  47%  { left: -19rem; top: 28%; transform: rotateY(180deg) scale(0.95); }

  /* Pass 3 — medium descending sweep L→R */
  70%  { left: 100%;   top: 62%; transform: rotateY(180deg) scale(0.95); }
  /* flip (parked off right) */
  72%  { left: 100%;   top: 6%;  transform: rotateY(0deg) scale(1.05); }

  /* Pass 4 — quick high dash R→L */
  90%  { left: -19rem; top: 14%; transform: rotateY(0deg) scale(1.05); }
  /* reset facing (parked off left) */
  92%  { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
  100% { left: -19rem; top: 10%; transform: rotateY(180deg) scale(1); }
}

@keyframes fire-flicker {
  0%, 100% { transform: scale(1) rotate(-1deg); opacity: 0.75; }
  50% { transform: scale(1.15) rotate(3deg); opacity: 1; filter: brightness(1.2); }
}

/* Promote moving sprites to their own GPU layer for smoother compositing. */
.animate-turtle-swim-lane,
.animate-fish-swim-lane,
.animate-jellyfish-drift,
.animate-leaf-fall,
.animate-walker-cross,
.animate-dragon-roam {
  will-change: transform, top, left;
}

.animate-turtle-swim-lane { animation: turtle-swim-lane linear infinite; }
.animate-fish-swim-lane { animation: fish-swim-lane linear infinite; }
.animate-jellyfish-drift { animation: jellyfish-drift ease-in-out infinite; }
.animate-dust-drift { animation: dust-drift linear infinite; }
.animate-plant-sway { animation: plant-sway 9s ease-in-out infinite; }
.animate-leaf-fall { animation: leaf-fall linear infinite; }
.animate-walker-cross { animation: walker-cross linear infinite; }

.animate-dragon-roam { animation: dragon-roam linear infinite; }
.animate-fire-flicker { animation: fire-flicker 1.5s ease-in-out infinite alternate; }

.lottie-strict-bounds :deep(canvas), .lottie-strict-bounds :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  display: block;
}
</style>