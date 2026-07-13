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
      <!-- Optimized low-overhead proxy canvas -->
      <canvas
        :ref="(el) => bindCanvas(el, getLottieSrc(def.lottieId!))"
        class="w-full h-full object-cover block"
      ></canvas>
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

    <!-- Hidden DOM container keeping the single master assets hot and active -->
    <div
      ref="masterContainer"
      class="absolute inset-0 pointer-events-none z-[-1]"
      style="opacity: 0.001; overflow: hidden;"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
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

// ── Master Pipeline Frame Copy Mechanics ───────────────────────────────────
const canvasResolution = 150; // Avatars are small; keeping resolution low saves massive memory
const masterContainer = ref<HTMLElement | null>(null);
const masters = new Map<
	string,
	{
		canvas: HTMLCanvasElement;
		player: DotLottie;
		targets: Set<CanvasRenderingContext2D>;
	}
>();
let animationFrameId: number | null = null;

const startLoop = () => {
	if (!animationFrameId && !props.static) {
		renderLoop();
	}
};

const stopLoop = () => {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
};

const copyMasterFramesToTargets = () => {
	masters.forEach((master) => {
		if (master.targets.size > 0) {
			master.targets.forEach((targetCtx) => {
				// Automatic Garbage Collection if elements unmount
				if (!document.body.contains(targetCtx.canvas)) {
					master.targets.delete(targetCtx);
					return;
				}
				targetCtx.clearRect(0, 0, canvasResolution, canvasResolution);
				targetCtx.drawImage(
					master.canvas,
					0,
					0,
					canvasResolution,
					canvasResolution,
				);
			});
		}
	});
};

const renderLoop = () => {
	if (props.static) return;
	copyMasterFramesToTargets();
	animationFrameId = requestAnimationFrame(renderLoop);
};

const bindCanvas = (el: any, src: string) => {
	if (!el || !src) return;
	const targetCanvas = el as HTMLCanvasElement;

	if (targetCanvas.width !== canvasResolution) {
		targetCanvas.width = canvasResolution;
		targetCanvas.height = canvasResolution;
	}

	const ctx = targetCanvas.getContext("2d", { alpha: true });
	if (!ctx) return;

	if (!masters.has(src)) {
		const hiddenCanvas = document.createElement("canvas");
		hiddenCanvas.width = canvasResolution;
		hiddenCanvas.height = canvasResolution;

		hiddenCanvas.style.width = `${canvasResolution}px`;
		hiddenCanvas.style.height = `${canvasResolution}px`;
		hiddenCanvas.style.position = "absolute";

		if (masterContainer.value) {
			masterContainer.value.appendChild(hiddenCanvas);
		}

		const player = new DotLottie({
			canvas: hiddenCanvas,
			src: src,
			loop: true,
			autoplay: !props.static,
			renderConfig: { devicePixelRatio: 1 },
		});

		player.addEventListener("load", () => {
			requestAnimationFrame(() => {
				copyMasterFramesToTargets();
			});
		});

		masters.set(src, { canvas: hiddenCanvas, player, targets: new Set() });
	}

	const masterGroup = masters.get(src)!;
	masterGroup.targets.add(ctx);

	if (props.static) {
		requestAnimationFrame(() => {
			ctx.clearRect(0, 0, canvasResolution, canvasResolution);
			ctx.drawImage(
				masterGroup.canvas,
				0,
				0,
				canvasResolution,
				canvasResolution,
			);
		});
	} else {
		startLoop();
	}
};

watch(
	() => props.static,
	(isStatic) => {
		masters.forEach((m) => (isStatic ? m.player.pause() : m.player.play()));
		if (isStatic) {
			stopLoop();
			requestAnimationFrame(() => {
				copyMasterFramesToTargets();
			});
		} else {
			startLoop();
		}
	},
);

onBeforeUnmount(() => {
	stopLoop();
	masters.forEach((m) => m.player.destroy());
	masters.clear();
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