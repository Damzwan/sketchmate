<template>
  <div class="absolute inset-0 pointer-events-none" v-if="def && def.kind !== 'none'" ref="root">

    <!-- Lottie decoration. One canvas → DotLottie renders straight into it (no
         master/copy indirection; that's only worth it when many canvases share
         one animation, e.g. ProfileWorld). Player is paused off-screen so a feed
         full of decorated avatars isn't running dozens of animations at once. -->
    <div
      v-if="def.kind === 'lottie' && def.lottieId"
      class="absolute top-1/2 left-1/2 pointer-events-none z-10 flex items-center justify-center"
      :style="{
        width: def.lottieConfig?.scale || '100%',
        height: def.lottieConfig?.scale || '100%',
        transform: def.lottieConfig?.offset || 'translate(-50%, -50%)'
      }"
    >
      <!-- Keyed per decoration: on web the worker TRANSFERS the canvas
           (OffscreenCanvas), which is a one-shot — a new player can never
           rebind the same element, so a decoration switch must get a fresh
           canvas. -->
      <canvas
        :key="def.lottieId"
        :ref="(el) => bindCanvas(el, getLottieSrc(def.lottieId!))"
        class="w-full h-full object-cover block"
      ></canvas>
    </div>

    <!-- Halo glow -->
    <div
      v-if="def.haloColor"
      class="absolute inset-0 rounded-full"
      :class="{ 'animate-halo-pulse': !paused }"
      :style="{
        boxShadow: `0 0 24px 4px ${def.haloColor}, 0 0 48px 8px ${def.haloColor}55`,
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createLottie, type LottiePlayer } from "@/helper/lottie.helper";
import {
	type Decoration,
	resolveDecoration,
} from "@/config/profile_options.config";

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

const root = ref<HTMLElement | null>(null);
const onScreen = ref(false);
let io: IntersectionObserver | null = null;

let player: LottiePlayer | null = null;
let currentSrc = "";
let boundEl: HTMLCanvasElement | null = null;

// Freeze when explicitly static (e.g. behind the doodle pad) or scrolled away.
const paused = computed(() => !!props.static || !onScreen.value);

const applyRunState = () => {
	if (!player) return;
	paused.value ? player.pause() : player.play();
};

const destroyPlayer = () => {
	player?.destroy();
	player = null;
	currentSrc = "";
	boundEl = null;
};

// Inline function-ref → Vue re-invokes it every render. Rebuild when the SRC
// changes (new decoration) OR when the ELEMENT changes — a re-render that
// re-creates the canvas (avatar/identity update) would otherwise leave the
// player rendering into the old detached canvas: frozen decoration.
const bindCanvas = (el: any, src: string) => {
	if (!el || !src) {
		// Ref fired with null (canvas unmounted) or decoration has no lottie —
		// either way the current player has nothing to paint on.
		destroyPlayer();
		return;
	}
	if (player && currentSrc === src && boundEl === el) return;

	destroyPlayer();
	const canvas = el as HTMLCanvasElement;

	currentSrc = src;
	boundEl = canvas;
	// On web the worker takes ownership of the canvas (OffscreenCanvas transfer),
	// so don't set canvas.width/height — autoResize + the CSS box size the buffer.
	player = createLottie({
		canvas,
		src,
		loop: true,
		autoplay: !paused.value,
		layout: { fit: "contain", align: [0.5, 0.5] },
		renderConfig: {
			devicePixelRatio: Math.min(
				typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
				1.5,
			),
			autoResize: true,
		},
	});
	// On a cold load the asset isn't cached, so any play() from the Intersection
	// Observer can land BEFORE the animation data is ready and get dropped
	// (autoplay is false while off-screen). Re-assert run-state once loaded so it
	// starts regardless of the load/observer race.
	player.addEventListener("load", applyRunState);
};

onMounted(() => {
	if (typeof IntersectionObserver === "undefined") {
		onScreen.value = true;
		return;
	}
	io = new IntersectionObserver(
		(entries) => {
			onScreen.value = entries.some((e) => e.isIntersecting);
		},
		{ rootMargin: "200px" },
	);
	watch(
		root,
		(el) => {
			io?.disconnect();
			if (el) io?.observe(el);
		},
		{ immediate: true, flush: "post" },
	);
});

watch(paused, applyRunState);

onBeforeUnmount(() => {
	io?.disconnect();
	destroyPlayer();
});
</script>

<style scoped>
@keyframes halo-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.animate-halo-pulse {
  animation: halo-pulse 2.5s ease-in-out infinite;
}
</style>
