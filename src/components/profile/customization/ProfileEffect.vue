<template>
  <div
    v-if="def && def.kind !== 'none'"
    class="absolute inset-0 overflow-hidden pointer-events-none rounded-[2.5rem]"
    aria-hidden="true"
  >
    <div
      v-if="def.kind === 'grain'"
      class="absolute inset-0 grain-bg"
      :style="{ opacity: preview ? 0.7 : 0.5 }"
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
      <!-- Prismatic refraction drifting beneath the cracks -->
      <div class="absolute inset-0 glass-prism"></div>

      <!-- Specular sheen sweeping across the surface -->
      <div class="absolute inset-0 glass-sheen"></div>

      <!-- Fracture mesh: shards catch the light independently -->
      <svg
        class="absolute inset-0 w-full h-full glass-facets"
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
          fill="url(#glassFacet)"
          stroke="rgba(255,255,255,0.45)"
          stroke-width="0.4"
          stroke-linejoin="round"
        >
          <polygon points="60,32 72,0 100,0" />
          <polygon points="60,32 100,0 100,40" />
          <polygon points="60,32 100,40 100,78" />
          <polygon points="60,32 100,78 100,100" />
          <polygon points="60,32 100,100 70,100" />
          <polygon points="60,32 70,100 30,100" />
          <polygon points="60,32 30,100 0,100" />
          <polygon points="60,32 0,100 0,66" />
          <polygon points="60,32 0,66 0,24" />
          <polygon points="60,32 0,24 0,0" />
          <polygon points="60,32 0,0 28,0" />
          <polygon points="60,32 28,0 72,0" />
        </g>
        <!-- Crisp impact-point highlight cracks -->
        <g
          stroke="rgba(255,255,255,0.6)"
          stroke-width="0.25"
          fill="none"
          stroke-linecap="round"
        >
          <path d="M60,32 L72,0 M60,32 L100,40 M60,32 L100,100 M60,32 L30,100 M60,32 L0,66 M60,32 L0,24 M60,32 L28,0" />
        </g>
      </svg>

      <!-- Twinkling glints at impact vertices -->
      <span class="glass-glint" style="left: 60%; top: 32%"></span>
      <span class="glass-glint glass-glint--b" style="left: 30%; top: 18%"></span>
      <span class="glass-glint glass-glint--c" style="left: 78%; top: 58%"></span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  resolveEffect,
  type ProfileEffectDef
} from '@/config/profile_options.config'

const props = withDefaults(
  defineProps<{
    effectId?: string;
    def?: ProfileEffectDef;
    /** Preview mode shortens delays and speeds animations */
    preview?: boolean;
  }>(),
  { preview: false }
)

const def = computed<ProfileEffectDef>(
  () => props.def || resolveEffect(props.effectId)
)

const speedClass = computed(() => {
  if (props.preview) return 'speed-fast'
  switch (def.value.speed) {
    case 'slow':
      return 'speed-slow'
    case 'fast':
      return 'speed-fast'
    default:
      return 'speed-normal'
  }
})

const shimmerStyle = computed(() => {
  if (def.value.color === 'rainbow') {
    return {
      background:
        'linear-gradient(115deg, transparent 30%, rgba(255,0,150,0.3) 40%, rgba(0,200,255,0.3) 50%, rgba(255,200,0,0.3) 60%, transparent 70%)'
    }
  }
  return {
    background: `linear-gradient(115deg, transparent 40%, ${def.value.color || 'rgba(255,255,255,0.4)'} 50%, transparent 60%)`
  }
})
</script>

<style scoped>
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
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
}

/* Specular sheen sweep — gives the surface a polished, moving glare */
.glass-sheen {
  background: linear-gradient(
    115deg,
    transparent 38%,
    rgba(255, 255, 255, 0.55) 49%,
    rgba(255, 255, 255, 0.15) 53%,
    transparent 64%
  );
  mix-blend-mode: overlay;
  background-size: 250% 250%;
  animation: glass-sweep 7s ease-in-out infinite;
}

/* Fracture mesh — overlay blend so the prism colors refract through */
.glass-facets {
  mix-blend-mode: overlay;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
}
.glass-facets polygon {
  transform-box: fill-box;
  transform-origin: center;
  animation: glass-facet-flick 5s ease-in-out infinite;
}
/* Stagger each shard so light ripples across the break */
.glass-facets polygon:nth-child(2n) {
  animation-delay: -1.3s;
}
.glass-facets polygon:nth-child(3n) {
  animation-delay: -2.6s;
}
.glass-facets polygon:nth-child(4n) {
  animation-delay: -3.9s;
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
    background-position: 0% 0%;
  }
  100% {
    background-position: 100% 100%;
  }
}
@keyframes glass-facet-flick {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.95;
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
.speed-fast .glass-facets polygon {
  animation-duration: 2.5s;
}

@media (prefers-reduced-motion: reduce) {
  .glass-prism,
  .glass-sheen,
  .glass-facets polygon,
  .glass-glint {
    animation: none;
  }
  .glass-facets polygon {
    opacity: 0.7;
  }
}

</style>