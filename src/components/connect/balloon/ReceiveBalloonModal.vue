<template>
  <ion-modal
    :is-open="receiveBalloonModalOpen"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    @willPresent="fetchBalloon"
    @didDismiss="dismiss"
    :handle="false"
  >
    <div class="bg-primary p-4 flex flex-col justify-center items-center min-h-56 relative overflow-hidden w-full">

      <!-- Loading Spinner -->
      <ion-spinner
        v-if="loading || !sender || !receivedBalloon"
        color="secondary"
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />

      <!-- Animated balloon -->
      <div
        v-else
        class="flex flex-col items-center w-full"
      >
        <div class="relative w-full h-[500px] flex justify-center">
          <!-- Floating balloon -->
          <div class="absolute animate-float bottom-2">
            <div class="relative">
              <!-- balloon Drawing + Lottie -->
              <Lottie
                :json="balloonLottie"
                :loop="true"
                class="absolute top-[-120px] left-[-70px] w-36 h-36"
              />

              <!-- Sender Profile attached -->
              <div class="animate-wiggle animate-duration-[2000ms] flex flex-col items-center relative">
                <!-- balloon Image with better aspect ratio handling -->
                <div class="relative w-[250px] h-[250px] flex items-center justify-center">
                  <img
                    :src="receivedBalloon.thumbnail"
                    alt="balloon"
                    class="max-w-full max-h-full object-contain z-10"
                  />
                </div>

                <!-- Sender Profile -->
                <img
                  :src="sender.img"
                  alt="sender"
                  class="rounded-full w-16 h-16 -mt-6 border-2 border-white shadow-lg z-20"
                />

                <!-- Message Bubble -->
                <div
                  v-if="receivedBalloon.message != ''"
                  class="ml-4"
                >
                  <div
                    class="bg-background text-black px-4 py-2 rounded-2xl shadow-md w-[150px] max-w-md
               cabin-sketch-regular break-words"
                  >
                    {{ receivedBalloon.message }}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div :class="{invisible: !showText}">
          <p class="cabin-sketch-regular text-3xl mt-4  text-center" :class="{'animate-fade-up': showText}"
             v-if="sender">
            {{ sender.name }} sent you a balloon!
          </p>
          <p class="text-xl cabin-sketch-regular mt-2   text-center"
             :class="{'animate-fade-up animate-delay-[1200ms]': showText}">
            Do you want to be friends?
          </p>

          <!-- Buttons -->
          <div class="flex flex-col gap-2 mt-4" :class="{'animate-fade-up animate-delay-[2500ms]': showText}"
               v-if="receivedBalloon">
            <ion-button color="secondary" fill="solid" shape="rounded"
                        @click="acceptBalloonHelper">
              Accept
            </ion-button>
            <ion-button color="secondary" fill="clear" shape="rounded" @click="rejectBalloonHelper">Refuse</ion-button>
          </div>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonSpinner } from '@ionic/vue'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useMenuStore } from '@/store/draw/menu.store'
import { Balloon, Mate } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import Lottie from '@/components/general/Lottie.vue'
import balloonLottie from '@/assets/lottie/balloon.json'
import { useSocketService } from '@/service/api/socket.service'

const { user, receivedBalloon } = storeToRefs(useAuthStore())
const { receiveBalloonModalOpen } = storeToRefs(useMenuStore())
const api = useAPI()
const { toast } = useToast()

const sender = ref<Mate>()
const loading = ref(false)

const balloonDuration = 4000

const showText = ref(false)
const { acceptBalloon, rejectBalloon } = useSocketService()


let timeout: any = null

async function fetchBalloon() {
  if (!receivedBalloon.value) {
    loading.value = true

    const fetchedBalloon = await api.getBalloon({ balloonId: user.value!.balloon!.received! })
    if (!fetchedBalloon) {
      toast('Something went wrong', { color: 'danger' })
      loading.value = false
      return
    }

    receivedBalloon.value = fetchedBalloon
  }

  const mates = await api.getPartialUsers({ _ids: [receivedBalloon.value.sender] })
  if (!mates || mates.length === 0) {
    toast('Something went wrong', { color: 'danger' })
    loading.value = false
    return
  }

  sender.value = mates[0]
  loading.value = false

  timeout = setTimeout(() => {
    showText.value = true
  }, balloonDuration)
}

function dismiss() {
  clearTimeout(timeout)
  receiveBalloonModalOpen.value = false
  showText.value = false
}

function acceptBalloonHelper() {
  acceptBalloon({
    user_id: user.value!._id,
    balloon_id: receivedBalloon.value!._id,
    sender: receivedBalloon.value!.sender
  })
  receivedBalloon.value!.status = 'accepted'
  receiveBalloonModalOpen.value = false
}

function rejectBalloonHelper() {
  rejectBalloon({
    user_id: user.value!._id,
    balloon_id: receivedBalloon.value!._id,
    sender: receivedBalloon.value!.sender
  })
  user.value!.balloon!.received = undefined
  receivedBalloon.value = undefined
  receiveBalloonModalOpen.value = false
}
</script>

<style scoped>
ion-modal {
  --height: auto;
}

/* Floating balloon animation */
@keyframes float {
  0% {
    transform: translateY(-400px);
  }
  100% {
    transform: translateY(0px); /* Adjust height as needed */
  }
}

.animate-float {
  animation: float 4s linear;
}


</style>
