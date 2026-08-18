<template>
  <!-- Three passes of the same paper photo: a multiply layer bakes the crease
       shadows onto the card, an overlay layer lifts the ridges, and a slow
       light sweep makes the folds catch the light as it moves. -->
  <div class="absolute inset-0">
    <div class="absolute inset-0 crumple-shadows" :style="paperImage"></div>
    <div class="absolute inset-0 crumple-highlights" :style="paperImage"></div>
    <div class="absolute -inset-[100%] crumple-sheen" :class="speedClass"></div>
    <!-- Deepen the four corners so the sheet reads as pressed flat onto the card -->
    <div class="absolute inset-0 crumple-vignette"></div>
  </div>
</template>

<script setup lang="ts">
import paper from "@/assets/textures/paper2.webp";

defineProps<{ speedClass: string }>();

const paperImage = { backgroundImage: `url(${paper})` };
</script>

<style scoped>
.crumple-shadows,
.crumple-highlights {
  background-size: cover;
  background-position: center;
  /* Push the contrast aggressively so the lighter image creates distinct shadows/ridges */
  filter: contrast(1.6) saturate(1.1) brightness(0.92);
}

.crumple-shadows {
  mix-blend-mode: multiply;
  /* Cranked up to cast a proper shadow over the theme */
  opacity: 0.2;
}

.crumple-highlights {
  /* Overlay usually punches through saturated background colors better than soft-light */
  mix-blend-mode: overlay;
  /* High enough to catch the light on the peaks of the crumples */
  opacity: 0.1;
}

@keyframes crumple-shimmer {
  0% { transform: translateX(-50%) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateX(50%) rotate(0deg); opacity: 0; }
}

.crumple-sheen {
  background: linear-gradient(
    115deg,
    transparent 44%,
    rgba(255, 255, 255, 0.14) 50%,
    transparent 56%
  );
  mix-blend-mode: overlay;
  animation-name: crumple-shimmer;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}

.speed-slow { animation-duration: 6s; }
.speed-normal { animation-duration: 4s; }
.speed-fast { animation-duration: 2s; }

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
