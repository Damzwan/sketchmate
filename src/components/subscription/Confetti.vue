<template>
  <Teleport to="body">
  <Transition name="fade">
    <div v-if="showConfetti" class="fixed inset-0 flex items-center justify-center pointer-events-none z-[99999]">

      <DotLottieVue
        class="absolute"
        style="width: 100vw; height: 100vh; max-width: 1200px; max-height: 1200px;"
        :src="confetti"
        autoplay
        ref="lottieRef"
      />

      <div
        class="relative z-10 bg-primary backdrop-blur-sm shadow-xl rounded-2xl px-8 py-6 text-center transform -translate-y-4">
        <span class="text-5xl mb-2 block animate-bounce">💖</span>
        <h3 class="text-3xl cabin-sketch-regular font-extrabold text-gray-800 mb-1">You're amazing!</h3>
        <p class="text-lg cabin-sketch-regular text-gray-600 font-medium leading-tight">
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
import confetti from '@/assets/lottie/confetti.lottie'
import { useSubscriptionStore } from '@/store/subscription.store'
import { ref, watch } from 'vue'

const { showConfetti } = storeToRefs(useSubscriptionStore())
const lottieRef = ref(null)

watch(showConfetti, async (isActive) => {
  if (isActive) {
    setTimeout(() => {
      const dotLottie = lottieRef.value?.getDotLottieInstance()
      if (dotLottie) {
        dotLottie.addEventListener('complete', () => {
          showConfetti.value = false
        })
      }
    }, 50)
  }
})
</script>

<style scoped>
/* Simple fade transition classes */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>