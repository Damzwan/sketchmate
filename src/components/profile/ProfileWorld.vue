<template>
  <div
    v-if="def.kind !== 'none'"
    ref="root"
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="[
      radiusClass,
      {
        'world-preview': preview,
        'world-static': staticMode,
        'world-mini': mini,
        'world-banner': banner,
        'world-feature': feature,
        'world-paused': paused && !staticMode,
      },
    ]"
    :style="preview ? { '--world-scale': previewScale } : undefined"
    style="isolation: isolate;"
    aria-hidden="true"
  >
    <!-- Latched mount: once the card has been on-screen we KEEP the scene in the
         DOM (we merely play/pause the players) so scrolling back to a card never
         re-mounts and pops-in → no flicker. -->
    <template v-if="hasMounted">
      <WorldOcean v-if="def.kind === 'ocean'" />
      <WorldCat v-else-if="def.kind === 'cat'" />
      <WorldAutumn v-else-if="def.kind === 'autumn'" />
      <WorldDragon v-else-if="def.kind === 'dragon'" />
      <WorldSpace v-else-if="def.kind === 'space'" :accent="accent" :dark="dark" :feature="feature" />
      <WorldGratitude v-else-if="def.kind === 'gratitude'" :accent="accent" :font="font" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide } from "vue";
import {
	AMBIENT_MARGIN,
	useAmbientVisibility,
} from "@/composables/general/useAmbientVisibility";
import { resolveWorld, type WorldDef } from "@/config/profile_options.config";
import { IS_SEVERELY_CONSTRAINED_DEVICE } from "@/draw/config/renderQuality.config";
import WorldAutumn from "./world/WorldAutumn.vue";
import WorldCat from "./world/WorldCat.vue";
import WorldDragon from "./world/WorldDragon.vue";
import WorldGratitude from "./world/WorldGratitude.vue";
import WorldOcean from "./world/WorldOcean.vue";
import WorldSpace from "./world/WorldSpace.vue";
import { isLowEndDevice, warmSprites } from "./world/world_sprites";
import { WORLD_STAGE } from "./world/world_stage";

/**
 * Shell for the ambient background scenes. It owns everything the individual
 * worlds share — viewport gating, run state, sizing variants — and hands each
 * scene a stage to mount its sprites on (see `world_stage.ts`).
 */
const props = withDefaults(
	defineProps<{
		worldId?: string;
		def?: WorldDef;
		preview?: boolean;
		previewScale?: number;
		accent?: string;
		font?: string;
		/**
		 * Is the surface under the world a DARK one? Scenes tint themselves to the
		 * theme rather than imposing their own luminance — pass the equipped
		 * theme's `isDark` wherever one is known.
		 */
		dark?: boolean;
		staticMode?: boolean;
		radiusClass?: string;
		mini?: boolean;
		/** Feed-post header variant. `mini` is tuned for a chat-list ROW — it hard
		    clips against a short box and anchors hard right, which in a post header
		    collides with the artist signature and cuts the scene off mid-sprite.
		    `banner` instead dissolves the scene into the card on every edge and
		    sits low-right, clear of the signature. */
		banner?: boolean;
		/** Full-card editorial treatment used by artist highlights. Unlike a
		    picker preview it fills the surface, while still reducing sprite count. */
		feature?: boolean;
		/** Gate scene creation tightly to the viewport instead of the giant hero
		    margin. Set on LIST instances (feed cards, chat toolbar) so only worlds
		    near the viewport ever spin up lottie workers — a 20-item feed must not
		    instantiate 20×N players up front. */
		contained?: boolean;
	}>(),
	{
		preview: false,
		previewScale: 0.5,
		accent: "#7c5cff",
		dark: false,
		staticMode: false,
		radiusClass: "rounded-[2.5rem]",
		mini: false,
		banner: false,
		feature: false,
		contained: false,
	},
);

const def = computed<WorldDef>(() => props.def || resolveWorld(props.worldId));

// Static worlds (feed/toolbar minis) AND low-end phones show a single frozen
// lottie frame — the player renders one frame then holds it, so there's zero
// ongoing decode. The CSS travel animations still glide the sprites via cheap
// GPU transforms, so the scene reads as alive without any per-frame wasm cost.
const freezeFrame = computed(() => props.staticMode || isLowEndDevice());

