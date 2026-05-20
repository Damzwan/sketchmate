<template>
  <div
    v-if="def && def.kind !== 'none'"
    class="absolute inset-0 overflow-hidden pointer-events-none rounded-[3rem]"
    aria-hidden="true"
  >
    <!-- Paper grain -->
    <div
      v-if="def.kind === 'grain'"
      class="absolute inset-0 grain-bg"
      :style="{ opacity: preview ? 0.7 : 0.5 }"
    ></div>

    <!-- Diagonal shimmer sweep -->
    <div
      v-else-if="def.kind === 'shimmer'"
      class="absolute -inset-[100%] shimmer-sweep"
      :class="speedClass"
      :style="shimmerStyle"
    ></div>

    <!-- Starfield -->
    <div v-else-if="def.kind === 'starfield'" class="absolute inset-0">
      <span
        v-for="(s, i) in stars"
        :key="i"
        class="absolute rounded-full bg-white twinkle"
        :style="{
          left: s.left + '%',
          top: s.top + '%',
          width: s.size + 'px',
          height: s.size + 'px',
          animationDelay: preview ? '0s' : s.delay + 's',
          animationDuration: s.duration + 's',
          boxShadow: `0 0 ${s.size * 2}px white`
        }"
      ></span>
    </div>

    <!-- Falling emoji -->
    <div v-else-if="def.kind === 'falling'" class="absolute inset-0">
      <span
        v-for="(p, i) in particles"
        :key="i"
        class="absolute fall-anim select-none"
        :style="{
          left: p.left + '%',
          top: '-10%',
          animationDelay: preview ? (p.delay / 4) + 's' : p.delay + 's',
          animationDuration: (preview ? p.duration * 0.5 : p.duration) + 's',
          fontSize: p.size + 'px'
        }"
      >
        {{ def.emoji }}
      </span>
    </div>

    <!-- Floating particles -->
    <div v-else-if="def.kind === 'particles'" class="absolute inset-0">
      <span
        v-for="(p, i) in particles"
        :key="i"
        class="absolute float-anim select-none"
        :style="{
          left: p.left + '%',
          bottom: '-10%',
          animationDelay: preview ? (p.delay / 4) + 's' : p.delay + 's',
          animationDuration: (preview ? p.duration * 0.5 : p.duration) + 's',
          fontSize: p.size + 'px'
        }"
      >
        {{ def.emoji }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	resolveEffect,
	type ProfileEffectDef,
} from "@/config/profile_options.config";

const props = withDefaults(
	defineProps<{
		effectId?: string;
		def?: ProfileEffectDef;
		/** Preview mode shortens delays and speeds animations so the effect is
		 *  immediately visible in small modal tiles. */
		preview?: boolean;
	}>(),
	{ preview: false },
);

const def = computed<ProfileEffectDef>(
	() => props.def || resolveEffect(props.effectId),
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

const seededRandom = (seed: string) => {
	let s = 0;
	for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
	return () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};
};

const particles = computed(() => {
	const count = def.value.density || 8;
	const rand = seededRandom(def.value.id);
	const baseDur =
		def.value.speed === "fast" ? 5 : def.value.speed === "slow" ? 14 : 9;

	// Dragons get bigger sizes so the emoji reads at distance
	const isDragon = def.value.emoji === "🐉";
	const sizeMin = isDragon ? 32 : 14;
	const sizeRange = isDragon ? 16 : 12;

	return Array.from({ length: count }, () => ({
		left: rand() * 100,
		delay: rand() * baseDur,
		duration: baseDur + rand() * 4,
		size: sizeMin + Math.floor(rand() * sizeRange),
	}));
});

const stars = computed(() => {
	const count = def.value.density || 18;
	const rand = seededRandom(def.value.id);
	return Array.from({ length: count }, () => ({
		left: rand() * 100,
		top: rand() * 100,
		delay: rand() * 3,
		duration: 2 + rand() * 3,
		// Larger range (1.5–4px) so stars actually read; the old 1px dots vanished
		size: 1.5 + rand() * 2.5,
	}));
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
/* Paper grain — bumped alpha matrix from 0.3 to 0.55 so the texture is
   actually visible against warm card backgrounds */
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

@keyframes shimmer {
  0%   { transform: translateX(-50%) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateX(50%) rotate(0deg); opacity: 0; }
}
.shimmer-sweep {
  animation-name: shimmer;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
.speed-slow   { animation-duration: 6s; }
.speed-normal { animation-duration: 4s; }
.speed-fast   { animation-duration: 2s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50%      { opacity: 1;   transform: scale(1.3); }
}
.twinkle {
  animation-name: twinkle;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
}

@keyframes fall {
  0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(120vh) translateX(40px) rotate(360deg); opacity: 0; }
}
.fall-anim {
  animation-name: fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

@keyframes float-up {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  10%  { opacity: 1; }
  50%  { transform: translateY(-50vh) translateX(20px); }
  90%  { opacity: 1; }
  100% { transform: translateY(-110vh) translateX(-20px); opacity: 0; }
}
.float-anim {
  animation-name: float-up;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
</style>