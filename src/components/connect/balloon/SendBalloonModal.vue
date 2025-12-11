<template>
  <ion-modal
    :initial-breakpoint="1"
    :breakpoints="[1]"
    @willDismiss="onDismiss"
    :is-open="sendBalloonModalOpen"
    :handle="false"
  >
    <div class="bg-primary p-4">
      <div v-show="!sentBalloon &&  state == State.create">
        <p class="text-2xl font-semibold cabin-sketch-regular">
          Send a balloon
        </p>

        <p class="text-sm cabin-sketch-regular">
          Create a drawing and send it up in the air. You will exchange balloons with a stranger and you might get to
          connect!
        </p>

        <ion-textarea
          label="Balloon text"
          label-placement="floating"
          color="secondary"
          fill="outline"
          placeholder="I am a very friendly person 🦀"
          class="py-2"
          v-model="balloonDescription"
        />


        <div class="flex w-full justify-center items-center">
          <img
            v-if="canvasPreview"
            :src="canvasPreview"
            @click="() => openMenu(Menu.DrawMenu)"
            class="max-w-64 max-h-64 object-contain rounded-lg cursor-pointer shadow"
          />

          <div
            v-else
            @click="() => {
              openMenu(Menu.DrawMenu)
              didStartDrawing = true
            }"
            class="w-64 h-64 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 cursor-pointer shadow hover:border-gray-500 transition bg-gray-50"
          >
            <ion-icon :icon="pencil" class="text-gray-400 text-4xl mb-2"></ion-icon>
            <span class="text-gray-500 text-center">Click to draw</span>
          </div>
        </div>

        <ion-fab class="bottom-4 right-4" @click="sendBalloon">
          <ion-fab-button color="secondary" :disabled="!didStartDrawing">
            <ion-icon :icon="svg(mdiSend)"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </div>

      <div v-if=" state === State.sending"
           class="h-[550px] w-full relative overflow-hidden flex flex-col">

        <!-- Floating balloon + Drawing -->
        <div class="relative h-[400px] flex justify-center items-end animate-float w-full">
          <!-- Lottie balloon -->
          <Lottie
            :json="balloon"
            :loop="true"
            class="h-[150px] absolute left-[-10px] top-6"
          />

          <!-- Drawing Image -->
          <img
            v-if="canvasPreview"
            :src="canvasPreview"
            alt="drawing"
            class=" max-h-[250px] max-w-[80%] animate-wiggle animate-duration-1000"
          />
        </div>

        <!-- Text -->
        <div class="absolute bottom-4 w-full flex flex-col items-center text-center">
          <p class="text-3xl cabin-sketch-regular font-bold">Sending balloon to someone!</p>
          <p class="text-xl cabin-sketch-regular">You will receive a balloon sometime in the future</p>
        </div>

      </div>


      <div v-else-if="sentBalloon" class=" w-full relative flex flex-col items-center">
        <p class="text-3xl cabin-sketch-regular font-bold text-center ">You already sent a balloon</p>
        <p class="text-xl cabin-sketch-regular font-bold text-center">Wait a bit longer to receive one from a
          stranger!</p>
        <img :src="sentBalloon.thumbnail" alt="" v-if="sentBalloon" class="h-[300px] my-2">

        <ion-button color="secondary" fill="clear" id="delete-balloon"
        >Cancel balloon
        </ion-button>
        <ConfirmationAlert header="Are you sure?" message="Your balloon will be deleted" trigger="delete-balloon"
                           @confirm="cancelBalloonHelper" />
      </div>

    </div>

  </ion-modal>
</template>


<script setup lang="ts">

import Lottie from '@/components/general/Lottie.vue'
import { IonButton, IonFab, IonFabButton, IonIcon, IonModal, IonTextarea, modalController } from '@ionic/vue'
import { ref } from 'vue'
import { useToast } from '@/service/toast.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { DrawAction, Menu } from '@/draw/types/draw.types'
import { mdiSend } from '@mdi/js'
import { useDrawStore } from '@/draw/store/draw.store'
import { getDateOfBirthConfirmationResponse, svg } from '@/helper/general.helper'
import balloon from '@/assets/lottie/balloon.json'
import { ToastDuration } from '@/types/toast.types'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { useSocketService } from '@/service/api/socket.service'
import { useBalloonStore } from '@/store/balloon.store'
import { EventBus } from '@/main'
import { exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { pencil } from 'ionicons/icons'

enum State {
  create,
  sending,
}

const { toast } = useToast()
const { user, shouldShowDateOfBirthConfirmation } = storeToRefs(useAuthStore())
const { sentBalloon, receivedBalloon } = storeToRefs(useBalloonStore())
const { sendBalloonModalOpen } = storeToRefs(useMenuStore())
const { openMenu } = useMenuStore()
const { cancelBalloon } = useSocketService()
const drawStore = useDrawStore()


const state = ref<State>(State.create)
const didStartDrawing = ref(false)

const balloonDescription = ref('')

const canvasPreview = ref('')

EventBus.on('drawModalClosed', () => {
  exportBoundingBoxImage(drawStore.getCanvas()).then(url => {
    if (!url) return
    canvasPreview.value = url.img
  })
})


async function sendBalloon() {

  if (shouldShowDateOfBirthConfirmation.value) {
    const canSendBalloon = await getDateOfBirthConfirmationResponse()
    if (canSendBalloon == 'cancel' || canSendBalloon == 'notAllowed') {
      if (canSendBalloon == 'notAllowed') sendBalloonModalOpen.value = false
      return
    }
  }

  state.value = State.sending
  const startTime = performance.now()
  const res = await drawStore.createBalloon(balloonDescription.value)

  const endTime = performance.now()
  const duration = endTime - startTime

  if (!res) {
    toast('Something went wrong, try again later', { color: 'danger' })
    modalController.dismiss()
    return
  }

  if (!user.value?.balloon) {
    user.value!.balloon = {}
  }
  sentBalloon.value = res.balloon
  user.value!.balloon.sent = res.balloon._id

  const maxDuration = 4000 // total desired time
  const timeout = Math.max(maxDuration - duration, 0)

  setTimeout(() => {
    sendBalloonModalOpen.value = false
    toast('balloon sent!', { duration: ToastDuration.long })
  }, timeout)
}


function onDismiss() {
  sendBalloonModalOpen.value = false
  state.value = State.create
}

function cancelBalloonHelper() {
  if (!user.value?.balloon?.sent) return
  cancelBalloon({ user_id: user.value!._id, balloon_id: user.value!.balloon!.sent })
  user.value!.balloon = undefined
  receivedBalloon.value = undefined
  sentBalloon.value = undefined
  state.value = State.create
}


</script>

<style scoped>
ion-modal {
  --height: auto;
}

@keyframes float {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-500px);
  }
}

.animate-float {
  animation: float 7s linear infinite; /* adjust speed */
}

</style>