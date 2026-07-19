<template>
  <div
    v-if="def && def.kind !== 'none'"
    ref="root"
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="[radiusClass, { 'world-preview': preview, 'world-static': staticMode, 'world-mini': mini, 'world-banner': banner, 'world-paused': paused && !staticMode }]"
    :style="preview ? { '--world-scale': previewScale } : undefined"
    style="isolation: isolate;"
    aria-hidden="true"
  >
    <!-- Latched mount: once the card has been on-screen we KEEP the canvases in
         the DOM (we merely play/pause the players) so scrolling back to a card
         never re-mounts and pops-in → no flicker. -->
    <template v-if="hasMounted">

      <div v-if="def.kind === 'ocean'" class="absolute inset-0 z-20 opacity-90 sprite-stage">
        <div
          v-for="j in jellyfishes"
          :key="'jf' + j.id"
          class="absolute animate-jellyfish-drift opacity-75"
          :style="{
            left: j.left,
            width: j.size,
            height: j.size,
            animationDelay: j.delay,
            animationDuration: j.duration,
          }"
        >
          <!-- DUMB CANVAS: Receives frames dynamically from the master memory buffer -->
          <canvas :ref="(el) => bindCanvas(el, SPRITES.jellyfish)" class="w-full h-full object-contain"></canvas>
        </div>

        <div
          v-for="t in experimentalTurtles"
          :key="'t' + t.id"
          class="absolute animate-turtle-swim-lane"
          :style="{
            width: t.size,
            height: t.size,
            top: t.initialTop,
            left: staticMode ? t.staticLeft : undefined,
            animationDelay: t.delay,
            animationDuration: t.duration,
          }"
        >
          <canvas :ref="(el) => bindCanvas(el, SPRITES.turtle)" class="w-full h-full object-contain"></canvas>
        </div>

        <div
          v-for="f in fishes"
          :key="'f' + f.id"
          class="absolute animate-fish-swim-lane"
          :style="{
            width: f.size,
            height: f.size,
            top: f.top,
            left: staticMode ? f.staticLeft : undefined,
            animationDelay: f.delay,
            animationDuration: f.duration,
          }"
        >
          <canvas :ref="(el) => bindCanvas(el, SPRITES.fish)" class="w-full h-full object-contain"></canvas>
        </div>
      </div>

      <div v-else-if="def.kind === 'cat'" class="absolute inset-0 z-20 opacity-100">
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
            <canvas :ref="(el) => bindCanvas(el, SPRITES.plant)" class="w-full h-full object-contain"></canvas>
          </div>
          <div class="absolute bottom-[40%] right-[-10%] w-18 h-18 origin-bottom animate-plant-sway opacity-60 z-0 transform scaleX(-1)">
            <canvas :ref="(el) => bindCanvas(el, SPRITES.plant)" class="w-full h-full object-contain"></canvas>
          </div>
          <div class="w-32 h-32 opacity-100 filter drop-shadow-sm z-10">
            <canvas :ref="(el) => bindCanvas(el, SPRITES.cat)" class="w-full h-full object-contain"></canvas>
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
          <canvas :ref="(el) => bindCanvas(el, SPRITES.leaves)" class="w-full h-full object-contain"></canvas>
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
          <canvas :ref="(el) => bindCanvas(el, SPRITES.mushroom)" class="w-full h-full object-contain"></canvas>
        </div>
      </div>

      <div v-else-if="def.kind === 'dragon'" class="absolute inset-0 z-20 opacity-100">
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
          <canvas :ref="(el) => bindCanvas(el, SPRITES.fire)" class="w-full h-full object-contain"></canvas>
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
          <canvas :ref="(el) => bindCanvas(el, SPRITES.dragon)" class="w-full h-full object-contain"></canvas>
        </div>
      </div>

      <div
        v-if="def.kind === 'space'"
        class="absolute inset-0"
        :style="{ '--world-accent': accent }"
      >
        <div class="absolute inset-0 space-sky -z-10"></div>

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
          <canvas :ref="(el) => bindCanvas(el, SPRITES.meteor)" class="w-full h-full object-contain"></canvas>
        </div>

        <div class="absolute top-[10%] right-[8%] w-24 h-24 animate-moon-bob z-10">
          <canvas :ref="(el) => bindCanvas(el, SPRITES.moon)" class="w-full h-full object-contain"></canvas>
        </div>

        <div class="absolute left-[40%] top-0 w-28 h-28 animate-rocket-fly z-10">
          <canvas :ref="(el) => bindCanvas(el, SPRITES.rocket)" class="w-full h-full object-contain"></canvas>
        </div>

        <div class="absolute top-0 left-0 w-20 h-20 animate-astronaut-wander z-20">
          <canvas :ref="(el) => bindCanvas(el, SPRITES.astronaut)" class="w-full h-full object-contain"></canvas>
        </div>
      </div>

      <div
        v-else-if="def.kind === 'gratitude'"
        class="absolute inset-0 gratitude-frame"
        :style="{ '--world-accent': accent }"
      >
        <div class="gratitude">
          <div
            class="absolute right-[5%] top-8/12 w-[25%] -translate-y-1/2 aspect-square gratitude-logo animate-logo-bob"
            :style="{
              '-webkit-mask-image': `url(${logo})`,
              'mask-image': `url(${logo})`,
            }"
          ></div>

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
            <p class="gratitude-thanks">OG User</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
	computed,
	inject,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	toValue,
	watch,
} from "vue";
import {
	acquireSprite,
	SPRITE_DPR,
	prefetchSprite,
	warmFrozenFrame,
	type SpriteHandle,
} from "@/helper/lottie_sprite.helper";
import { resolveWorld, type WorldDef } from "@/config/profile_options.config";
import {
	AMBIENT_FOREGROUND,
	useAmbientPause,
} from "@/store/ambientPause.store";

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
		previewScale?: number;
		accent?: string;
		font?: string;
		staticMode?: boolean;
		radiusClass?: string;
		mini?: boolean;
		/** Feed-post header variant. `mini` is tuned for a chat-list ROW — it hard
		    clips against a short box and anchors hard right, which in a post header
		    collides with the artist signature and cuts the scene off mid-sprite.
		    `banner` instead dissolves the scene into the card on every edge and
		    sits low-right, clear of the signature. */
		banner?: boolean;
		/** Gate player creation tightly to the viewport instead of the giant hero
		    margin. Set on LIST instances (feed cards, chat toolbar) so only worlds
		    near the viewport ever spin up lottie workers — a 20-item feed must not
		    instantiate 20×N players up front. */
		contained?: boolean;
	}>(),
	{
		preview: false,
		previewScale: 0.5,
		accent: "#7c5cff",
		staticMode: false,
		radiusClass: "rounded-[2.5rem]",
		mini: false,
		banner: false,
		contained: false,
	},
);

