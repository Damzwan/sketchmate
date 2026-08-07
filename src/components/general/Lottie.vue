<template>
  <!-- Root wrapper receives the passed size classes (e.g. w-24 h-24). The canvas
       fills it. Previously the canvas WAS the root, and the scoped
       `canvas{width/height:100%}` rule below beat the utility classes, so the
       size prop was ignored and the balloon stretched to the parent → bigger. -->
  <div class="lottie-wrap">
    <canvas ref="canvasRef" :class="{ 'is-loaded': loaded }" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createLottie, type LottiePlayer } from "@/helper/lottie.helper";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loaded = ref(false);
// Worker player on web (WASM decode off the main thread), main-thread player on
// native — see createLottie for why. Renders straight to its own canvas.
let player: LottiePlayer | null = null;

const props = defineProps({
	src: {
		type: String,
		required: true,
	},
	loop: {
		type: Boolean,
		default: false,
	},
	autoplay: {
		type: Boolean,
		default: true,
	},
	play: {
		type: Boolean,
		default: false,
	},
	speed: {
		type: Number,
		default: 1,
	},
});

onMounted(() => {
	// Guard re-entry: Ionic keeps the outgoing page mounted during the enter
	// animation, so this component can exist twice for the transition window.
	// The guard keeps a single instance from ever leaking a second player.
	if (player || !canvasRef.value) return;

	player = createLottie({
		canvas: canvasRef.value,
		src: props.src,
		loop: props.loop,
		autoplay: props.autoplay,
		layout: { fit: "contain", align: [0.5, 0.5] },
		renderConfig: {
			devicePixelRatio: window.devicePixelRatio,
			autoResize: true,
		},
	});

	player.setSpeed(props.speed);

	const willPlay = props.play || props.autoplay;
	if (!willPlay) {
		player.stop();
	}

	// Reveal only once a real frame is rasterised. Fading in on "load" (data
	// ready, canvas still blank) leaves a beat of empty canvas that then jumps
	// to the first frame — the visible flicker. "frame" fires after the raster.
	// A stopped player never emits "frame", so fall back to "load" there (its
	// static first frame is drawn on load).
	const revealEvent = willPlay ? "frame" : "load";
	const reveal = () => {
		loaded.value = true;
		player?.removeEventListener(revealEvent, reveal);
	};
	player.addEventListener(revealEvent, reveal);
});

watch(
	() => props.play,
	(play) => {
		if (!player) return;
		play ? player.play() : player.stop();
	},
);

watch(
	() => props.speed,
	(speed) => {
		player?.setSpeed(speed);
	},
);

onBeforeUnmount(() => {
	player?.destroy();
	player = null;
});
</script>

<style scoped>
.lottie-wrap {
  display: block;
}
.lottie-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 200ms ease;
}
.lottie-wrap canvas.is-loaded {
  opacity: 1;
}
</style>