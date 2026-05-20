<template>
  <div class="absolute inset-0 pointer-events-none" v-if="def && def.kind !== 'none'">
    <!-- Halo glow -->
    <div
      v-if="def.haloColor"
      class="absolute inset-0 rounded-[2.5rem] animate-halo-pulse"
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
          <stop
            v-for="(s, i) in def.gradient.stops"
            :key="i"
            :offset="s.offset"
            :stop-color="s.color"
          />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        ry="22"
        fill="none"
        :stroke="def.frameStroke"
        stroke-width="3"
        stroke-linejoin="round"
        class="animate-frame-shimmer"
      />
    </svg>

    <!-- Orbiting particles -->
    <div
      v-if="def.particles"
      class="absolute inset-0"
      :class="{ 'animate-spin-slow': def.particles.spin }"
    >
      <span
        v-for="i in def.particles.count"
        :key="i"
        class="absolute text-base drop-shadow-md"
        :style="orbitStyle(i - 1, def.particles.count)"
      >
        {{ def.particles.emoji }}
      </span>
    </div>

    <!-- Corner badge -->
    <div
      v-if="def.badge"
      class="absolute text-2xl drop-shadow-md"
      :class="badgePositionClass(def.badge.position)"
    >
      {{ def.badge.emoji }}
    </div>

    <!-- Topper — positioned above the avatar, outside circular bounds -->
    <div
      v-if="def.kind === 'topper' && def.topper === 'cat-ears'"
      class="absolute -top-5 left-1/2 -translate-x-1/2 w-[110%] pointer-events-none"
    >
      <svg viewBox="0 0 100 40" class="w-full h-auto drop-shadow-md" aria-hidden="true">
        <!-- Left ear -->
        <path
          d="M 18 38 L 28 6 L 42 32 Z"
          fill="#2d1810"
          stroke="#1a0e08"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <!-- Left inner ear (pink) -->
        <path
          d="M 24 32 L 29 14 L 36 28 Z"
          fill="#f9a8d4"
        />

        <!-- Right ear -->
        <path
          d="M 58 32 L 72 6 L 82 38 Z"
          fill="#2d1810"
          stroke="#1a0e08"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <!-- Right inner ear (pink) -->
        <path
          d="M 64 28 L 71 14 L 76 32 Z"
          fill="#f9a8d4"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	resolveDecoration,
	type Decoration,
} from "@/config/profile_options.config";

const props = defineProps<{
	decorationId?: string;
	def?: Decoration;
}>();

const def = computed<Decoration>(
	() => props.def || resolveDecoration(props.decorationId),
);

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
</style>