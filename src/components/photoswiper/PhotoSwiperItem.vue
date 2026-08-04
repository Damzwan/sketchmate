<template>
  <!-- Explicit target makes Swiper scale the whole artwork stack. Without this
       it picks the first descendant <img>; the retained thumbnail then pans
       independently and pinch looks like a positional shift instead of zoom. -->
  <div class="swiper-zoom-target relative w-full h-full">
    <!-- Swapped, NOT cross-faded. Both layers are the same artwork, and drawings
         carry alpha over the viewer's black background, so mid-fade the two
         stacked copies composite to `1-(1-a)²` — denser than either one alone.
         That density bump, not the resolution change, is the visible flicker.
         An instant swap of an already-decoded higher-res copy of the same
         picture has nothing to animate. -->
    <img
      :src="props.thumbnail"
      :alt="`Drawing ${props.thumbnail}`"
      class="object-contain absolute w-full h-full z-20"
      :class="fullImageVisible ? 'opacity-0' : 'opacity-100'"
      decoding="async"
    />

    <!-- Real image -->
    <img
      v-if="shouldRenderFullImage"
      ref="fullImageEl"
      :src="props.image"
      @load="onImageLoad"
      class="object-contain absolute w-full h-full z-10"
      decoding="async"
      :fetchpriority="props.loadFullImage ? 'high' : 'auto'"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
	thumbnail: String,
	image: String,
	loadFullImage: Boolean,
});

const fullImageLoaded = ref(false);
const shouldRenderFullImage = ref(!!props.loadFullImage);
const fullImageEl = ref<HTMLImageElement | null>(null);
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

const fullImageVisible = computed(
	() => props.loadFullImage && fullImageLoaded.value,
);

/**
 * `load` means "bytes are in", NOT "this can be painted this frame".
 *
 * With `decoding="async"` the browser deliberately defers the decode past the
 * load event, so hiding the thumbnail on `load` uncovered a layer the compositor
 * had nothing to draw for yet — one or two frames of the black modal background
 * showing through. `decode()` resolves once the frame is ready, which is the
 * moment the swap is actually free.
 *
 * The token guards a decode still in flight when the slide is recycled onto a
 * different `src`: without it a late resolve reveals the WRONG image.
 */
let decodeToken = 0;

const revealFullImage = async (el: HTMLImageElement | null) => {
	if (!el) return;
	const token = ++decodeToken;
	try {
		await el.decode();
	} catch {
		// Rejects when the src is swapped mid-decode, or the image fails to load.
		// Either way the thumbnail stays up, which is the correct fallback.
		return;
	}
	if (token !== decodeToken) return;
	fullImageLoaded.value = true;
};

const onImageLoad = (event: Event) =>
	revealFullImage(event.target as HTMLImageElement);

// A cached image can already be complete by the time the element mounts, and
// then `load` never fires — the slide would sit on its thumbnail forever.
watch(fullImageEl, (el) => {
	if (el?.complete && el.naturalWidth > 0) revealFullImage(el);
});

watch(
	() => props.image,
	() => {
		// Invalidate any decode still running against the previous src.
		decodeToken++;
		fullImageLoaded.value = false;
	},
);

watch(
	() => props.loadFullImage,
	(loadFullImage) => {
		if (releaseTimer) {
			clearTimeout(releaseTimer);
			releaseTimer = null;
		}
		if (loadFullImage) {
			shouldRenderFullImage.value = true;
			return;
		}

		// Reveal the already-decoded thumbnail immediately, but keep the full
		// image behind it through the rest of Swiper's slide animation. Removing
		// both layers in the same frame caused a brief black flash.
		releaseTimer = setTimeout(() => {
			shouldRenderFullImage.value = false;
			fullImageLoaded.value = false;
			releaseTimer = null;
		}, 350);
	},
);

onBeforeUnmount(() => {
	if (releaseTimer) clearTimeout(releaseTimer);
});
</script>

<style scoped>

</style>
