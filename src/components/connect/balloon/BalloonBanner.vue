<template>
  <div class="mx-2" v-if="socialFeaturesAllowed">
    <!-- Case: received a balloon -->
    <div
      v-if="user && user.balloon && receivedBalloon && receivedBalloon.status==='accepted'"
      class="card bg-green-400"
    >
      <div class="flex-1 pr-3">
        <p class="cabin-sketch-regular text-xl font-bold">
          You’ve accepted a balloon!
        </p>
        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          The stranger hasn’t accepted yours yet — hang tight!
        </p>

        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="openMenu(Menu.SendBalloon)"
        >
          See your balloon
        </ion-button>
      </div>
      <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-28 h-28" />
      <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-28 h-28" />
    </div>

    <div
      v-else-if="user && user.balloon && receivedBalloon"
      class="card bg-green-400"
    >
      <div class="flex-1 pr-3">
        <p class="cabin-sketch-regular text-xl font-bold"> A stranger sent you a balloon!</p>
        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          Open it to see their message and become mates.
        </p>
        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="openMenu(Menu.ReceiveBalloon)"
        >
          Open Balloon
        </ion-button>
      </div>
      <Lottie :json="balloonLottie" :loop="true" :speed="0.5"
              class="w-28 h-28 animate-fade-down animate-duration-2000" />
    </div>

    <!-- Case: already sent a balloon -->
    <div
      v-else-if="user && user.balloon && user.balloon.sent && sentBalloon"
      class="card bg-blue-400 "
    >
      <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-28 h-28 animate-flip-up" />
      <div class="flex-1 pl-3">
        <p class="cabin-sketch-regular text-xl font-bold">Your balloon is flying!</p>
        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          Sit tight — a stranger will send one back soon.
        </p>
        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="openMenu(Menu.SendBalloon)"
        >
          View Sent Balloon
        </ion-button>
      </div>
    </div>

    <!-- Case: no balloon yet -->
    <div
      v-else-if="user"
      class="card bg-warning"
    >
      <div class="flex-1 pr-3">
        <p class="cabin-sketch-regular text-xl font-bold">Send a balloon!</p>
        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          Release a balloon into the sky and connect with a stranger.
        </p>
        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="openMenu(Menu.SendBalloon)"
        >
          Send Balloon
        </ion-button>
      </div>
      <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-28 h-28" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { Menu } from '@/draw/types/draw.types'
import { IonButton } from '@ionic/vue'
import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import balloonLottie from '@/assets/lottie/balloon.json'
import Lottie from '@/components/general/Lottie.vue'
import { useAPI } from '@/service/api/api.service'
import { useBalloonStore } from '@/store/balloon.store'

const { openMenu } = useMenuStore()
const { user, socialFeaturesAllowed } = storeToRefs(useAuthStore())
const { sentBalloon, receivedBalloon } = storeToRefs(useBalloonStore())


</script>


<style scoped>
@reference "@/theme/main.css";
.card {
  @apply w-full mx-auto rounded-xl p-4 max-w-96  flex justify-between items-center shadow-md;
}
</style>