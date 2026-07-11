<template>
  <div
    v-if="def && def.kind !== 'none'"
    ref="root"
    class="absolute inset-0 overflow-hidden pointer-events-none rounded-[2.5rem]"
    :class="{ 'world-preview': preview, 'world-static': staticMode }"
    :style="preview ? { '--world-scale': previewScale } : undefined"
    aria-hidden="true"
  >
    <!-- Heavy lottie players only exist while the card is on/near screen. In a
         shop/customization grid the off-screen worlds unmount, so only the few
         visible cards run wasm/canvas players at once. -->
    <template v-if="active">
    <div v-if="def.kind === 'ocean'" class="absolute inset-0 z-20 opacity-40 sprite-stage">
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
          :autoplay="!staticMode"
          :loop="true"
          :render-config="renderConfig"
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
          :autoplay="!staticMode"
          :loop="true"
          :render-config="renderConfig"
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
          :autoplay="!staticMode"
          :loop="true"
          :render-config="renderConfig"
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
          <DotLottieVue :src="plantLottie" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
        <div
          class="absolute bottom-[40%] right-[-10%] w-18 h-18 origin-bottom animate-plant-sway opacity-60 z-0 transform scaleX(-1)">
          <DotLottieVue :src="plantLottie" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
        <div class="w-32 h-32 opacity-95 filter drop-shadow-sm z-10">
          <DotLottieVue :src="catLottie" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                        class="w-full h-full lottie-strict-bounds" />
        </div>
      </div>
    </div>

    <div v-else-if="def.kind === 'autumn'" class="absolute inset-0 z-20 opacity-70 sprite-stage">
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
        <DotLottieVue :src="autumn_leaves" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
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
        <DotLottieVue :src="mushroom_walking" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
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
        <DotLottieVue :src="fire" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
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
        <DotLottieVue :src="dragon" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                      class="w-full h-full lottie-strict-bounds drop-shadow-[0_15px_25px_rgba(0,0,0,0.7)]" />
      </div>
    </div>

    <div
      v-else-if="def.kind === 'space'"
      class="absolute inset-0"
      :style="{ '--world-accent': accent }"
    >
      <!-- Deep-space wash sits at -z-10 so it's the card BACKDROP, below the
           ProfileEffect layer (z:auto/0) — the effect (shimmer/glass/grain) then
           reads on top of the sky, and the space sprites (z-10/20 below) sit
           above the effect. So space combines with an effect like other worlds
           instead of the opaque sky hiding it. No z-index on this container, or
           it'd trap the sky in its own stacking context above the effect again. -->
      <div class="absolute inset-0 space-sky -z-10"></div>

      <!-- Twinkling star field (CSS-only) -->
      <div
        v-for="s in stars"
        :key="'st' + s.id"
        class="absolute rounded-full bg-white animate-star-twinkle"
        :style="{
          left: s.left,
          top: s.top,
          width: s.size,
          height: s.size,
          animationDelay: s.delay,
          animationDuration: s.duration,
          '--star-glow': s.glow,
        }"
      ></div>

      <!-- Our own constellation: shiny nodes joined by faint lines -->
      <svg
        class="absolute left-[-4%] top-[12%] w-[42%] h-[42%] overflow-visible animate-constellation-pulse"
        viewBox="0 0 100 100"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <polyline
          points="10,70 32,40 52,58 70,20 90,44"
          stroke="rgba(191,214,255,0.35)"
          stroke-width="0.8"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <g v-for="(p, i) in constellationNodes" :key="'cn' + i">
          <circle :cx="p.x" :cy="p.y" :r="p.r" fill="#ffffff" />
          <circle :cx="p.x" :cy="p.y" :r="p.r * 2.6" fill="#bfd6ff" opacity="0.25" />
        </g>
      </svg>

      <!-- Meteor shower in the background -->
      <div
        v-for="m in meteors"
        :key="'mt' + m.id"
        class="absolute animate-meteor-streak"
        :style="{
          top: m.top,
          left: m.left,
          width: m.size,
          height: m.size,
          animationDelay: m.delay,
          animationDuration: m.duration,
        }"
      >
        <DotLottieVue :src="meteor" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                      class="w-full h-full lottie-strict-bounds" />
      </div>

      <!-- Moon: fixed in its corner, gentle in-place bob -->
      <div class="absolute top-[10%] right-[8%] w-24 h-24 animate-moon-bob z-10">
        <DotLottieVue :src="moon" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                      class="w-full h-full lottie-strict-bounds drop-shadow-[0_0_18px_rgba(200,215,255,0.5)]" />
      </div>

      <!-- One rocket, many launches: each cycle it flies bottom→top on a
           different diagonal, at a different size, exits past the top edge,
           then reappears at the bottom for the next launch. -->
      <div class="absolute left-[40%] top-0 w-28 h-28 animate-rocket-fly z-10">
        <DotLottieVue :src="rocket" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                      class="w-full h-full lottie-strict-bounds" />
      </div>

      <!-- Astronaut: quirky slow wander from place to place -->
      <div class="absolute top-0 left-0 w-20 h-20 animate-astronaut-wander z-20">
        <DotLottieVue :src="astronaut" :autoplay="!staticMode" :loop="true"
          :render-config="renderConfig"
                      class="w-full h-full lottie-strict-bounds drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" />
      </div>
    </div>

    <!-- ── GRATITUDE (OG-exclusive) ─────────────────────────────────────
         Ambient card decoration (not an opaque scene): a soft accent glow lets
         the theme background show through, hearts drift up, and the SketchMate
         logo sits big on the right — masked so it takes the THEME ACCENT — with
         a personal thank-you to the founder on the left. All tinted with
         --world-accent so it reads on light & dark themes alike. -->
    <!-- Unlike the ambient full-bleed worlds, gratitude has ANCHORED content
         (text + logo), so it can't stretch to its host. In the card the host is
         ~card-sized; in UserContextSheet it's the whole ~full-screen sheet, which
         would fling the text to mid-scroll and blow the cqw fonts up. So we pin a
         fixed-size STAGE to the top-centre (like the card doodle's capped header
         box) and make THAT the query container — identical placement everywhere. -->
    <div
      v-else-if="def.kind === 'gratitude'"
      class="absolute inset-0 gratitude-frame"
      :style="{ '--world-accent': accent }"
    >
      <div class="gratitude">
        <!-- Big logo on the RIGHT, recoloured to the theme accent via mask. -->
        <div
          class="absolute right-[5%] top-8/12 w-[25%] -translate-y-1/2 aspect-square gratitude-logo animate-logo-bob"
          :style="{
            '-webkit-mask-image': `url(${logo})`,
            'mask-image': `url(${logo})`,
          }"
        ></div>
        <!-- ↑ width/right also tuned per card-width in the @container rules below. -->

        <!-- Hearts drifting up between the text and the logo. -->
        <span
          v-for="h in hearts"
          :key="'gh' + h.id"
          class="absolute gratitude-heart animate-heart-float"
          :style="{
            left: h.left,
            bottom: h.bottom,
            fontSize: h.size,
            animationDelay: h.delay,
            animationDuration: h.duration,
            '--target-opacity': h.opacity,
          }"
          >♥</span
        >

        <div
          class="absolute left-[4%] top-[65%] -translate-y-1/2 w-[54%] gratitude-text"
          :style="{ fontFamily: font }"
        >
          <p class="gratitude-thanks">Thank you,<br />eternally.</p>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { resolveWorld, type WorldDef } from "@/config/profile_options.config";
