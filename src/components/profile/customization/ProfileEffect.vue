<template>
  <div
    v-if="def && def.kind !== 'none'"
    ref="root"
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="[radiusClass, { 'fx-frozen': paused }]"
    :style="{
    isolation: 'isolate',
    visibility: (!onScreen && hasMounted) ? 'hidden' : 'visible'
  }"
    aria-hidden="true"
  >
    <template v-if="hasMounted">
    <div
      v-if="def.kind === 'grain'"
      class="absolute inset-0 grain-bg"
      :style="{ opacity: preview ? 0.8 : 0.6 }"
    ></div>

    <div
      v-else-if="def.kind === 'shimmer'"
      class="absolute -inset-[100%] shimmer-sweep"
      :class="speedClass"
      :style="shimmerStyle"
    ></div>

    <div
      v-else-if="def.kind === 'glass'"
      class="absolute inset-0 glass"
      :class="speedClass"
    >
      <!-- Prismatic refraction drifting beneath the cracks (composited rotation) -->
      <div class="absolute inset-0 glass-prism"></div>

      <!-- Specular sheen: oversized pre-painted gradient SWEPT BY TRANSFORM.
           The old version animated background-position, which repaints the full
           card layer every frame — a transform sweep is pure compositor work. -->
      <div class="absolute -inset-[60%] glass-sheen"></div>

      <!-- Static fracture mesh: strokes + impact cracks, painted exactly once.
           No filter, no animation — this layer never invalidates. -->
      <svg
        class="absolute inset-0 w-full h-full glass-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="glassFacet" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55" />
            <stop offset="45%" stop-color="#ffffff" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <g
          stroke="rgba(255,255,255,0.45)"
          stroke-width="0.4"
          fill="none"
          stroke-linejoin="round"
        >
          <polygon points="60,32 72,0 100,0" />
          <polygon points="60,32 100,40 100,78" />
          <polygon points="60,32 100,100 70,100" />
          <polygon points="60,32 30,100 0,100" />
          <polygon points="60,32 0,66 0,24" />
          <polygon points="60,32 0,0 28,0" />
        </g>
        <g
          stroke="rgba(255,255,255,0.6)"
          stroke-width="0.25"
          fill="none"
          stroke-linecap="round"
        >
          <path d="M60,32 L72,0 M60,32 L100,40 M60,32 L100,100 M60,32 L30,100 M60,32 L0,66 M60,32 L0,24 M60,32 L28,0" />
        </g>
      </svg>

      <!-- Shard fills, split into three groups. Each group animates WHOLE-SVG
           opacity (compositor-driven, no SVG-internal repaint) with staggered
           delays, so light still ripples across the break — the old version
           animated every polygon individually, re-rasterising the entire SVG
           (plus its drop-shadow filter) every single frame. -->
      <svg
        v-for="(group, gi) in facetGroups"
        :key="'fg' + gi"
        class="absolute inset-0 w-full h-full glass-shards"
        :class="'glass-shards--' + gi"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <g fill="url(#glassFacet)" stroke="none">
          <polygon v-for="(pts, pi) in group" :key="pi" :points="pts" />
        </g>
      </svg>

      <!-- Twinkling glints at impact vertices -->
      <span class="glass-glint" style="left: 60%; top: 32%"></span>
      <span class="glass-glint glass-glint--b" style="left: 30%; top: 18%"></span>
      <span class="glass-glint glass-glint--c" style="left: 78%; top: 58%"></span>
    </div>

    <!-- ── CRUMPLED PAPER (OG-exclusive) ──────────────────────────────────
         Three passes of the same paper photo: a multiply layer bakes the
         crease shadows onto the card, a soft-light layer lifts the ridges,
         and a slow light sweep makes the folds catch the light as it moves. -->
    <div v-else-if="def.kind === 'crumpled'" class="absolute inset-0">
      <div
        class="absolute inset-0 crumple-shadows"
        :style="{ backgroundImage: `url(${paper})` }"
      ></div>
      <div
        class="absolute inset-0 crumple-highlights"
        :style="{ backgroundImage: `url(${paper})` }"
      ></div>
      <div class="absolute -inset-[100%] crumple-sheen" :class="speedClass"></div>
      <!-- Deepen the four corners so the sheet reads as pressed flat onto the card -->
      <div class="absolute inset-0 crumple-vignette"></div>
    </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import {
	computed,
	inject,
	onBeforeUnmount,
	onMounted,
	ref,
	toValue,
	watch,
} from "vue";
import {
	resolveEffect,
	type ProfileEffectDef,
} from "@/config/profile_options.config";
import {
	AMBIENT_FOREGROUND,
	useAmbientPause,
} from "@/store/ambientPause.store";
import paper from "@/assets/textures/paper.webp";

