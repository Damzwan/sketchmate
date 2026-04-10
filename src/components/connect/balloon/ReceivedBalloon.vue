<template>
  <div>
    <Transition name="fade">
      <div
        v-if="balloonStore.receivedBalloon && hasLanded"
        class="fixed safe-area inset-0 z-40 flex flex-col items-center justify-between bg-primary/95 backdrop-blur-md pb-6 pt-10 sm:pb-12 sm:pt-12 overflow-y-auto"
      >
        <div class="flex flex-col items-center text-center px-4 shrink-0 mt-4">
          <p class="text-3xl sm:text-4xl cabin-sketch-regular font-bold text-black mb-1 sm:mb-2">
            You caught a balloon from {{ balloonStore.senderInfo?.name || 'a fellow patient' }}!
          </p>

          <div class="w-48 sm:w-56 h-1.5 sm:h-2 bg-black/10 rounded-full mt-2 overflow-hidden">
            <div class="h-full bg-red-400 timer-shrink"></div>
          </div>
        </div>

        <Transition name="fade-up">
          <div v-if="showButtons"
               class="flex flex-col gap-2 sm:gap-3 items-center w-full px-4 shrink-0 pb-safe z-50 pointer-events-auto mt-auto pt-4">
            <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full justify-center max-w-sm">
              <ion-button
                shape="round"
                color="medium"
                fill="outline"
                @click="balloonStore.refuseReceived"
                class="flex-1 cabin-sketch-regular font-bold text-base sm:text-lg m-0"
              >
                Let it float
              </ion-button>

              <ion-button
                shape="round"
                color="secondary"
                @click="balloonStore.acceptReceived"
                class="flex-1 cabin-sketch-regular font-bold text-base sm:text-lg shadow-lg m-0"
              >
                Catch it!
              </ion-button>
            </div>

            <ion-button
              shape="round"
              fill="clear"
              color="dark"
              class="mt-1 cabin-sketch-regular text-xs sm:text-sm normal-case opacity-70 m-0"
              @click="disableConfirmationOpen = true"
            >
              Stop receiving balloons
            </ion-button>
          </div>
        </Transition>
      </div>
    </Transition>

    <Transition
      name="float-down"
      @after-enter="handleLanded"
      @before-leave="handleBalloonLeave"
    >
      <div
        v-if="balloonStore.receivedBalloon"
        class="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
      >
        <div
          class="relative flex flex-col items-center animate-float w-full max-w-[85%] sm:max-w-[60%] mt-[-15vh] sm:mt-[-5%]">

          <Lottie
            :json="balloonLottie"
            :loop="true"
            :speed="0.5"
            class="h-[15vh] min-h-[100px] max-h-[150px] absolute left-[45%] -translate-x-1/2 -top-[12vh]"
          />

          <div class="relative w-full flex justify-center z-10">
            <img
              v-if="balloonStore.receivedBalloon.img"
              :src="balloonStore.receivedBalloon.img"
              alt="drawing from another patient"
              class="max-h-[30vh] sm:max-h-[250px] max-w-full animate-wiggle animate-duration-1000 drop-shadow-xl object-contain rounded-2xl border-2 border-black/10 bg-white/50"
            />
          </div>

          <Transition name="fade-up">
            <div
              v-if="showDetails && balloonStore.receivedBalloon.message"
              class="absolute top-full mt-3 sm:mt-4 flex flex-col items-center transform rotate-2 w-full z-20 pointer-events-auto"
            >
              <img
                v-if="balloonStore.senderInfo?.img"
                :src="balloonStore.senderInfo.img"
                alt="Sender Avatar"
                class="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-black object-cover shadow-md z-30 bg-white relative -mb-5 sm:-mb-6"
              />

              <div
                class="text-base sm:text-lg cabin-sketch-regular font-bold text-black bg-white/95 border-2 border-black rounded-2xl shadow-md w-full overflow-hidden"
              >
                <div
                  class="max-h-32 sm:max-h-24 overflow-y-auto px-4 pt-6 pb-2 sm:px-5 sm:pt-8 sm:pb-3 scroll-container text-center">
                  "{{ balloonStore.receivedBalloon.message }}"
                </div>
              </div>
            </div>
          </Transition>

        </div>
      </div>
    </Transition>

    <ConfirmationAlert
      header="Stop Receiving Balloons?"
      message="You won't see new balloons float by, but you can turn this back on in settings anytime."
      @confirm="balloonStore.disableBalloons"
      v-model:is-open="disableConfirmationOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useBalloonStore } from '@/store/balloon.store'
import balloonLottie from '@/assets/lottie/balloon.json'
import Lottie from '@/components/general/Lottie.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'

const balloonStore = useBalloonStore()
const disableConfirmationOpen = ref(false)

// Consolidated reveal states
const hasLanded = ref(false)
const showDetails = ref(false) // Controls BOTH message and avatar
const showButtons = ref(false)


function handleLanded() {
  if (!balloonStore.receivedBalloon) return
  hasLanded.value = true

  const hasMessage = balloonStore.receivedBalloon.message?.trim().length > 0

  setTimeout(() => {
    showDetails.value = true
  }, 1000)


  const buttonDelay = hasMessage ? 2500 : 1000
  setTimeout(() => {
    showButtons.value = true
  }, buttonDelay)
}

function handleBalloonLeave() {
  hasLanded.value = false
  showDetails.value = false
  showButtons.value = false
}
</script>


<style scoped>
.float-down-enter-active {
  transition: all 5s linear;
}

.float-down-leave-active {
  transition: all 0.5s ease-in;
}

.float-down-enter-from {
  opacity: 0;
  transform: translateY(-120vh) rotate(-10deg);
}

.float-down-enter-to {
  opacity: 1;
  transform: translateY(0) rotate(0deg);
}

.float-down-leave-to {
  opacity: 0;
  transform: translateY(-100px) scale(0.8);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-up-enter-active {
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-up-leave-active {
  transition: all 0.3s ease-in;
}

.fade-up-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.fade-up-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.fade-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.timer-shrink {
  width: 100%;
  transform-origin: left;
  animation: shrink-bar 50s linear forwards;
}

@keyframes shrink-bar {
  0% {
    width: 100%;
  }
  100% {
    width: 0%;
  }
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 1rem);
}
</style>