const def = computed<WorldDef>(() => props.def || resolveWorld(props.worldId));

// ── On-screen gating & run-state engine ─────────────────────────────────────
const root = ref<HTMLElement | null>(null);
const onScreen = ref(false);
// Latched: flips true the first time the card is on-screen and never back — the
// canvases stay mounted so re-scrolling doesn't re-create them (that was the
// pop-in flicker). Playback is governed by `paused` instead.
const hasMounted = ref(false);
const ambient = useAmbientPause();
// Foreground subtrees (inside the shop / a preview modal) ignore the global
// overlay pause — they ARE the overlay's content and must keep animating.
const foreground = inject(AMBIENT_FOREGROUND, false);
let io: IntersectionObserver | null = null;

// Weak phones (flag stamped in main.ts). Two mitigations hang off this: fewer
// sprites (see `cap`) and a freeze-frame lottie mode (see `applyRunState`).
const lowEnd =
	typeof document !== "undefined" &&
	document.documentElement.classList.contains("low-end");

// ── Sprite canvases via the shared pool (lottie_sprite.helper) ──────────────
// Android WebView can't run DotLottieWorker (no rAF inside Worker/Offscreen-
// Canvas ⇒ frozen on frame 0), so on native the pool decodes each sprite TYPE
// once into a hidden master canvas and fans frames out with cheap drawImage
// blits — 1 decoder per type instead of 1 per canvas. On web each canvas keeps
// its own DotLottieWorker (fully off the main thread). Sprites whose motion is
// carried by the CSS travel animation anyway (`frozen` below), plus whole
// static/low-end worlds, render ONE cached snapshot and never own a player.
type Sprite = { el: HTMLCanvasElement; handle: SpriteHandle };
const sprites = new Set<Sprite>();