import { DotLottieVue } from "@lottiefiles/dotlottie-vue";
import turtleLottie from "@/assets/lottie/avatar/turtle.lottie";
import fishLottie from "@/assets/lottie/avatar/fish.lottie";
import jellyFishLottie from "@/assets/lottie/avatar/jellyfish.lottie";
import catLottie from "@/assets/lottie/avatar/cat.lottie";
import plantLottie from "@/assets/lottie/avatar/plant.lottie";
import mushroom_walking from "@/assets/lottie/avatar/mushroom.lottie";
import autumn_leaves from "@/assets/lottie/avatar/autumn_leaves.lottie";

import logo from "@/assets/logo.webp";

import meteor from "@/assets/lottie/avatar/meteor.lottie";
import astronaut from "@/assets/lottie/avatar/astronaut.lottie";
import moon from "@/assets/lottie/avatar/moon.lottie";
import rocket from "@/assets/lottie/avatar/rocket.lottie";

import dragon from "@/assets/lottie/avatar/dragon.lottie";
import fire from "@/assets/lottie/avatar/fire.lottie";

const props = withDefaults(
	defineProps<{
		worldId?: string;
		def?: WorldDef;
		preview?: boolean;
		/** Scale of the card-sized stage when in preview (1 = full card). */
		previewScale?: number;
		/** Current theme accent — tints the space world's sky. */
		accent?: string;
		/** Selected profile font — applied to gratitude's thank-you text, which
		    lives in this layer (outside the card's fontFamily wrapper). */
		font?: string;
		/** Freeze the world: no lottie autoplay, no CSS motion. For contexts
		    where the animation drains perf / distracts (e.g. the doodle pad). */
		staticMode?: boolean;
	}>(),
	{ preview: false, previewScale: 0.5, accent: "#7c5cff", staticMode: false },
);
const def = computed<WorldDef>(() => props.def || resolveWorld(props.worldId));

