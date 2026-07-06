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

        <div class="relative z-10 w-full max-w-sm bg-tertiary/95 backdrop-blur-md shadow-xl rounded-[2rem] border border-primary/40 p-8 text-center">

          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10 border border-primary/30 mb-5">
            <ion-icon :icon="svg(mdiHeart)" class="text-4xl animate-pulse text-secondary" />
          </div>

          <h3 class="text-3xl cabin-sketch-regular font-black text-black mb-3 tracking-tight">
            You're amazing!
          </h3>
          <p class="text-[15px] text-black/70 leading-relaxed">
            Thank you for supporting SketchMate.<br />
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