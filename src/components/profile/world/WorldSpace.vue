<template>
  <!-- Cosmic Drift.

       This scene used to paint an OPAQUE night sky and declare itself dark
       (`WorldDef.isDark`), which forced every surrounding surface — names,
       timestamps, control chrome, chat rows — onto a dark contrast palette no
       matter which theme the user had bought. So the world silently overrode
       the theme, and every consumer had to special-case it.

       Now it is a translucent accent WASH over whatever the theme painted, and
       its ink follows the surface: pale sparkles on dark themes, deep
       accent-tinted ones on light themes. Nothing outside has to know. -->
  <div
    class="absolute inset-0 space"
    :class="{ 'space--dark': dark, 'space--feature': feature }"
    :style="{ '--world-accent': accent }"
  >
    <div class="absolute inset-0 space-wash -z-10"></div>

    <div
      v-for="star in stars"
      :key="star.id"
      class="absolute rounded-full space-star animate-star-twinkle"
      :class="{ 'space-star--bright': star.bright }"
      :style="{
        left: star.left,
        top: star.top,
        width: star.size,
        height: star.size,
        animationDelay: star.delay,
        animationDuration: star.duration,
      }"
    ></div>

    <svg
      class="absolute left-[-4%] top-[12%] w-[42%] h-[42%] overflow-visible animate-constellation-pulse"
      viewBox="0 0 100 100"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <polyline
        points="10,70 32,40 52,58 70,20 90,44"
        stroke="var(--space-line)"
        stroke-width="0.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <g v-for="node in CONSTELLATION" :key="node.id">
        <circle :cx="node.x" :cy="node.y" :r="node.r" fill="var(--space-ink)" />
        <circle :cx="node.x" :cy="node.y" :r="node.r * 2.6" fill="var(--space-halo)" opacity="0.35" />
      </g>
    </svg>

    <div
      v-for="meteor in meteors"
      :key="meteor.id"
      class="absolute animate-meteor-streak"
      :style="{
        top: meteor.top,
        left: meteor.left,
        width: meteor.size,
        height: meteor.size,
        animationDelay: meteor.delay,
        animationDuration: meteor.duration,
      }"
    >
      <canvas :ref="(el) => bind(el, SPRITES.meteor)" class="w-full h-full object-contain"></canvas>
    </div>

    <div class="absolute top-[10%] right-[8%] w-24 h-24 animate-moon-bob z-10">
      <canvas :ref="(el) => bind(el, SPRITES.moon)" class="w-full h-full object-contain"></canvas>
    </div>

    <div class="absolute left-[40%] top-0 w-28 h-28 animate-rocket-fly z-10">
      <canvas :ref="(el) => bind(el, SPRITES.rocket)" class="w-full h-full object-contain"></canvas>
    </div>

    <div class="absolute top-0 left-0 w-20 h-20 animate-astronaut-wander z-20">
      <canvas :ref="(el) => bind(el, SPRITES.astronaut)" class="w-full h-full object-contain"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { seededRandom } from "./world_layout";
import { SPRITES } from "./world_sprites";
import { useWorldStage } from "./world_stage";

withDefaults(
	defineProps<{
		accent?: string;
		/** Is the surface underneath this scene a dark one? */
		dark?: boolean;
		feature?: boolean;
	}>(),
	{ accent: "#7c5cff", dark: false, feature: false },
);

const { bind, cap } = useWorldStage();

const STARS = Array.from({ length: 26 }, (_, i) => {
	const bright = seededRandom(i * 3) > 0.82;
	return {
		id: `st${i}`,
		bright,
		left: `${seededRandom(i * 12) * 100}%`,
		top: `${seededRandom(i * 27) * 100}%`,
		size: `${(bright ? 3 : 1) + Math.floor(seededRandom(i * 5) * 2)}px`,
		delay: `-${seededRandom(i * 8) * 4}s`,
		duration: `${2 + seededRandom(i * 6) * 3}s`,
	};
});

const CONSTELLATION = [
	{ id: "cn0", x: 10, y: 70, r: 1.6 },
	{ id: "cn1", x: 32, y: 40, r: 2.4 },
	{ id: "cn2", x: 52, y: 58, r: 1.4 },
	{ id: "cn3", x: 70, y: 20, r: 2.8 },
	{ id: "cn4", x: 90, y: 44, r: 1.8 },
];

const METEORS = [
	{
		id: "mt1",
		top: "-8%",
		left: "8%",
		size: "13rem",
		delay: "0s",
		duration: "11s",
	},
	{
		id: "mt2",
		top: "-18%",
		left: "40%",
		size: "11rem",
		delay: "-5s",
		duration: "13s",
	},
	{
		id: "mt3",
		top: "-12%",
		left: "68%",
		size: "12rem",
		delay: "-9s",
		duration: "12s",
	},
];

const stars = computed(() => cap(STARS, 12));
const meteors = computed(() => cap(METEORS, 1));
</script>

<style scoped>
/* Light surface (the default): sparkles are accent-tinted INK, so they stay
   visible on cream/pastel cards where the old white dots vanished, and the sky
   is a wash faint enough to read as atmosphere over the theme's own gradient. */