// Per-type spec: src + the largest on-screen size of that sprite (drives the
// master/snapshot resolution) + whether its own frames ever need to advance.
type SpriteSpec = { src: string; maxRem: number; frozen?: boolean };
const remPx = (rem: number) => Math.round(rem * 16 * SPRITE_DPR);
const SPRITES = {
	jellyfish: { src: jellyFishLottie, maxRem: 6 },
	turtle: { src: turtleLottie, maxRem: 7.2 },
	fish: { src: fishLottie, maxRem: 4 },
	cat: { src: catLottie, maxRem: 8 },
	// Sway/tumble/streak/bob/wander all come from CSS transforms — a frozen
	// frame reads identical in motion, so these never pay for a player.
	plant: { src: plantLottie, maxRem: 5, frozen: true },
	leaves: { src: autumn_leaves, maxRem: 13.5, frozen: true },
	mushroom: { src: mushroom_walking, maxRem: 8.5 },
	fire: { src: fire, maxRem: 8 },
	dragon: { src: dragon, maxRem: 18 },
	// NOT frozen: the meteor asset is a sparse thin streak on every single
	// frame (~0.5% of its box) — its visible life IS the animated trail.
	meteor: { src: meteor, maxRem: 13 },
	moon: { src: moon, maxRem: 6, frozen: true },
	rocket: { src: rocket, maxRem: 7 },
	astronaut: { src: astronaut, maxRem: 5, frozen: true },
} satisfies Record<string, SpriteSpec>;

// Warm the sprite pipeline once, off the critical path: pre-decode the
// always-frozen snapshots (shop tiles/previews then stamp instantly instead of
// popping in after a load+decode round-trip) and prime the HTTP cache for the
// animated ones so their players load from cache when a preview mounts.
let spritesWarmed = false;
function warmSprites() {
	if (spritesWarmed) return;
	spritesWarmed = true;
	const kick = () => {
		Object.values(SPRITES).forEach((spec: SpriteSpec) => {
			if (spec.frozen) warmFrozenFrame(spec.src, remPx(spec.maxRem));
			else prefetchSprite(spec.src);
		});
	};
	"requestIdleCallback" in window
		? requestIdleCallback(kick, { timeout: 2000 })
		: setTimeout(kick, 300);
}

// Static worlds (feed/toolbar minis) AND low-end phones show a single frozen
// frame — the player renders one frame then holds it, so there's zero ongoing
// decode. The CSS travel animations still glide the sprites via cheap GPU
// transforms, so the scene reads as alive without any per-frame wasm cost.
const freezeFrame = computed(() => props.staticMode || lowEnd);

const paused = computed(
	() =>
		freezeFrame.value ||
		!onScreen.value ||
		(!toValue(foreground) && ambient.paused),
);

function applyRunState() {
	const active = !paused.value;
	sprites.forEach(({ handle }) => handle.setActive(active));
}

onMounted(() => {
	warmSprites();
	if (typeof IntersectionObserver === "undefined") {
		onScreen.value = true;
		hasMounted.value = true;
		return;
	}
	io = new IntersectionObserver(
		(entries) => {
			onScreen.value = entries.some((e) => e.isIntersecting);
			if (onScreen.value) hasMounted.value = true;
			applyRunState();
		},
		// preview: shop/picker grids mount dozens of tiles — only ~a row ahead may
		// spin up players. contained: feed/list instances. default: hero card.
		{
			rootMargin: props.preview
				? "300px"
				: props.contained
					? "300px"
					: "9999px",
		},
	);

	watch(
		root,
		(el) => {
			io?.disconnect();
			if (el) io?.observe(el);
		},
		{ immediate: true, flush: "post" },
	);
});

watch(paused, applyRunState);

const destroyAllSprites = () => {
	sprites.forEach((s) => s.handle.destroy());
	sprites.clear();
};

// Switching world kind unmounts the old sprite canvases and mounts new ones.
// After the DOM settles, release any handle whose canvas has detached so the
// old world's players don't leak (the freshly-mounted ones stay connected).
watch(
	() => def.value.kind,
	async () => {
		await nextTick();
		sprites.forEach((s) => {
			if (!s.el.isConnected) {
				s.handle.destroy();
				sprites.delete(s);
			}
		});
	},
);