const props = withDefaults(
	defineProps<{
		effectId?: string;
		def?: ProfileEffectDef;
		/** Preview mode shortens delays and speeds animations */
		preview?: boolean;
		/** Corner radius of the clip box. Default matches the profile card; pass
        'rounded-none' when hosting in a rectangular surface (chat toolbar, feed
        header) so the clip doesn't leave odd rounded corners. */
		radiusClass?: string;
		/** Permanently freeze the effect (e.g. behind the doodle pad, where a
		    scaled-up animating effect layer tanks GPU while drawing). */
		staticEffect?: boolean;
		/** Gate tightly to the viewport instead of the giant hero margin. Set on
		    LIST instances (feed cards) so off-screen effects actually freeze —
		    the default 9999px margin keeps a single hero card alive across scroll,
		    but in a 20-item feed it means every conic-blur layer animates forever. */
		contained?: boolean;
	}>(),
	{
		preview: false,
		radiusClass: "rounded-[2.5rem]",
		staticEffect: false,
		contained: false,
	},
);

const def = computed<ProfileEffectDef>(
	() => props.def || resolveEffect(props.effectId),
);

// Only ANIMATE the (GPU-heavy: blur / conic-gradient / mix-blend / SVG) effect
// while the card is on/near screen and no fullscreen photo swiper is covering
// the app. We keep the DOM mounted once shown (latched) and merely freeze the
// animations via `.fx-frozen` — tearing it down and re-building on every scroll
// was the pop-in flicker.
const root = ref<HTMLElement | null>(null);
const onScreen = ref(false);
const hasMounted = ref(false);
const ambient = useAmbientPause();
// Foreground subtrees (shop / preview modal) ignore the global overlay pause.
const foreground = inject(AMBIENT_FOREGROUND, false);

const paused = computed(
	() =>
		props.staticEffect ||
		!onScreen.value ||
		(!toValue(foreground) && ambient.paused),
);
let io: IntersectionObserver | null = null;

onMounted(() => {
	if (typeof IntersectionObserver === "undefined") {
		onScreen.value = true;
		hasMounted.value = true;
		return;
	}
	io = new IntersectionObserver(
		(entries) => {
			onScreen.value = entries.some((e) => e.isIntersecting);
			if (onScreen.value) hasMounted.value = true;
		},
		// Grid tiles (preview) gate tightly — a shop shelf mounts dozens at once,
		// so only ~a row ahead may animate. The full hero card uses a huge margin
		// so ordinary in-page scrolling never tears it down and re-mounts it (the
		// pop-in flicker) — it still deactivates when the whole page is hidden
		// (display:none ⇒ no box ⇒ not intersecting).
		{
			rootMargin: props.preview
				? "300px"
				: props.contained
					? "300px"
					: "9999px",
		},
	);
	// Re-observe whenever the root element appears/changes. Root is v-if'd on
	// def.kind !== 'none', so switching FROM a 'none' effect creates the root only
	// after mount — a one-shot observe would miss it and the newly selected effect
	// would never activate (blank until re-triggered).
	watch(
		root,
		(el) => {
			io?.disconnect();
			if (el) io?.observe(el);
		},
		{ immediate: true, flush: "post" },
	);
});

onBeforeUnmount(() => io?.disconnect());

// Fracture fan around the impact point, interleaved into 3 groups so the
// staggered group opacities read as light rippling shard-to-shard.
const GLASS_POLYGONS = [
	"60,32 72,0 100,0",
	"60,32 100,0 100,40",
	"60,32 100,40 100,78",
	"60,32 100,78 100,100",
	"60,32 100,100 70,100",
	"60,32 70,100 30,100",
	"60,32 30,100 0,100",
	"60,32 0,100 0,66",
	"60,32 0,66 0,24",
	"60,32 0,24 0,0",
	"60,32 0,0 28,0",
	"60,32 28,0 72,0",
];
const facetGroups = [0, 1, 2].map((g) =>
	GLASS_POLYGONS.filter((_, i) => i % 3 === g),
);

const speedClass = computed(() => {
	if (props.preview) return "speed-fast";
	switch (def.value.speed) {
		case "slow":
			return "speed-slow";
		case "fast":
			return "speed-fast";
		default:
			return "speed-normal";
	}
});

const shimmerStyle = computed(() => {
	if (def.value.color === "rainbow") {
		return {
			background:
				"linear-gradient(115deg, transparent 30%, rgba(255,0,150,0.3) 40%, rgba(0,200,255,0.3) 50%, rgba(255,200,0,0.3) 60%, transparent 70%)",
		};
	}
	return {
		background: `linear-gradient(115deg, transparent 40%, ${def.value.color || "rgba(255,255,255,0.4)"} 50%, transparent 60%)`,
	};
});
</script>

