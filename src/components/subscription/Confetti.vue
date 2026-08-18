<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div
        v-if="showConfetti"
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-auto"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/25"></div>

        <!-- Optimized raw canvas replacing the framework wrapper wrapper -->
        <canvas
          ref="confettiCanvas"
          class="absolute pointer-events-none w-screen h-screen"
          style="max-width: 1200px; max-height: 1200px;"
        ></canvas>

        <div
          class="relative z-10 w-full max-w-sm bg-tertiary shadow-xl rounded-[2rem] border border-primary/40 p-8 text-center"
        >
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10 border border-primary/30 mb-5"
          >
            <ion-icon :icon="svg(mdiHeart)" class="text-4xl animate-pulse text-secondary" />
          </div>

          <h3 class="text-3xl cabin-sketch-regular font-black text-black mb-3 tracking-tight">
            You're amazing!
          </h3>
          <p class="text-[15px] text-black/80">
            Thank you for supporting SketchMate.<br />
            This project can't exist without your help.
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiHeart } from "@mdi/js";
import { storeToRefs } from "pinia";
import { nextTick, onUnmounted, ref, watch } from "vue";
import confetti from "@/assets/lottie/confetti.lottie";
import { svg } from "@/helper/general.helper";
import { createLottie, type LottiePlayer } from "@/helper/lottie.helper";
import { useSubscriptionStore } from "@/store/subscription.store";

const { showConfetti } = storeToRefs(useSubscriptionStore());
const confettiCanvas = ref<HTMLCanvasElement | null>(null);
let playerInstance: LottiePlayer | null = null;

const hide = () => {
	showConfetti.value = false;
};

const destroyPlayer = () => {
	if (playerInstance) {
		playerInstance.destroy();
		playerInstance = null;
	}
};

// Handles asset parsing and initialization manually onto the target canvas template node
const initLottie = async () => {
	destroyPlayer();
	await nextTick(); // Wait for Vue to un-hide the DOM elements and bind the canvas ref

	if (!confettiCanvas.value) return;

	playerInstance = createLottie({
		canvas: confettiCanvas.value,
		src: confetti,
		loop: false,
		autoplay: true,
		renderConfig: {
			devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), // Performance safeguard
		},
	});

	playerInstance.addEventListener("complete", () => {
		hide();
	});
};

let hideTimer: ReturnType<typeof setTimeout> | undefined;

watch(
	showConfetti,
	(visible) => {
		clearTimeout(hideTimer);
		if (visible) {
			initLottie();
			hideTimer = setTimeout(hide, 3500);
		} else {
			destroyPlayer();
		}
	},
	{ immediate: true },
);

onUnmounted(() => {
	clearTimeout(hideTimer);
	destroyPlayer();
});
</script>

<style scoped>
/* Smoother scale-in transition rather than just fading */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Optional: Ensure the backdrop fades smoothly alongside the card */
.fade-scale-enter-from .bg-black\/30,
.fade-scale-leave-to .bg-black\/30 {
  opacity: 0;
}
</style>