onBeforeUnmount(() => {
	io?.disconnect();
	destroyAllSprites();
});

const bindCanvas = (el: any, spec: SpriteSpec) => {
	if (!el) return;
	const canvas = el as HTMLCanvasElement;
	// The :ref callback can fire repeatedly for the same element; bind once.
	if ((canvas as any).__pwBound) return;
	(canvas as any).__pwBound = true;

	// Frozen-ness is decided once at bind: either the sprite type never animates
	// its own frames, or the whole world is a freeze-frame (static/low-end).
	sprites.add({
		el: canvas,
		handle: acquireSprite({
			canvas,
			src: spec.src,
			frozen: spec.frozen || freezeFrame.value,
			active: !paused.value,
			masterSize: remPx(spec.maxRem),
		}),
	});
};

// ── Positional List Generation Mechanics ────────────────────────────────────
// Low-end phones get the trimmed preview counts too — fewer sprites means fewer
// concurrent lottie decoders, the single biggest main-thread cost on weak GPUs.
const cap = <T>(list: T[], full: number, prev: number): T[] =>
	list.slice(0, props.preview || lowEnd ? prev : full);

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
				staticLeft: "8%",
				delay: "0s",
				duration: "36s",
			},
			{
				id: 2,
				size: "5.5rem",
				initialTop: "28%",
				staticLeft: "58%",
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
			{
				id: 1,
				size: "4.0rem",
				top: "20%",
				staticLeft: "12%",
				delay: "-5s",
				duration: "28s",
			},
			{
				id: 2,
				size: "3.2rem",
				top: "44%",
				staticLeft: "48%",
				delay: "-14s",
				duration: "24s",
			},
			{
				id: 3,
				size: "3.6rem",
				top: "8%",
				staticLeft: "74%",
				delay: "-25s",
				duration: "32s",
			},
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

const wanderingDragons = [
	{ id: 1, size: "18rem", delay: "0s", duration: "17s" },
];

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

const constellationNodes = [
	{ x: 10, y: 70, r: 1.6 },
	{ x: 32, y: 40, r: 2.4 },
	{ x: 52, y: 58, r: 1.4 },
	{ x: 70, y: 20, r: 2.8 },
	{ x: 90, y: 44, r: 1.8 },
];

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
/* All CSS styles from original implementation remain intact */
.world-preview {
  inset: auto;
  top: 50%;
  left: 50%;
  width: 320px;
  height: 280px;
  transform: translate(-50%, -50%) scale(var(--world-scale, 0.5));
  transform-origin: center;
}
/* Feed-post header. Two things made the mini variant read as an afterthought
   here: the scene ended on a hard edge where the header box clipped it, and it
   was anchored at the same right-centre point the signature occupies.

   The radial mask dissolves the scene on EVERY edge instead of clipping it, so
   there is no cut line to notice; anchoring bottom-right and pushing it down
   past the baseline keeps it under the description rather than behind the
   signature. Lower opacity puts it firmly behind the text. */
.world-banner {
  /* Centre-anchored like .world-preview, NOT bottom-anchored with a downward
     translate — that scaled about a point below the header, which put the whole
     sprite band under the clip line and made the world render as nothing. */
  inset: auto;
  top: 50%;
  right: 0;
  left: auto;
  width: 320px;
  height: 280px;
  transform: translateY(-50%) scale(0.46);
  transform-origin: right center;
  opacity: 0.85;

  /* Two masks intersected: fade out to the LEFT so the artist's name always sits
     on clean card, and soften top/bottom so the scene dissolves into the header
     instead of ending on the clip edge. */
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 20%, #000 80%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 20%, #000 80%, transparent 100%);
  mask-composite: intersect;
}

.world-mini {
  inset: auto;
  top: 50%;
  /* Flush to the card edge, not inset 6%. The left-fade gradient is what ends
     the scene, so an inset left a strip of bare card to the RIGHT of the world
     — the gradient resolved into card instead of running off the edge. */
  right: 0;
  left: auto;
  width: 320px;
  height: 280px;
  /* The 280px stage has to fit a ~76px list row. At the old 0.52 the lowest
     sprite was only ~54% visible (measured) — that half-cut sprite is what made
     space/dragon look broken here. 0.34 puts every sprite fully inside at both
     76px and 88px row heights. Smaller sprites, but whole ones. */
  transform: translateY(-50%) scale(0.34);
  transform-origin: right center;
  opacity: 0.72;
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
  mask-composite: intersect;
}
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
@keyframes fire-flicker {
  0%, 100% { transform: scale(1) rotate(-1deg); opacity: 0.75; }
  50% { transform: scale(1.15) rotate(3deg); opacity: 1; filter: brightness(1.2); }
}
.space-sky {
  background: linear-gradient(
    160deg,
    #090d20 0%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 16%, #141b3d) 52%,
    #1c1030 100%
  );
}
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
.sprite-stage { container-type: size; }
.world-static [class*="animate-"] { animation: none !important; }
.world-static .animate-astronaut-wander { top: 40%; left: 22%; }
.world-static .animate-rocket-fly { top: 46%; left: 56%; }

/* Off-screen / behind the photoswiper: FREEZE the CSS travel animations where
   they are (unlike world-static, which resets to fixed positions). Pairs with
   the DotLottie player pause + rAF stop so sprites are fully frozen — no drift
   while hidden, and they resume from the same spot with no jump. */
.world-paused [class*="animate-"] { animation-play-state: paused !important; }

.animate-turtle-swim-lane, .animate-fish-swim-lane, .animate-jellyfish-drift,
.animate-leaf-fall, .animate-walker-cross, .animate-dragon-roam,
.animate-meteor-streak, .animate-rocket-fly, .animate-astronaut-wander {
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
.animate-star-twinkle { animation: star-twinkle ease-in-out infinite; box-shadow: var(--star-glow); }
.animate-constellation-pulse { animation: constellation-pulse 6s ease-in-out infinite; }
.animate-moon-bob { animation: moon-bob 7s ease-in-out infinite; }
.animate-meteor-streak { animation: meteor-streak linear infinite; }
.animate-rocket-fly { animation: rocket-fly 34s linear infinite; }
.animate-astronaut-wander { animation: astronaut-wander 26s ease-in-out infinite; }

.gratitude-logo {
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
  background: linear-gradient(150deg, color-mix(in srgb, var(--world-accent, #7c5cff) 78%, #fff) 0%, var(--world-accent, #7c5cff) 55%, color-mix(in srgb, var(--world-accent, #7c5cff) 70%, #000) 100%);
  opacity: 0.9;
  filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent));
}
.gratitude-heart {
  color: var(--world-accent, #7c5cff); line-height: 1; opacity: 0;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent);
  will-change: transform, opacity;
}
.gratitude-frame { overflow: hidden; }
.gratitude {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 440px; aspect-ratio: 4 / 3; container-type: inline-size;
}
.gratitude-text {
  color: var(--world-accent, #7c5cff); text-align: left;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 40%, transparent);
  overflow-wrap: break-word; hyphens: auto;
}
.gratitude-thanks { font-size: clamp(0.95rem, 8.4cqw, 1.4rem); font-weight: 900; line-height: 1.02; letter-spacing: 0.01em; }

@container (max-width: 360px) {
  .gratitude .gratitude-text { width: 60%; }
  .gratitude .gratitude-logo { width: 22%; right: 7%; }
}
@container (max-width: 300px) {
  .gratitude .gratitude-text { width: 66%; }
  .gratitude .gratitude-logo { width: 18%; right: 5%; opacity: 0.75; }
  .gratitude-thanks { letter-spacing: -0.01em; }
}
@keyframes logo-bob {
  0%, 100% { transform: translateY(-50%) rotate(-2deg); }
  50% { transform: translateY(calc(-50% - 8px)) rotate(2deg); }
}
.animate-logo-bob { animation: logo-bob 8s ease-in-out infinite; will-change: transform; }
@keyframes heart-float {
  0% { transform: translateY(0) scale(0.8) rotate(-6deg); opacity: 0; }
  20%, 75% { opacity: var(--target-opacity, 0.4); }
  100% { transform: translateY(-140px) scale(1.05) rotate(8deg); opacity: 0; }
}
.animate-heart-float { animation: heart-float linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .animate-logo-bob { animation: none; }
  .animate-heart-float { animation: none; opacity: var(--target-opacity, 0.4); }
}
</style>