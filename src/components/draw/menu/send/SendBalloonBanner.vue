<template>
  <div
    v-if="user && !user.balloon?.sent"
    class="card bg-warning mb-4 hover:cursor-pointer" @click="isExpanded = !isExpanded"
  >
    <div v-if="isExpanded">
      <div class="flex justify-between items-center">
        <div class="flex justify-center items-center gap-2">
          <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-12 h-12" />
          <p class="cabin-sketch-regular text-xl font-bold">Send a balloon!</p>
        </div>
        <ion-icon :icon="svg(mdiChevronDown)" />
      </div>
      <div class="flex-1 pr-3">

        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          Release a balloon into the sky and connect with a stranger.
        </p>
        <ion-textarea
          label="Balloon message"
          label-placement="floating"
          color="secondary"
          fill="outline"
          placeholder="I am a very friendly person 🦀"
          class="py-3 bg-secondary"
          v-model="balloonDescription"
          @click.stop
        />

        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="sendBalloon"
          @click.stop
        >
          Send Balloon
          <ion-spinner name="crescent" slot="end" class="ml-2" color="secondary" v-if="sendingBalloon" />
        </ion-button>
      </div>
    </div>
    <div v-else class="flex justify-between items-center w-full">
      <div class="flex justify-center items-center gap-2">
        <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-12 h-12" />
        <p class="cabin-sketch-regular text-xl font-bold">Send a balloon!</p>
      </div>
      <ion-icon :icon="svg(mdiChevronDown)" />
    </div>

  </div>
</template>


<script setup lang="ts">

import balloonLottie from '@/assets/lottie/balloon.json'
import { IonButton, IonTextarea, IonIcon, IonSpinner } from '@ionic/vue'
import Lottie from '@/components/general/Lottie.vue'
import { useToast } from '@/service/toast.service'
import { balloonButton } from '@/config/toast.config'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useDrawStore } from '@/store/draw/draw.store'
import { mdiChevronDown } from '@mdi/js'
import { svg } from '@/helper/general.helper'

const { sentBalloon, user } = storeToRefs(useAuthStore())
const { createBalloon } = useDrawStore()

const balloonDescription = ref('')
const sendingBalloon = ref(false)
const isExpanded = ref(false)

function sendBalloon() {
  sendingBalloon.value = true
  createBalloon(balloonDescription.value).then(res => {
    sendingBalloon.value = false
    if (!user.value || !res) return
    sentBalloon.value = res.balloon
    if (!user.value.balloon) user.value.balloon = {}
    user.value!.balloon.sent = res.balloon._id

    const { toast } = useToast()
    toast('Balloon sent!', { buttons: [balloonButton] })
  })
}
</script>

<style scoped>
.card {
  @apply w-full mx-auto rounded-xl p-4 max-w-96 flex shadow-md;
}
</style>