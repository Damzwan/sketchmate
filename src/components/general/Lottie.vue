<template>
  <canvas ref="canvasRef" />
</template>

<script setup lang="ts">
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let player: DotLottie | null = null;

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
	if (!canvasRef.value) return;

	player = new DotLottie({
		canvas: canvasRef.value,
		src: props.src,
		loop: props.loop,
		autoplay: props.autoplay,
	});

	player.setSpeed(props.speed);

	if (!props.play && !props.autoplay) {
		player.stop();
	}
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
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>