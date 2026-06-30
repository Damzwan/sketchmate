<template>
  <div class="absolute inset-0 pointer-events-none" v-if="def && def.kind !== 'none'">

    <!-- Lottie decoration -->
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
  static?: boolean;
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
</script>

<style scoped>
@keyframes halo-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.animate-halo-pulse {
  animation: halo-pulse 2.5s ease-in-out infinite;
}

.lottie-strict-bounds :deep(canvas),
.lottie-strict-bounds :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block;
}
</style>