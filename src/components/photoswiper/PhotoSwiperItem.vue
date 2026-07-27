<template>
  <!-- Explicit target makes Swiper scale the whole artwork stack. Without this
       it picks the first descendant <img>; the retained thumbnail then pans
       independently and pinch looks like a positional shift instead of zoom. -->
  <div class="swiper-zoom-target relative w-full h-full">
    <img
      :src="props.thumbnail"
      :alt="`Drawing ${props.thumbnail}`"
      class="object-contain absolute w-full h-full z-20"
      :class="props.loadFullImage && fullImageLoaded
        ? 'opacity-0 transition-opacity duration-150'
        : 'opacity-100 transition-none'"
      decoding="async"
    />

    <!-- Real image -->
    <img
      v-if="shouldRenderFullImage"
      :src="props.image"
      @load="onImageLoad"
      class="object-contain absolute w-full h-full z-10"
      decoding="async"
      :fetchpriority="props.loadFullImage ? 'high' : 'auto'"
    />
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
	thumbnail: String,
	image: String,
	loadFullImage: Boolean,
});

const fullImageLoaded = ref(false);
const shouldRenderFullImage = ref(!!props.loadFullImage);
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

const onImageLoad = () => {
	fullImageLoaded.value = true;
};

watch(
	() => props.image,
	() => {
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