// ── On-screen gating ───────────────────────────────────────────────────────
// Mount the (expensive) lottie players only while the card is visible. Off-
// screen cards in a grid unmount their world entirely, so the number of live
// wasm/canvas players tracks what's actually on screen, not the whole list.
const root = ref<HTMLElement | null>(null);
const active = ref(false);
let io: IntersectionObserver | null = null;

onMounted(() => {
	if (typeof IntersectionObserver === "undefined") {
		active.value = true;
		return;
	}
	io = new IntersectionObserver(
		(entries) => {
			active.value = entries.some((e) => e.isIntersecting);
		},
		// Pre-mount a little before the card scrolls in so there's no pop-in.
		{ rootMargin: "250px" },
	);
	nextTick(() => {
		if (root.value) io!.observe(root.value);
	});
});

onBeforeUnmount(() => io?.disconnect());

// freezeOnOffscreen (default true) freezes the player when its canvas is
// hidden/offscreen. Ionic keeps the previous page mounted as `ion-page-hidden`
// (display:none), so when a world edit re-renders these sprites while the card
// is behind another page, frozen players lock onto a stale/zero canvas size and
// never repaint at the right size — sprites come back smaller. Keep them live.
//
// devicePixelRatio is capped so the lottie canvases don't render at a phone's
// full 3x retina density (the dominant fill cost). Preview tiles render at 1x
// (they're tiny); on-card worlds at ≤1.5x — visually indistinguishable, far
// cheaper to composite.
const renderConfig = computed(() => ({
	freezeOnOffscreen: false,
	devicePixelRatio: Math.min(
		typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
		props.preview ? 1 : 1.5,
	),
}));

// Each DotLottie is a full wasm/canvas player, so instance count is the main
// cost. We keep the on-card swarm modest and, in preview tiles, cut it hard —
// a thumbnail only needs a hint of motion, not the whole ecosystem.
const cap = <T>(list: T[], full: number, prev: number): T[] =>
	list.slice(0, props.preview ? prev : full);

const jellyfishes = computed(() =>
	cap(
		[
			{ id: 1, size: "6.0rem", left: "15%", delay: "-10s", duration: "52s" },
			{ id: 2, size: "4.8rem", left: "70%", delay: "-28s", duration: "68s" },
		],
		2,
		1,
	),
);
const experimentalTurtles = computed(() =>
	cap(
		[
			{
				id: 1,
				size: "7.2rem",
				initialTop: "14%",
				delay: "0s",
				duration: "36s",
			},
			{
				id: 2,
				size: "5.5rem",
				initialTop: "28%",
				delay: "-9s",
				duration: "46s",
			},
		],
		2,
		1,
	),
);
const fishes = computed(() =>
	cap(
		[
			{ id: 1, size: "4.0rem", top: "20%", delay: "-5s", duration: "28s" },
			{ id: 2, size: "3.2rem", top: "36%", delay: "-14s", duration: "24s" },
			{ id: 3, size: "3.6rem", top: "8%", delay: "-25s", duration: "32s" },
		],
		3,
		2,
	),
);

