<template>
  <div>
    <!-- BACKDROP -->
    <Transition name="fade">
      <div
        v-if="balloonStore.receivedBalloon && hasLanded"
        class="fixed inset-0 z-40 flex flex-col bg-primary/95 backdrop-blur-md pt-8 safe-area overflow-hidden"
      >
        <!-- HEADER -->
        <div class="text-center px-4 shrink-0">
          <p
            class="mt-3"
            :class="[
              'cabin-sketch-regular font-bold text-black',
              isSuperShortScreen ? 'text-xl' : 'text-3xl sm:text-4xl'
            ]"
          >
            You caught a balloon from {{ balloonStore.senderInfo?.name || 'a fellow patient' }}!
          </p>

          <div
            :class="[
              'bg-black/10 rounded-full mt-3 mx-auto overflow-hidden',
              isSuperShortScreen ? 'w-32 h-1.5' : 'w-48 sm:w-56 h-2'
            ]"
          >
            <div class="h-full bg-red-400 timer-shrink"></div>
          </div>
        </div>

        <!-- FLEX CONTENT -->
        <div class="flex flex-col items-center justify-center flex-1 min-h-0 px-4" />

        <!-- ACTIONS -->
        <Transition name="fade-up">
          <div
            v-if="showButtons"
            class="shrink-0 px-4 pt-3 pb-safe flex flex-col items-center gap-2"
          >
            <div class="flex flex-col sm:flex-row gap-2 w-full max-w-sm">
              <ion-button shape="round" color="secondary" fill="outline" @click="balloonStore.refuseReceived"
                          class="flex-1">
                Let it float
              </ion-button>
              <ion-button shape="round" color="secondary" @click="balloonStore.acceptReceived" class="flex-1">
                Catch it!
              </ion-button>
            </div>

            <ion-button fill="clear" color="secondary" class="opacity-70" @click="disableConfirmationOpen = true">
              Stop receiving balloons
            </ion-button>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- FLOATING BALLOON -->
    <Transition name="float-down" @after-enter="handleLanded" @before-leave="handleBalloonLeave">
      <div
        v-if="balloonStore.receivedBalloon"
        :class="[isSuperShortScreen ? 'items-center' : 'items-end']"
        class="fixed inset-0 z-50 flex  justify-center pointer-events-none"
      >
        <div
          :class="[
            'flex flex-col items-center w-full max-w-[500px] px-4 mt-10',
            isSuperShortScreen ? 'h-[70vh]' : 'h-[80vh]'
          ]"
        >

          <!-- BALLOON -->
          <Lottie
            :json="balloonLottie"
            :loop="true"
            :speed="0.5"
            :class="[
              isSuperShortScreen
                ? 'h-[10vh]'
                : (isVertical ? 'h-[14vh]' : 'h-[18vh]')
            ]"
          />

          <!-- FLEX AREA -->
          <div class="flex flex-col items-center w-full flex-1 min-h-0">

            <!-- IMAGE -->
            <div class="w-full flex justify-center shrink min-h-0">
              <img
                v-if="balloonStore.receivedBalloon.img"
                :src="balloonStore.receivedBalloon.img"
                alt="drawing"
                :class="[
                  'object-contain rounded-2xl border-4 border-white bg-white shadow-xl',
                  'max-w-full w-auto h-auto',
                  isSuperShortScreen
                    ? 'max-h-[20vh]'
                    : (isVertical ? 'max-h-[30vh]' : 'max-h-[40vh]')
                ]"
              />
            </div>

            <!-- MESSAGE -->
            <Transition name="fade-up">
              <div
                v-if="showDetails && balloonStore.receivedBalloon.message"
                class="flex flex-col items-center w-full mt-2 min-h-0"
              >
                <img
                  v-if="balloonStore.senderInfo?.img"
                  :src="balloonStore.senderInfo.img"
                  class="w-10 h-10 rounded-full border-2 border-black object-cover bg-white -mb-5 z-10"
                />

                <div
                  :class="[
        'cabin-sketch-regular font-bold text-black bg-white border-2 border-black rounded-2xl shadow-lg w-full max-w-[280px]',
        'flex flex-col flex-1 min-h-0',
        isSuperShortScreen ? 'text-sm' : 'text-base sm:text-lg'
      ]"
                >
                  <!-- ✅ FIXED SCROLL CONTAINER -->
                  <div
                    class="flex-1 min-h-12.5 max-h-24 overflow-y-auto overflow-x-hidden px-4 pt-6 pb-3 text-center wrap-break-word pointer-events-auto"
                  >
                    "{{ balloonStore.receivedBalloon.message }}"
                  </div>
                </div>
              </div>
            </Transition>

          </div>
        </div>
      </div>
    </Transition>

    <!-- CONFIRMATION -->
    <ConfirmationAlert
      header="Stop Receiving Balloons?"
      message="You won't see new balloons float by, but you can turn this back on anytime."
      @confirm="balloonStore.disableBalloons"
      v-model:is-open="disableConfirmationOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useBalloonStore } from '@/store/balloon.store'
import balloonLottie from '@/assets/lottie/balloon.json'
import Lottie from '@/components/general/Lottie.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { IonButton } from '@ionic/vue'

const balloonStore = useBalloonStore()
const disableConfirmationOpen = ref(false)

const hasLanded = ref(false)
const showDetails = ref(false)
const showButtons = ref(false)
const isVertical = ref(false)
const isSuperShortScreen = ref(false)

// detect small screens
function checkScreenHeight() {
  isSuperShortScreen.value = window.innerHeight < 700
}

onMounted(() => {
  checkScreenHeight()
  window.addEventListener('resize', checkScreenHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenHeight)
})

// detect image orientation
function checkImageOrientation(src: string) {
  const img = new Image()
  img.onload = () => {
    isVertical.value = img.height > img.width
  }
  img.src = src
}

watch(() => balloonStore.receivedBalloon, (val) => {
  if (val?.img) checkImageOrientation(val.img)
})

function handleLanded() {
  if (!balloonStore.receivedBalloon) return
  hasLanded.value = true

  const hasMessage = balloonStore.receivedBalloon.message?.trim().length > 0

  setTimeout(() => {
    showDetails.value = true
  }, 800)

  setTimeout(() => {
    showButtons.value = true
  }, hasMessage ? 2000 : 1000)
}

function handleBalloonLeave() {
  hasLanded.value = false
  showDetails.value = false
  showButtons.value = false
}
</script>

<style scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 1rem);
}

/* FLOAT */
.float-down-enter-active {
  transition: all 4s cubic-bezier(0.22, 1, 0.36, 1);
}

.float-down-leave-active {
  transition: all 0.4s ease-in;
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
  transform: translateY(-80px) scale(0.85);
}

/* FADE */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* FADE UP */
.fade-up-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-up-enter-from {
  opacity: 0;
  transform: translateY(15px) scale(0.95);
}

.fade-up-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* TIMER */
.timer-shrink {
  width: 100%;
  transform-origin: left;
  animation: shrink-bar 50s linear forwards;
}

@keyframes shrink-bar {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
</style>