// Fewer sprites means fewer concurrent lottie decoders — the single biggest
// main-thread cost on weak GPUs, and pointless detail in a small preview tile.
const reduced = computed(
	() => props.preview || props.feature || isLowEndDevice(),
);

const { root, hasMounted, paused } = useAmbientVisibility({
	// preview: shop/picker grids mount dozens of tiles. contained: feed/list
	// instances. Otherwise this is the one hero card, kept warm far ahead.
	rootMargin:
		props.preview || props.contained
			? AMBIENT_MARGIN.nearby
			: AMBIENT_MARGIN.hero,
	frozen: freezeFrame,
});

provide(WORLD_STAGE, {
	paused,
	freezeFrame,
	reduced,
	disableSprites: computed(() => IS_SEVERELY_CONSTRAINED_DEVICE),
	staticMode: computed(() => props.staticMode),
});

// List surfaces load only the sprites their visible scene actually needs.
// Warming every world type from a single feed card creates a burst of decoding
// precisely while the feed is settling; reserve that eager work for the one
// full profile/customization hero.
onMounted(() => {
	if (!props.contained) warmSprites();
});
</script>

<style scoped>
.world-preview {
  inset: auto;
  top: 50%;
  left: 50%;
  width: 320px;
  height: 280px;
  transform: translate(-50%, -50%) scale(var(--world-scale, 0.5));
  transform-origin: center;
}

/* Editorial cards need atmosphere across the whole surface. Reusing the fixed
   320×280 picker preview made tall cards look like a tiny diorama floating in
   the middle, especially for Space. */
.world-feature {
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Feed-post header. Two things made the mini variant read as an afterthought
   here: the scene ended on a hard edge where the header box clipped it, and it
   was anchored at the same right-centre point the signature occupies.

   The radial mask dissolves the scene on EVERY edge instead of clipping it, so
   there is no cut line to notice; anchoring bottom-right and pushing it down
   past the baseline keeps it under the description rather than behind the
   signature. Lower opacity puts it firmly behind the text. */
.world-banner {
  /* Centre-anchored like .world-preview, NOT bottom-anchored with a downward
     translate — that scaled about a point below the header, which put the whole
     sprite band under the clip line and made the world render as nothing. */
  inset: auto;
  top: 50%;
  right: 0;
  left: auto;
  width: 320px;
  height: 280px;
  transform: translateY(-50%) scale(0.46);
  transform-origin: right center;
  opacity: 0.85;

  /* Two masks intersected: fade out to the LEFT so the artist's name always sits
     on clean card, and soften top/bottom so the scene dissolves into the header
     instead of ending on the clip edge. */
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 20%, #000 80%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 20%, #000 80%, transparent 100%);
  mask-composite: intersect;
}

.world-mini {
  inset: auto;
  top: 50%;
  /* Flush to the card edge, not inset 6%. The left-fade gradient is what ends
     the scene, so an inset left a strip of bare card to the RIGHT of the world
     — the gradient resolved into card instead of running off the edge. */
  right: 0;
  left: auto;
  width: 320px;
  height: 280px;
  /* The 280px stage has to fit a ~76px list row. At the old 0.52 the lowest
     sprite was only ~54% visible (measured) — that half-cut sprite is what made
     space/dragon look broken here. 0.34 puts every sprite fully inside at both
     76px and 88px row heights. Smaller sprites, but whole ones. */
  transform: translateY(-50%) scale(0.34);
  transform-origin: right center;
  opacity: 0.72;
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 48%),
    linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
  mask-composite: intersect;
}

/* Frozen scenes reset to fixed positions and drop their compositor layers —
   a feed of static minis was promoting every travelling sprite for motion that
   never happens. */
.world-static :deep([class*="animate-"]) {
  animation: none !important;
  will-change: auto !important;
}
.world-static :deep(.animate-astronaut-wander) { top: 40%; left: 22%; }
.world-static :deep(.animate-rocket-fly) { top: 46%; left: 56%; }

/* Off-screen / behind the photoswiper: FREEZE the CSS travel animations where
   they are (unlike world-static, which resets to fixed positions). Pairs with
   the DotLottie player pause + rAF stop so sprites are fully frozen — no drift
   while hidden, and they resume from the same spot with no jump. */
.world-paused :deep([class*="animate-"]) {
  animation-play-state: paused !important;
  will-change: auto !important;
}
</style>