const fallingLeaves = computed(() =>
	cap(
		[
			{ id: 1, left: "6%", size: "11rem", delay: "-1s", duration: "17s" },
			{ id: 2, left: "34%", size: "13.5rem", delay: "-8s", duration: "20s" },
			{ id: 3, left: "60%", size: "10rem", delay: "-14s", duration: "16s" },
			{ id: 4, left: "85%", size: "12.5rem", delay: "-4s", duration: "19s" },
		],
		4,
		2,
	),
);

const walkers = computed(() =>
	cap(
		[
			{ id: 1, top: "30%", size: "8.5rem", delay: "0s", duration: "10s" },
			{ id: 2, top: "62%", size: "7.5rem", delay: "-5s", duration: "12s" },
		],
		2,
		1,
	),
);

const seededRandom = (seed: number) => {
	let x = Math.sin(seed++) * 10000;
	return x - Math.floor(x);
};

const dustMotes = computed(() =>
	cap(
		Array.from({ length: 10 }, (_, i) => ({
			id: i,
			left: `${seededRandom(i * 42) * 100}%`,
			top: `${seededRandom(i * 13) * 100}%`,
			size: `${Math.floor(seededRandom(i * 42) * 4) + 2}px`,
			delay: `-${seededRandom(i * 7) * 20}s`,
			duration: `${Math.floor(seededRandom(i * 3) * 15) + 15}s`,
			opacity: seededRandom(i * 9) * 0.4 + 0.2,
		})),
		10,
		5,
	),
);

const fieryPits = computed(() =>
	cap(
		Array.from({ length: 5 }, (_, i) => ({
			id: i,
			left: `${seededRandom(i * 17) * 88}%`,
			top: `${seededRandom(i * 29) * 82}%`,
			size: `${Math.floor(seededRandom(i * 41) * 4) + 4}rem`,
			delay: `-${seededRandom(i * 11) * 5}s`,
		})),
		5,
		2,
	),
);

// A single dragon on a smooth, continuous loop that stays on-card the whole
// time (no off-screen teleports). rotateY interpolates at the turn points so it
// reads as banking, not popping. Shorter cycle → feels ever-present.
const wanderingDragons = [
	{ id: 1, size: "18rem", delay: "0s", duration: "17s" },
];

// ── SPACE ──────────────────────────────────────────────────────────────
// Pure-CSS star field: cheap (no lottie players), so we can afford many.
const stars = computed(() =>
	cap(
		Array.from({ length: 26 }, (_, i) => {
			const big = seededRandom(i * 3) > 0.82;
			return {
				id: i,
				left: `${seededRandom(i * 12) * 100}%`,
				top: `${seededRandom(i * 27) * 100}%`,
				size: `${(big ? 3 : 1) + Math.floor(seededRandom(i * 5) * 2)}px`,
				delay: `-${seededRandom(i * 8) * 4}s`,
				duration: `${2 + seededRandom(i * 6) * 3}s`,
				glow: big
					? "0 0 6px 1px rgba(255,255,255,0.8)"
					: "0 0 3px rgba(255,255,255,0.6)",
			};
		}),
		26,
		12,
	),
);

// Our own constellation — fixed node layout matching the polyline above.
const constellationNodes = [
	{ x: 10, y: 70, r: 1.6 },
	{ x: 32, y: 40, r: 2.4 },
	{ x: 52, y: 58, r: 1.4 },
	{ x: 70, y: 20, r: 2.8 },
	{ x: 90, y: 44, r: 1.8 },
];

// Hearts drifting up the card. Seeded so the layout is stable across renders;
// capped hard in preview tiles like the rest of the worlds.
const hearts = computed(() =>
	cap(
		Array.from({ length: 9 }, (_, i) => ({
			id: i,
			left: `${8 + seededRandom(i * 31) * 78}%`,
			bottom: `${seededRandom(i * 17) * 70}%`,
			size: `${Math.floor(seededRandom(i * 23) * 12) + 12}px`,
			delay: `-${seededRandom(i * 7) * 9}s`,
			duration: `${Math.floor(seededRandom(i * 5) * 6) + 9}s`,
			opacity: seededRandom(i * 11) * 0.35 + 0.2,
		})),
		9,
		4,
	),
);