.space {
  --space-ink: color-mix(in srgb, var(--world-accent, #7c5cff) 62%, #1b1236);
  --space-halo: color-mix(in srgb, var(--world-accent, #7c5cff) 55%, transparent);
  --space-line: color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent);
  --space-wash: linear-gradient(
    160deg,
    color-mix(in srgb, var(--world-accent, #7c5cff) 6%, transparent) 0%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 20%, transparent) 55%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 9%, transparent) 100%
  );
}

/* Dark surface: the familiar starfield. Still translucent — a dark theme's own
   gradient shows through instead of being replaced by one fixed navy. */
.space--dark {
  --space-ink: #ffffff;
  --space-halo: rgba(255, 255, 255, 0.7);
  --space-line: rgba(191, 214, 255, 0.4);
  --space-wash: linear-gradient(
    160deg,
    rgba(9, 13, 32, 0.55) 0%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 22%, rgba(20, 27, 61, 0.62)) 52%,
    rgba(28, 16, 48, 0.5) 100%
  );
}

/* Space's actors use fixed pixel sizes. On a tall feature card they otherwise
   recede into the background, so let the scene read more boldly without adding
   sprites or extra decoder work. */
.space--feature {
  transform: scale(1.18);
  transform-origin: center 38%;
}

.space-wash { background: var(--space-wash); }

.space-star {
  background: var(--space-ink);
  box-shadow: 0 0 3px var(--space-halo);
}
.space-star--bright { box-shadow: 0 0 6px 1px var(--space-halo); }

@keyframes star-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes constellation-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes moon-bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-6px) rotate(2deg); }
}
@keyframes meteor-streak {
  0% { transform: translate(0, 0); opacity: 0; }
  10% { opacity: 1; }
  45% { opacity: 1; }
  55% { transform: translate(170px, 240px); opacity: 0; }
  100% { transform: translate(170px, 240px); opacity: 0; }
}
@keyframes rocket-fly {
  0%    { top: 115%; transform: translateX(55px) rotate(-22deg) scale(1);      opacity: 0; }
  2%    { opacity: 1; }
  13%   { top: -58%; transform: translateX(-160px) rotate(-22deg) scale(0.62); opacity: 1; }
  15%   { top: -70%; transform: translateX(-172px) rotate(-22deg) scale(0.58); opacity: 0; }
  16.6% { top: 120%; transform: translateX(120px) rotate(-33deg) scale(0.8);   opacity: 0; }
  18.6% { opacity: 1; }
  29.6% { top: 34%;  transform: translateX(-45px) rotate(-33deg) scale(0.6);   opacity: 1; }
  31.6% { top: 24%;  transform: translateX(-70px) rotate(-33deg) scale(0.57);  opacity: 0; }
  33.3% { top: 118%; transform: translateX(-120px) rotate(0deg) scale(0.6);    opacity: 0; }
  35.3% { opacity: 1; }
  46.3% { top: -55%; transform: translateX(-120px) rotate(0deg) scale(0.42);   opacity: 1; }
  48.3% { top: -70%; transform: translateX(-120px) rotate(0deg) scale(0.4);    opacity: 0; }
  50%   { top: 115%; transform: translateX(-20px) rotate(24deg) scale(0.95);   opacity: 0; }
  52%   { opacity: 1; }
  63%   { top: -58%; transform: translateX(185px) rotate(24deg) scale(0.58);   opacity: 1; }
  65%   { top: -70%; transform: translateX(198px) rotate(24deg) scale(0.54);   opacity: 0; }
  66.6% { top: 120%; transform: translateX(-150px) rotate(30deg) scale(0.7);   opacity: 0; }
  68.6% { opacity: 1; }
  79.6% { top: 40%;  transform: translateX(60px) rotate(30deg) scale(0.55);    opacity: 1; }
  81.6% { top: 30%;  transform: translateX(85px) rotate(30deg) scale(0.52);    opacity: 0; }
  83.3% { top: 118%; transform: translateX(30px) rotate(-12deg) scale(0.78);   opacity: 0; }
  85.3% { opacity: 1; }
  96.3% { top: 8%;   transform: translateX(-70px) rotate(-12deg) scale(0.5);   opacity: 1; }
  98.3% { top: -4%;  transform: translateX(-82px) rotate(-12deg) scale(0.47);  opacity: 0; }
  100%  { top: 115%; transform: translateX(55px) rotate(-22deg) scale(1);      opacity: 0; }
}
@keyframes astronaut-wander {
  0% { transform: translate(40%, 60%) rotate(0deg); }
  25% { transform: translate(230%, 120%) rotate(25deg); }
  50% { transform: translate(310%, 300%) rotate(-15deg); }
  75% { transform: translate(120%, 260%) rotate(20deg); }
  100% { transform: translate(40%, 60%) rotate(0deg); }
}

.animate-meteor-streak,
.animate-rocket-fly,
.animate-astronaut-wander { will-change: transform; }

.animate-star-twinkle { animation: star-twinkle ease-in-out infinite; }
.animate-constellation-pulse { animation: constellation-pulse 6s ease-in-out infinite; }
.animate-moon-bob { animation: moon-bob 7s ease-in-out infinite; }
.animate-meteor-streak { animation: meteor-streak linear infinite; }
.animate-rocket-fly { animation: rocket-fly 34s linear infinite; }
.animate-astronaut-wander { animation: astronaut-wander 26s ease-in-out infinite; }
</style>
