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
      <canvas
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
import { DotLottie } from "@lottiefiles/dotlottie-web";
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

// Avatars are small — a low internal buffer keeps memory tiny; CSS scales it up.
const canvasResolution = 150;

const root = ref<HTMLElement | null>(null);
const onScreen = ref(false);
let io: IntersectionObserver | null = null;

let player: DotLottie | null = null;
let currentSrc = "";

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
};

// Inline function-ref → Vue re-invokes it every render, so a decoration change
// (new src) rebuilds the player; an unchanged src is a no-op.
const bindCanvas = (el: any, src: string) => {
	if (!el || !src) {
		if (!src) destroyPlayer();
		return;
	}
	if (player && currentSrc === src) return;

	destroyPlayer();
	const canvas = el as HTMLCanvasElement;
	canvas.width = canvasResolution;
	canvas.height = canvasResolution;

	currentSrc = src;
	player = new DotLottie({
		canvas,
		src,
		loop: true,
		autoplay: !paused.value,
		renderConfig: { devicePixelRatio: 1 },
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
