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

</style>