<style scoped>
/* Off-screen or behind a fullscreen swiper: freeze every animation so the blur
   / conic-gradient layers stop re-rasterising, without unmounting (which would
   flicker on scroll-back). Dropping will-change lets the GPU evict the frozen
   layers' textures. */
.fx-frozen *,
.fx-frozen *::before,
.fx-frozen *::after {
  animation-play-state: paused !important;
  will-change: auto !important;
}

.grain-bg {
  /* Opaque, contrast-boosted GRAYSCALE noise (both light AND dark speckles),
     blended with `overlay` so it reads on ANY backdrop — light themes, dark
     themes and the space world alike. The old effect was black alpha-only noise
     on normal blend, which vanished on anything dark. The feColorMatrix maps the
     turbulence to gray (luminance) with a 1.6× contrast stretch about 0.5 and
     forces alpha to 1; overlay then lightens where the grain is bright and
     darkens where it's dark, so the texture is present regardless of theme. */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0.544 0.544 0.544 0 -0.3 0.544 0.544 0.544 0 -0.3 0.544 0.544 0.544 0 -0.3 0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  mix-blend-mode: overlay;
}

@keyframes shimmer {
  0% {
    transform: translateX(-50%) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateX(50%) rotate(0deg);
    opacity: 0;
  }
}

.shimmer-sweep {
  animation-name: shimmer;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}

.speed-slow {
  animation-duration: 6s;
}

.speed-normal {
  animation-duration: 4s;
}

.speed-fast {
  animation-duration: 2s;
}

/* ─── SHATTERED GLASS ─────────────────────────────────────────────── */
.glass {
  /* speedClass sets --dur via animation-duration on children below */
  /* Own compositor layer + isolation so the mix-blend sheen/facets composite
     against THIS group only, not the live card behind (a GIF avatar / animated
     name repainting behind an un-isolated blend group is the flicker source). */
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
}

/* Prismatic refraction: slow rotating rainbow, blurred, peeking through facets */
.glass-prism {
  background: conic-gradient(
    from 0deg,
    rgba(255, 0, 128, 0.35),
    rgba(255, 170, 0, 0.35),
    rgba(0, 230, 170, 0.35),
    rgba(0, 150, 255, 0.35),
    rgba(180, 0, 255, 0.35),
    rgba(255, 0, 128, 0.35)
  );
  filter: blur(14px) saturate(1.4);
  mix-blend-mode: screen;
  opacity: 0.5;
  transform-origin: 55% 35%;
  animation: glass-drift 18s linear infinite;
  /* Own compositor layer: the expensive blur(14px) rasterizes ONCE and the
     rotation is composited on the GPU, instead of re-blurring every frame. */
  will-change: transform;
}

/* Low-end: shrink the priciest standalone blur (the global backdrop-filter
   kill in main.css doesn't touch `filter: blur`). */
html.low-end .glass-prism {
  filter: blur(6px) saturate(1.2);
}

/* Android WebView (EVERY Android, not only low-end): mix-blend groups
   composited near self-repainting content (GIF avatar, foil name) make the
   compositor re-rasterize the whole card — the flicker. Swap every blend for
   tuned normal alpha; all remaining animation is compositor-only
   (transform/element-opacity), so the card surface never repaints. */
html.android-wv .glass-prism,
html.android-wv .glass-sheen,
html.android-wv .glass-shards,
html.android-wv .glass-lines,
html.low-end .glass-prism,
html.low-end .glass-sheen,
html.low-end .glass-shards,
html.low-end .glass-lines {
  mix-blend-mode: normal;
}
html.android-wv .glass-sheen {
  opacity: 0.55;
}
/* Static shards on Android: without animation + will-change they stop being
   THREE separate full-card GPU layers and flatten into the parent's single
   texture — the ripple is traded for ~3 fewer big compositor surfaces per
   glass instance (the shop preview stacks several instances). */
html.android-wv .glass-shards {
  animation: none;
  will-change: auto;
  opacity: 0.6;
}
html.android-wv .glass-prism {
  filter: blur(8px) saturate(1.2);
  opacity: 0.4;
}
/* Glints carry a drop-shadow filter each — not worth their layers here. */
html.android-wv .glass-glint {
  display: none;
}

/* Low-end additionally stills the shard pulse and drops the filtered glints. */
html.low-end .glass-shards {
  animation: none;
  will-change: auto;
  opacity: 0.55;
}
html.low-end .glass-glint {
  display: none;
}

/* Specular sheen sweep — a pre-painted oversized gradient translated across the
   card. transform+opacity only ⇒ rasterized once, animated on the compositor. */
.glass-sheen {
  background: linear-gradient(
    115deg,
    transparent 42%,
    rgba(255, 255, 255, 0.55) 49%,
    rgba(255, 255, 255, 0.15) 53%,
    transparent 60%
  );
  mix-blend-mode: overlay;
  animation: glass-sweep 7s ease-in-out infinite;
  will-change: transform;
}

