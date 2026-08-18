<template>
  <div
    v-if="def.kind !== 'none'"
    ref="root"
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="[radiusClass, { 'fx-frozen': paused, 'fx-static': staticEffect }]"
    :style="{
      isolation: 'isolate',
      visibility: !onScreen && hasMounted ? 'hidden' : 'visible',
      background: previewBackground,
    }"
    aria-hidden="true"
  >
    <template v-if="hasMounted">
      <EffectGrain v-if="def.kind === 'grain'" :opacity="preview ? 0.8 : 0.6" />
      <EffectShimmer v-else-if="def.kind === 'shimmer'" :speed-class="speedClass" :color="def.color" />
      <EffectGlass v-else-if="def.kind === 'glass'" :speed-class="speedClass" />
      <EffectCrumpled v-else-if="def.kind === 'crumpled'" :speed-class="speedClass" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	AMBIENT_MARGIN,
	useAmbientVisibility,
} from "@/composables/general/useAmbientVisibility";
import {
	type ProfileEffectDef,
	resolveEffect,
} from "@/config/profile_options.config";
import EffectCrumpled from "./effects/EffectCrumpled.vue";
import EffectGlass from "./effects/EffectGlass.vue";
import EffectGrain from "./effects/EffectGrain.vue";
import EffectShimmer from "./effects/EffectShimmer.vue";

/**
 * Shell for the ambient effect sheets. Owns viewport gating, run state and the
 * shared speed vocabulary; each effect owns its own paint.
 */
const props = withDefaults(
	defineProps<{
		effectId?: string;
		def?: ProfileEffectDef;
		preview?: boolean;
		radiusClass?: string;
		staticEffect?: boolean;
		/** Gate to the viewport instead of the hero margin — see ProfileWorld. */
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

const { root, onScreen, hasMounted, paused } = useAmbientVisibility({
	rootMargin:
		props.preview || props.contained
			? AMBIENT_MARGIN.nearby
			: AMBIENT_MARGIN.hero,
	frozen: () => props.staticEffect,
});

// Small tiles get the fast sweep whatever the item's own speed: at preview size
// a 6s pass mostly shows an empty card.
const speedClass = computed(() => {
	if (props.preview) return "speed-fast";
	if (def.value.speed === "slow") return "speed-slow";
	if (def.value.speed === "fast") return "speed-fast";
	return "speed-normal";
});

// A moving prism sweep is nearly transparent between passes. In small shop and
// prize previews that looked like the effect had failed to load, so preview
// surfaces keep a quiet rainbow base underneath the live sweep.
const previewBackground = computed(() =>
	props.preview && def.value.kind === "shimmer" && def.value.color === "rainbow"
		? "linear-gradient(135deg, rgba(255,0,150,.28), rgba(0,200,255,.30), rgba(255,200,0,.28))"
		: undefined,
);
</script>

<style scoped>
/* Off-screen or behind an overlay: hold every sheet where it is and release its
   compositor layers. */
.fx-frozen :deep(*),
.fx-frozen :deep(*)::before,
.fx-frozen :deep(*)::after {
  animation-play-state: paused !important;
  will-change: auto !important;
}

/* A paused animation is often paused at an invisible first keyframe. Static
   editorial cards instead show a representative frame with no compositor
   animation or per-frame repaint. */
.fx-static :deep(.shimmer-sweep),
.fx-static :deep(.crumple-sheen) {
  animation: none !important;
  transform: translateX(0) !important;
  opacity: 0.42 !important;
}

.fx-static :deep(.glass-prism),
.fx-static :deep(.glass-sheen),
.fx-static :deep(.glass-shards),
.fx-static :deep(.glass-glint) {
  animation: none !important;
  will-change: auto !important;
}

.fx-static :deep(.glass-shards) { opacity: 0.6; }
.fx-static :deep(.glass-glint) { opacity: 0.45; }
</style>
