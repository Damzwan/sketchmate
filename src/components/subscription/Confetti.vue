<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div
        v-if="showConfetti"
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-auto"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

        <DotLottieVue
          class="absolute pointer-events-none"
          style="width: 100vw; height: 100vh; max-width: 1200px; max-height: 1200px;"
          :src="confetti"
          autoplay
          @complete="onAnimationComplete"
        />

        <div class="relative z-10 w-full max-w-sm bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-2xl rounded-3xl border border-gray-200/50 dark:border-gray-700/50 p-8 text-center ring-1 ring-black/5 transform transition-all">

          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 mb-5">
            <ion-icon :icon="svg(mdiHeart)" class="text-4xl animate-pulse text-red-500" />
          </div>

          <h3 class="text-3xl cabin-sketch-regular font-extrabold text-gray-900 dark:text-white mb-3 tracking-tight">
            You're amazing!
          </h3>
          <p class="text-base font-medium text-gray-600 dark:text-gray-300 leading-relaxed">
            Thank you for supporting Sketchmate.<br />
            This project can't exist without your help.
          </p>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { IonIcon } from '@ionic/vue'
import { mdiHeart } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import confetti from '@/assets/lottie/confetti.lottie'
import { useSubscriptionStore } from '@/store/subscription.store'

const { showConfetti } = storeToRefs(useSubscriptionStore())

// Greatly simplified logic: rely on the component's native event
const onAnimationComplete = () => {
  showConfetti.value = false
}
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