/* Static crack strokes — painted once, never invalidated. */
.glass-lines {
  mix-blend-mode: overlay;
}

/* Shard fill groups — element-level opacity animation is compositor-driven;
   nothing inside the SVG ever changes, so the texture uploads once. */
.glass-shards {
  mix-blend-mode: overlay;
  animation: glass-shard-pulse 5s ease-in-out infinite;
  will-change: opacity;
}
.glass-shards--1 {
  animation-delay: -1.66s;
}
.glass-shards--2 {
  animation-delay: -3.33s;
}

/* Sparkle glints at the impact vertices */
.glass-glint {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  background:
    radial-gradient(
      circle,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(255, 255, 255, 0) 60%
    );
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.9));
  opacity: 0;
  animation: glass-twinkle 4s ease-in-out infinite;
}
.glass-glint::before,
.glass-glint::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    transparent 46%,
    rgba(255, 255, 255, 0.95) 50%,
    transparent 54%
  );
}
.glass-glint::after {
  transform: rotate(90deg);
}
.glass-glint--b {
  animation-delay: -1.5s;
}
.glass-glint--c {
  animation-delay: -2.8s;
}

@keyframes glass-drift {
  to {
    transform: rotate(360deg) scale(1.6);
  }
}
@keyframes glass-sweep {
  0% {
    transform: translate3d(-26%, -26%, 0);
  }
  100% {
    transform: translate3d(26%, 26%, 0);
  }
}
@keyframes glass-shard-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.9;
  }
}
@keyframes glass-twinkle {
  0%,
  70%,
  100% {
    opacity: 0;
    transform: scale(0.4) rotate(0deg);
  }
  82% {
    opacity: 1;
    transform: scale(1) rotate(45deg);
  }
}

/* Speed scaling driven by existing speedClass */
.speed-slow .glass-prism {
  animation-duration: 28s;
}
.speed-slow .glass-sheen {
  animation-duration: 10s;
}
.speed-normal .glass-prism {
  animation-duration: 18s;
}
.speed-normal .glass-sheen {
  animation-duration: 7s;
}
.speed-fast .glass-prism {
  animation-duration: 9s;
}
.speed-fast .glass-sheen {
  animation-duration: 3.5s;
}
.speed-fast .glass-shards {
  animation-duration: 2.5s;
}

@media (prefers-reduced-motion: reduce) {
  .glass-prism,
  .glass-sheen,
  .glass-shards,
  .glass-glint {
    animation: none;
  }
  .glass-shards {
    opacity: 0.7;
  }
}

/* ─── CRUMPLED PAPER ──────────────────────────────────────────────── */
/* cover so the crease pattern fills the card at any size. */
.crumple-shadows,
.crumple-highlights {
  background-size: cover;
  background-position: center;
  /* The source photo is a cold blue-gray. Multiplying that onto the warm cream
     themes tinted every crease toward concrete and dragged the whole card
     grayish. Sepia rebuilds the same luminance ramp in warm browns first, so
     what lands on the card is a paper-colored crease, not a gray one. */
  filter: sepia(0.55) saturate(1.15) brightness(1.04);
}

/* Multiply drops the paper's own crease shadows onto the card colour. Kept
   light so the theme background stays dominant — creases whisper, not shout. */
.crumple-shadows {
  mix-blend-mode: multiply;
  /* Was 0.18. On the light `classic` theme the crease shadows landed close to
     the body-text colour and text sat directly on top of them, so glyph edges
     fought the creases. Dropping the darkest pass is what buys back contrast —
     the highlight pass below still carries the fold geometry. */
  opacity: 0.1;
}

/* Soft-light re-uses the same photo to pop the lit ridges back out, so folds
   have both a dark and a bright side without tinting the card grey. */
.crumple-highlights {
  mix-blend-mode: soft-light;
  /* Soft-light barely shifts luminance where text sits, so it can carry more of
     the effect than the multiply pass — nudged up to keep the folds legible as
     folds now that the shadow pass is lighter. */
  opacity: 0.42;
}

/* A slow, faint glare travelling over the sheet — a subtle catch of light on
   the ridges, not a spotlight. */
.crumple-sheen {
  background: linear-gradient(
    115deg,
    transparent 44%,
    rgba(255, 255, 255, 0.14) 50%,
    transparent 56%
  );
  mix-blend-mode: overlay;
  animation-name: shimmer;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}

/* Barely press the corners so the note settles into the card. */
.crumple-vignette {
  background: radial-gradient(
    120% 120% at 50% 45%,
    transparent 62%,
    rgba(0, 0, 0, 0.055) 100%
  );
  mix-blend-mode: multiply;
}

@media (prefers-reduced-motion: reduce) {
  .crumple-sheen {
    animation: none;
    opacity: 0;
  }
}

</style>