// Meteor shower: big, slow diagonal streaks. The lottie itself falls
// up-left→down-right; the container adds a slow drift in the same direction and
// resets, so passes read as a sparse shower rather than parked loops.
const meteors = computed(() =>
	cap(
		[
			{
				id: 1,
				top: "-8%",
				left: "8%",
				size: "13rem",
				delay: "0s",
				duration: "11s",
			},
			{
				id: 2,
				top: "-18%",
				left: "40%",
				size: "11rem",
				delay: "-5s",
				duration: "13s",
			},
			{
				id: 3,
				top: "-12%",
				left: "68%",
				size: "12rem",
				delay: "-9s",
				duration: "12s",
			},
		],
		3,
		1,
	),
);
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

/* Travel is driven by transform (translateX/Y in container units) instead of
   left/top, so these sprites animate on the GPU compositor with no per-frame
   layout. cqw/cqh resolve against the card-sized `.sprite-stage` wrapper, so
   the motion is identical to the old percentage left/top. */
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
  0% { transform: translateY(-20cqh) translateX(0) rotate(0deg); }
  50% { transform: translateY(49cqh) translateX(28px) rotate(180deg); }
  100% { transform: translateY(118cqh) translateX(-18px) rotate(360deg); }
}

@keyframes walker-cross {
  from { transform: translateX(-40cqw); }
  to { transform: translateX(140cqw); }
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

/* ── Space ── */
/* Deep-space gradient with the theme accent mixed into the mid-band, angled
   down-right to echo the meteor fall. color-mix keeps it dark enough to read. */
.space-sky {
  /* Deep-space gradient with the theme accent mixed into the mid-band, angled
     down-right to echo the meteor fall. Keep the accent share low so warm
     accents (sunset/gold) tint subtly instead of turning into a muddy band. */
  background: linear-gradient(
    160deg,
    #090d20 0%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 16%, #141b3d) 52%,
    #1c1030 100%
  );
}

@keyframes star-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.8); box-shadow: var(--star-glow); }
  50% { opacity: 1; transform: scale(1.15); box-shadow: var(--star-glow); }
}

@keyframes constellation-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

/* Moon holds its corner and just breathes/tilts in place. */
@keyframes moon-bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-6px) rotate(2deg); }
}

/* Meteor: slow drift down-right (matching the lottie's own fall), then parks
   off-screen for the back half so passes feel sparse like a real shower. No
   rotate — the lottie already carries the angle. */
@keyframes meteor-streak {
  0% { transform: translate(0, 0); opacity: 0; }
  10% { opacity: 1; }
  45% { opacity: 1; }
  55% { transform: translate(170px, 240px); opacity: 0; }
  100% { transform: translate(170px, 240px); opacity: 0; }
}

/* Rocket: 6 launches packed into one loop so a single sprite reads as a rocket
   that keeps blasting off on new, VARIED headings — not all straight up. rotate
   is matched to each launch's sideways drift (nose leads the path, no wobble)
   and the sprite shrinks as it flies away. Between launches it's parked off-card
   (opacity 0) and repositioned for the next heading + size. Trajectories vary in
   BOTH direction and reach: some cross the whole card and exit the top, others
   are shorter arcs that peter out mid-card (top ~34–40%) heading left or right,
   so the sky isn't a column of identical vertical climbs. */
