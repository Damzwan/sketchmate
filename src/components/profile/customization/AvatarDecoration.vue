<template>
  <div class="absolute inset-0 pointer-events-none" v-if="def && def.kind !== 'none'">

    <div
      v-if="def.kind === 'lottie' && def.lottieId"
      class="absolute top-1/2 left-1/2 pointer-events-none z-10 flex items-center justify-center"
      :style="{
        width: def.lottieConfig?.scale || '100%',
        height: def.lottieConfig?.scale || '100%',
        transform: def.lottieConfig?.offset || 'translate(-50%, -50%)'
      }"
    >
      <DotLottieVue
        :src="getLottieSrc(def.lottieId)"
        :autoplay="!static"
        :loop="!static"
        :renderConfig="{ preserveAspectRatio: 'xMidYMid slice' }"
        class="w-full h-full lottie-strict-bounds"
      />
    </div>

    <!-- Halo glow -->
    <div
      v-if="def.haloColor"
      class="absolute inset-0 rounded-full"
      :class="{ 'animate-halo-pulse': !static }"
      :style="{
        boxShadow: `0 0 24px 4px ${def.haloColor}, 0 0 48px 8px ${def.haloColor}55`,
      }"
    ></div>

    <!-- SVG frame -->
    <svg
      v-if="def.frameStroke"
      class="absolute -inset-1 w-[calc(100%+0.5rem)] h-[calc(100%+0.5rem)]"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs v-if="def.gradient">
        <linearGradient :id="def.gradient.id" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop v-for="(s, i) in def.gradient.stops" :key="i" :offset="s.offset" :stop-color="s.color" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        :stroke="def.frameStroke"
        stroke-width="3"
        stroke-linejoin="round"
        :class="{ 'animate-frame-shimmer': !static }"
      />
    </svg>

    <!-- Orbiting particles -->
    <div
      v-if="def.particles"
      class="absolute inset-0"
      :class="{ 'animate-spin-slow': def.particles.spin && !static }"
    >
      <span v-for="i in def.particles.count" :key="i" class="absolute text-base drop-shadow-md" :style="orbitStyle(i - 1, def.particles.count)">
        {{ def.particles.emoji }}
      </span>
    </div>

    <!-- Corner badge -->
    <div v-if="def.badge" class="absolute text-2xl drop-shadow-md z-10" :class="badgePositionClass(def.badge.position)">
      {{ def.badge.emoji }}
    </div>

    <!-- Topper -->
    <div v-if="def.kind === 'topper' && def.topper === 'cat-ears'" class="absolute -top-4 left-1/2 -translate-x-1/2 w-[110%] pointer-events-none">
      <svg viewBox="0 0 100 40" class="w-full h-auto drop-shadow-md" aria-hidden="true">
        <path d="M 18 38 L 28 6 L 42 32 Z" fill="#2d1810" stroke="#1a0e08" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M 24 32 L 29 14 L 36 28 Z" fill="#f9a8d4" />
        <path d="M 58 32 L 72 6 L 82 38 Z" fill="#2d1810" stroke="#1a0e08" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M 64 28 L 71 14 L 76 32 Z" fill="#f9a8d4" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	type Decoration,
	resolveDecoration,
} from "@/config/profile_options.config";

import { DotLottieVue } from "@lottiefiles/dotlottie-vue";
import gamerLottie from "@/assets/lottie/avatar/gamer.lottie";
import waveLottie from "@/assets/lottie/avatar/wave.lottie";

const props = defineProps<{
	decorationId?: string;
	def?: Decoration;
	static?: boolean; // <-- NEW PROP
}>();

const def = computed<Decoration>(
	() => props.def || resolveDecoration(props.decorationId),
);

const getLottieSrc = (id: string) => {
	switch (id) {
		case "gamer":
			return gamerLottie;
		case "wave":
			return waveLottie;
		default:
			return "";
	}
};

const orbitStyle = (i: number, total: number) => {
	const angle = (i / total) * 2 * Math.PI;
	const r = 52;
	const x = 50 + r * Math.cos(angle);
	const y = 50 + r * Math.sin(angle);
	return {
		left: `${x}%`,
		top: `${y}%`,
		transform: "translate(-50%, -50%)",
	};
};

const badgePositionClass = (pos: "tl" | "tr" | "bl" | "br") =>
	({
		tl: "-top-2 -left-2",
		tr: "-top-2 -right-2",
		bl: "-bottom-2 -left-2",
		br: "-bottom-2 -right-2",
	})[pos];
</script>

<style scoped>
/* Keep existing animations untouched */
@keyframes halo-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

@keyframes frame-shimmer {
  0%, 100% { opacity: 0.9; }
  50% { opacity: 1; }
}

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-halo-pulse {
  animation: halo-pulse 2.5s ease-in-out infinite;
}

.animate-frame-shimmer {
  animation: frame-shimmer 3s ease-in-out infinite;
}

.animate-spin-slow {
  animation: spin-slow 18s linear infinite;
}

.lottie-strict-bounds :deep(canvas),
.lottie-strict-bounds :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block;
}
</style>