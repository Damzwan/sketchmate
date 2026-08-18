<template>
  <div class="absolute inset-0 gratitude-frame" :style="{ '--world-accent': accent }">
    <div class="gratitude">
      <div
        class="absolute right-[5%] top-8/12 w-[25%] -translate-y-1/2 aspect-square gratitude-logo animate-logo-bob"
        :style="{ '-webkit-mask-image': `url(${logo})`, 'mask-image': `url(${logo})` }"
      ></div>

      <span
        v-for="heart in hearts"
        :key="heart.id"
        class="absolute gratitude-heart animate-heart-float"
        :style="{
          left: heart.left,
          bottom: heart.bottom,
          fontSize: heart.size,
          animationDelay: heart.delay,
          animationDuration: heart.duration,
          '--target-opacity': heart.opacity,
        }"
      >♥</span>

      <div
        class="absolute left-[4%] top-[65%] -translate-y-1/2 w-[54%] gratitude-text"
        :style="{ fontFamily: font }"
      >
        <p class="gratitude-thanks">OG User</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import logo from "@/assets/logo.webp";
import { seededRandom } from "./world_layout";
import { useWorldStage } from "./world_stage";

withDefaults(defineProps<{ accent?: string; font?: string }>(), {
	accent: "#7c5cff",
});

const { cap } = useWorldStage();

const HEARTS = Array.from({ length: 9 }, (_, i) => ({
	id: `gh${i}`,
	left: `${8 + seededRandom(i * 31) * 78}%`,
	bottom: `${seededRandom(i * 17) * 70}%`,
	size: `${Math.floor(seededRandom(i * 23) * 12) + 12}px`,
	delay: `-${seededRandom(i * 7) * 9}s`,
	duration: `${Math.floor(seededRandom(i * 5) * 6) + 9}s`,
	opacity: seededRandom(i * 11) * 0.35 + 0.2,
}));

const hearts = computed(() => cap(HEARTS, 4));
</script>

<style scoped>
.gratitude-frame { overflow: hidden; }

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

.gratitude-logo {
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--world-accent, #7c5cff) 78%, #fff) 0%,
    var(--world-accent, #7c5cff) 55%,
    color-mix(in srgb, var(--world-accent, #7c5cff) 70%, #000) 100%
  );
  opacity: 0.9;
  filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent));
}

.gratitude-heart {
  color: var(--world-accent, #7c5cff);
  line-height: 1;
  opacity: 0;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 45%, transparent);
  will-change: transform, opacity;
}

.gratitude-text {
  color: var(--world-accent, #7c5cff);
  text-align: left;
  text-shadow: 0 1px 6px color-mix(in srgb, var(--world-accent, #7c5cff) 40%, transparent);
  overflow-wrap: break-word;
  hyphens: auto;
}
.gratitude-thanks {
  font-size: clamp(0.95rem, 8.4cqw, 1.4rem);
  font-weight: 900;
  line-height: 1.02;
  letter-spacing: 0.01em;
}

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