@keyframes rocket-fly {
  /* Launch 1 — center → up-LEFT, long, exits TOP-LEFT corner (large) */
  0%    { top: 115%; transform: translateX(55px) rotate(-22deg) scale(1);      opacity: 0; }
  2%    { opacity: 1; }
  13%   { top: -58%; transform: translateX(-160px) rotate(-22deg) scale(0.62); opacity: 1; }
  15%   { top: -70%; transform: translateX(-172px) rotate(-22deg) scale(0.58); opacity: 0; }

  /* Launch 2 — lower-RIGHT → shallow LEFT, SHORT arc, dies mid-card (medium) */
  16.6% { top: 120%; transform: translateX(120px) rotate(-33deg) scale(0.8);   opacity: 0; }
  18.6% { opacity: 1; }
  29.6% { top: 34%;  transform: translateX(-45px) rotate(-33deg) scale(0.6);   opacity: 1; }
  31.6% { top: 24%;  transform: translateX(-70px) rotate(-33deg) scale(0.57);  opacity: 0; }

  /* Launch 3 — off to the LEFT → dead-straight up, exits top (small) */
  33.3% { top: 118%; transform: translateX(-120px) rotate(0deg) scale(0.6);    opacity: 0; }
  35.3% { opacity: 1; }
  46.3% { top: -55%; transform: translateX(-120px) rotate(0deg) scale(0.42);   opacity: 1; }
  48.3% { top: -70%; transform: translateX(-120px) rotate(0deg) scale(0.4);    opacity: 0; }

  /* Launch 4 — center → up-RIGHT, long, exits TOP-RIGHT corner (large) */
  50%   { top: 115%; transform: translateX(-20px) rotate(24deg) scale(0.95);   opacity: 0; }
  52%   { opacity: 1; }
  63%   { top: -58%; transform: translateX(185px) rotate(24deg) scale(0.58);   opacity: 1; }
  65%   { top: -70%; transform: translateX(198px) rotate(24deg) scale(0.54);   opacity: 0; }

  /* Launch 5 — lower-LEFT → shallow RIGHT, SHORT arc, dies mid-right (medium) */
  66.6% { top: 120%; transform: translateX(-150px) rotate(30deg) scale(0.7);   opacity: 0; }
  68.6% { opacity: 1; }
  79.6% { top: 40%;  transform: translateX(60px) rotate(30deg) scale(0.55);    opacity: 1; }
  81.6% { top: 30%;  transform: translateX(85px) rotate(30deg) scale(0.52);    opacity: 0; }

  /* Launch 6 — center → gentle up-LEFT, ends upper-mid (medium) */
  83.3% { top: 118%; transform: translateX(30px) rotate(-12deg) scale(0.78);   opacity: 0; }
  85.3% { opacity: 1; }
  96.3% { top: 8%;   transform: translateX(-70px) rotate(-12deg) scale(0.5);   opacity: 1; }
  98.3% { top: -4%;  transform: translateX(-82px) rotate(-12deg) scale(0.47);  opacity: 0; }
  100%  { top: 115%; transform: translateX(55px) rotate(-22deg) scale(1);      opacity: 0; }
}

/* Astronaut drifts quirkily between spots, tumbling slowly as it goes. */
@keyframes astronaut-wander {
  0% { transform: translate(40%, 60%) rotate(0deg); }
  25% { transform: translate(230%, 120%) rotate(25deg); }
  50% { transform: translate(310%, 300%) rotate(-15deg); }
  75% { transform: translate(120%, 260%) rotate(20deg); }
  100% { transform: translate(40%, 60%) rotate(0deg); }
}

/* Card-sized query container so the sprites' cqw/cqh travel resolves against
   the whole card (they animate transform in container units instead of
   left/top). Applied to the ocean & autumn wrappers, which already establish a
   stacking context (z-20 + opacity<1), so `container-type` adds no new one —
   important: doing this on the SPACE world's root would trap its -z-10 sky. */
.sprite-stage {
  container-type: size;
}

/* Frozen world (staticMode): no CSS motion. Combined with autoplay=false on the
   lottie players, the whole scene sits still — cheap + non-distracting while
   drawing. animation:none leaves each sprite at its base (non-animated)
   position, so nothing vanishes off-screen. */
.world-static [class*="animate-"] {
  animation: none !important;
}

