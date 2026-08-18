<template>
  <div class="absolute inset-0 glass" :class="speedClass">
    <!-- Prismatic refraction drifting beneath the cracks (composited rotation) -->
    <div class="absolute inset-0 glass-prism"></div>

    <!-- Specular sheen: oversized pre-painted gradient SWEPT BY TRANSFORM.
         The old version animated background-position, which repaints the full
         card layer every frame — a transform sweep is pure compositor work. -->
    <div class="absolute -inset-[60%] glass-sheen"></div>

    <!-- Static fracture mesh: strokes + impact cracks, painted exactly once.
         No filter, no animation — this layer never invalidates. -->
    <svg class="absolute inset-0 w-full h-full glass-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient :id="facetGradientId" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55" />
          <stop offset="45%" stop-color="#ffffff" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g stroke="rgba(255,255,255,0.45)" stroke-width="0.4" fill="none" stroke-linejoin="round">
        <polygon v-for="pts in OUTLINE_POLYGONS" :key="pts" :points="pts" />
      </g>
      <g stroke="rgba(255,255,255,0.6)" stroke-width="0.25" fill="none" stroke-linecap="round">
        <path d="M60,32 L72,0 M60,32 L100,40 M60,32 L100,100 M60,32 L30,100 M60,32 L0,66 M60,32 L0,24 M60,32 L28,0" />
      </g>
    </svg>

    <!-- Shard fills, split into three groups. Each group animates WHOLE-SVG
         opacity (compositor-driven, no SVG-internal repaint) with staggered
         delays, so light still ripples across the break — the old version
         animated every polygon individually, re-rasterising the entire SVG
         (plus its drop-shadow filter) every single frame. -->
    <svg
      v-for="(group, index) in FACET_GROUPS"
      :key="index"
      class="absolute inset-0 w-full h-full glass-shards"
      :class="`glass-shards--${index}`"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <g :fill="`url(#${facetGradientId})`" stroke="none">
        <polygon v-for="pts in group" :key="pts" :points="pts" />
      </g>
    </svg>

    <!-- Twinkling glints at impact vertices -->
    <span class="glass-glint" style="left: 60%; top: 32%"></span>
    <span class="glass-glint glass-glint--b" style="left: 30%; top: 18%"></span>
    <span class="glass-glint glass-glint--c" style="left: 78%; top: 58%"></span>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";

defineProps<{ speedClass: string }>();

/** Every shard, in order around the impact point at 60,32. */
const FACET_POLYGONS = [
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

/** The subset that gets a visible outline in the static fracture mesh. */
const OUTLINE_POLYGONS = [
	"60,32 72,0 100,0",
	"60,32 100,40 100,78",
	"60,32 100,100 70,100",
	"60,32 30,100 0,100",
	"60,32 0,66 0,24",
	"60,32 0,0 28,0",
];

/** Interleaved so each pulse group lights shards spread across the break. */
const FACET_GROUPS = [0, 1, 2].map((group) =>
	FACET_POLYGONS.filter((_, i) => i % 3 === group),
);

// Instance-unique: several cards can show the glass effect at once, and a
// duplicated SVG gradient id makes every one of them resolve to the first.
const facetGradientId = `glassFacet-${useId()}`;
</script>

<style scoped>
.glass {
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
}

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
  will-change: transform;
}

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

.glass-lines { mix-blend-mode: overlay; }

.glass-shards {
  mix-blend-mode: overlay;
  animation: glass-shard-pulse 5s ease-in-out infinite;
  will-change: opacity;
}
.glass-shards--1 { animation-delay: -1.66s; }
.glass-shards--2 { animation-delay: -3.33s; }

.glass-glint {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 60%);
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.9));
  opacity: 0;
  animation: glass-twinkle 4s ease-in-out infinite;
}
.glass-glint::before,
.glass-glint::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 46%, rgba(255, 255, 255, 0.95) 50%, transparent 54%);
}
.glass-glint::after { transform: rotate(90deg); }
.glass-glint--b { animation-delay: -1.5s; }
.glass-glint--c { animation-delay: -2.8s; }

@keyframes glass-drift { to { transform: rotate(360deg) scale(1.6); } }
@keyframes glass-sweep { 0% { transform: translate3d(-26%, -26%, 0); } 100% { transform: translate3d(26%, 26%, 0); } }
@keyframes glass-shard-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
@keyframes glass-twinkle { 0%, 70%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); } 82% { opacity: 1; transform: scale(1) rotate(45deg); } }

.speed-slow .glass-prism { animation-duration: 28s; }
.speed-slow .glass-sheen { animation-duration: 10s; }
.speed-normal .glass-prism { animation-duration: 18s; }
.speed-normal .glass-sheen { animation-duration: 7s; }
.speed-fast .glass-prism { animation-duration: 9s; }
.speed-fast .glass-sheen { animation-duration: 3.5s; }
.speed-fast .glass-shards { animation-duration: 2.5s; }

/* Weak GPUs and the Android WebView compositor: blend groups near
   self-repainting content re-rasterise the whole card, so trade the blends and
   the per-frame shard pulse for tuned plain alpha. */
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
html.android-wv .glass-sheen { opacity: 0.55; }
html.android-wv .glass-prism { filter: blur(8px) saturate(1.2); opacity: 0.4; }
html.low-end .glass-prism { filter: blur(6px) saturate(1.2); }

html.android-wv .glass-shards,
html.low-end .glass-shards {
  animation: none;
  will-change: auto;
}
html.android-wv .glass-shards { opacity: 0.6; }
html.low-end .glass-shards { opacity: 0.55; }

html.android-wv .glass-glint,
html.low-end .glass-glint { display: none; }

@media (prefers-reduced-motion: reduce) {
  .glass-prism, .glass-sheen, .glass-shards, .glass-glint { animation: none; }
  .glass-shards { opacity: 0.7; }
}
</style>