/* Promote moving sprites to their own GPU layer for smoother compositing. */
.animate-turtle-swim-lane,
.animate-fish-swim-lane,
.animate-jellyfish-drift,
.animate-leaf-fall,
.animate-walker-cross,
.animate-dragon-roam,
.animate-meteor-streak,
.animate-rocket-fly,
.animate-astronaut-wander {
  will-change: transform;
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

.animate-star-twinkle { animation: star-twinkle ease-in-out infinite; }
.animate-constellation-pulse { animation: constellation-pulse 6s ease-in-out infinite; }
.animate-moon-bob { animation: moon-bob 7s ease-in-out infinite; }
.animate-meteor-streak { animation: meteor-streak linear infinite; }
.animate-rocket-fly { animation: rocket-fly 34s linear infinite; }
.animate-astronaut-wander { animation: astronaut-wander 26s ease-in-out infinite; }

/* ── Gratitude / Constellation ── */
/* The logo, recoloured to the theme accent via mask (its own fill is
   discarded — only the shape remains, filled with an accent gradient). */
.gratitude-logo {
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--world-accent, #7c5cff) 78%, #fff) 0%,
    var(--world-accent, #7c5cff) 55%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 70%, #000) 100%
  );
  opacity: 0.9;
  filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent));
}

/* Drifting hearts, accent-coloured so they read on any theme. */
.gratitude-heart {
  color: var(--world-accent, #7c5cff);
  line-height: 1;
  opacity: 0;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent);
  will-change: transform, opacity;
}

/* Fixed stage for the anchored gratitude content. Pinned top-centre with a
   capped width + fixed aspect, so it lands in the same spot at the same scale
   whether the host is a card or the full-height UserContextSheet (mirrors the
   card doodle's capped header box). It's also the query container, so the cqw
   fonts size to THIS stage, not the host. */
.gratitude-frame {
  overflow: hidden;
}
.gratitude {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 440px;
  aspect-ratio: 4 / 3;
  container-type: inline-size;
}

/* Thank-you text — accent-coloured with a soft glow so it holds on either
   theme without needing the full theme palette passed in. Font sizes are
   fluid (cqw = 1% of card width) with clamped floors/ceilings, so they stay
   readable on a tiny phone and don't balloon on a big card. */
.gratitude-text {
  color: var(--world-accent, #7c5cff);
  text-align: left;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 40%, transparent);
  overflow-wrap: break-word;
  hyphens: auto;
}
.gratitude-lead {
  font-size: clamp(0.5rem, 3.9cqw, 0.5rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.15;
  opacity: 0.8;
  margin-bottom: 0.35rem;
}
.gratitude-thanks {
  font-size: clamp(0.95rem, 8.4cqw, 1.4rem);
  font-weight: 900;
  line-height: 1.02;
  letter-spacing: 0.01em;
}
.gratitude-sign {
  font-size: clamp(0.5rem, 3.6cqw, 0.45rem);
  font-weight: 700;
  font-style: italic;
  opacity: 0.75;
  margin-top: 0.5rem;
}

/* On narrow cards the fixed 54% text box + 25% logo leaves the words no room,
   so give the text more width and pull the logo smaller/further out as the card
   shrinks. Selectors are card-scoped (.gratitude …) so they beat the inline
   Tailwind width utilities. Container units, so this tracks CARD width. */
@container (max-width: 360px) {
  .gratitude .gratitude-text { width: 60%; }
  .gratitude .gratitude-logo { width: 22%; right: 7%; }
}
@container (max-width: 300px) {
  .gratitude .gratitude-text { width: 66%; }
  .gratitude .gratitude-logo { width: 18%; right: 5%; opacity: 0.75; }
  .gratitude-thanks { letter-spacing: -0.01em; }
}

/* Gentle in-place bob for the logo. */
@keyframes logo-bob {
  0%, 100% { transform: translateY(-50%) rotate(-2deg); }
  50% { transform: translateY(calc(-50% - 8px)) rotate(2deg); }
}
.animate-logo-bob {
  animation: logo-bob 8s ease-in-out infinite;
  will-change: transform;
}

/* Hearts rise, sway, and fade — a soft rising affection. */
@keyframes heart-float {
  0% { transform: translateY(0) scale(0.8) rotate(-6deg); opacity: 0; }
  20%, 75% { opacity: var(--target-opacity, 0.4); }
  100% { transform: translateY(-140px) scale(1.05) rotate(8deg); opacity: 0; }
}
.animate-heart-float {
  animation: heart-float linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-logo-bob { animation: none; }
  .animate-heart-float {
    animation: none;
    opacity: var(--target-opacity, 0.4);
  }
}

.lottie-strict-bounds :deep(canvas), .lottie-strict-bounds :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  display: block;
}
</style>