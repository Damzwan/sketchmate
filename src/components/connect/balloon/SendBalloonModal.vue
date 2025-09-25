<template>
  <ion-modal
    :initial-breakpoint="1"
    :breakpoints="[1]"
    @willPresent="initCanvas"
    @willDismiss="onDismiss"
    :is-open="sendBalloonModalOpen"
    :handle="false"
  >
    <div class="bg-primary p-4">
      <div v-show="state == State.create">
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

        <PenMenu />
        <EraserMenu />

        <div class="mx-auto w-[300px]">
          <div class="flex justify-between items-center w-full bg-primary-shade h-[42px] px-1">
            <div class="flex gap-5">
              <button @click="onPenClick" class="h-full aspect-square flex justify-center items-center relative"
                      :class="{selected: PENMENUTOOLS.includes(selectedTool)}">
                <ion-icon :icon="svg(penMenuIcon)" class="fill-black h-[28px] w-[28px]" />
                <div class="w-2 h-2 rounded-full absolute bottom-[1px] right-[-5px]"
                     :style="{backgroundColor: brushColor}" />

                <div class="selected_chevron"
                     v-if="PENMENUTOOLS.includes(selectedTool)">
                  <ion-icon :icon="svg(mdiChevronDown)" class="w-[20px] h-[20px]" />
                </div>
              </button>

              <button @click="onEraserClick" class="h-full aspect-square flex justify-center items-center relative"
                      :class="{selected: ERASERS.includes(selectedTool)}">
                <ion-icon :icon="svg(eraserMenuIcon)" class="fill-black h-[28px] w-[28px]" />

                <div class="selected_chevron"
                     v-if="ERASERS.includes(selectedTool)">
                  <ion-icon :icon="svg(mdiChevronDown)" class="w-[20px] h-[20px]" />
                </div>
              </button>
            </div>

            <div class="flex">
              <ion-button fill="clear" @click="() => history.undo()" :disabled="undoStackCounter === 0">
                <ion-icon :icon="svg(mdiUndo)" class="fill-black h-[28px] w-[28px]" slot="icon-only" />

              </ion-button>

              <ion-button fill="clear" @click="() => history.redo()" :disabled="redoStackCounter === 0">
                <ion-icon :icon="svg(mdiRedo)" class="fill-black h-[28px] w-[28px]" slot="icon-only" />

              </ion-button>

            </div>
          </div>
          <canvas ref="myCanvasRef" />


        </div>
        <div class="flex justify-center items-center absolute bottom-8 w-full mx-auto">
          <ion-button v-if="canZoomOut" @click="resetZoom" color="secondary" shape="round">
            <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
            Reset view
          </ion-button>
        </div>
      </div>

      <div v-if="state === State.sending"
           class="h-[550px] w-full relative overflow-hidden flex flex-col">

        <!-- Floating Balloon + Drawing -->
        <div class="relative h-[400px] flex justify-center items-end animate-float w-full">
          <!-- Lottie Balloon -->
          <Lottie
            :json="balloon"
            :loop="true"
            class="h-[150px] absolute left-[-10px] top-6"
          />

          <!-- Drawing Image -->
          <img
            v-if="drawingImg"
            :src="drawingImg"
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


      <div v-else-if="state === State.sent" class=" w-full relative flex flex-col items-center">
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
    <ion-fab class="bottom-4 right-4" @click="sendBalloon" v-if="state === State.create">
      <ion-fab-button color="secondary" :disabled="!didStartDrawing">
        <ion-icon :icon="svg(mdiSend)"></ion-icon>
      </ion-fab-button>
    </ion-fab>
  </ion-modal>
</template>


<script setup lang="ts">

import Lottie from '@/components/general/Lottie.vue'
import { IonButton, IonFab, IonFabButton, IonIcon, IonModal, IonTextarea, modalController } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useToast } from '@/service/toast.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { fabric } from 'fabric'
import { eraserIconMapping, ERASERS, penIconMapping, PENMENUTOOLS } from '@/config/draw/draw.config'
import PenMenu from '@/components/draw/menu/PenMenu.vue'
import { useMenuStore } from '@/store/draw/menu.store'
import { DrawAction, DrawEvent, DrawTool } from '@/types/draw.types'
import { usePen } from '@/service/draw/tools/pen.tool'
import EraserMenu from '@/components/draw/menu/EraserMenu.vue'
import { useHistory } from '@/service/draw/history.service'
import { useEraser } from '@/service/draw/tools/eraser.tool'
import { mdiChevronDown, mdiFormatColorFill, mdiMagnifyMinusOutline, mdiRedo, mdiSend, mdiUndo } from '@mdi/js'
import { useDrawStore } from '@/store/draw/draw.store'
import { getDateOfBirthConfirmationResponse, svg } from '@/helper/general.helper'
import { useHealingEraser } from '@/service/draw/tools/healingEraser.tool'
import { useEventManager } from '@/service/draw/eventManager.service'
import balloon from '@/assets/lottie/balloon.json'
import { useAPI } from '@/service/api/api.service'
import { ToastDuration } from '@/types/toast.types'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { useSocketService } from '@/service/api/socket.service'
import { resetZoom } from '@/helper/draw/gesture.helper'

enum State {
  create,
  sending,
  sent
}

const { toast } = useToast()
const { user, sentBalloon, receivedBalloon, shouldShowDateOfBirthConfirmation } = storeToRefs(useAuthStore())

const history = useHistory()
const { undoStackCounter, redoStackCounter } = storeToRefs(history)
const pen = usePen()
const { brushType, brushColor } = storeToRefs(pen)
const eraser = useEraser()
const healingEraser = useHealingEraser()


const state = ref<State>(State.create)

const myCanvasRef = ref<HTMLCanvasElement>()
let c: fabric.Canvas | null = null

const { openMenu } = useMenuStore()
const { selectedTool, lastSelectedPenMenuTool, lastSelectedEraserTool, canZoomOut } = storeToRefs(useDrawStore())
const drawStore = useDrawStore()

const eventManager = useEventManager()
const didStartDrawing = ref(false)

const drawingImg = ref<string | null>(null)
const balloonDescription = ref('')

const { getBalloon } = useAPI()
const { sendBalloonModalOpen } = storeToRefs(useMenuStore())

const { cancelBalloon } = useSocketService()


const penMenuIcon = computed(() => lastSelectedPenMenuTool.value == DrawTool.Pen
  ? penIconMapping[brushType.value]
  : mdiFormatColorFill)


const eraserMenuIcon = computed(() => eraserIconMapping[lastSelectedEraserTool.value])


async function initCanvas() {
  if (user.value!.balloon && user.value!.balloon.sent) {
    state.value = State.sent
    sentBalloon.value = await getBalloon({ balloonId: user.value!.balloon.sent })
    return
  }

  state.value = State.create
  if (!myCanvasRef.value) return

  await drawStore.initCanvas(myCanvasRef.value, { width: 300, height: 400 })

  eventManager.subscribe({
    type: DrawEvent.AddText, on: 'mouse:down', handler: (options) => {
      didStartDrawing.value = true

      if (options.e) {
        options.e.stopPropagation()
      }
    }
  })

  eventManager.subscribe({
    type: DrawEvent.AddText, on: 'touch:start', handler: (options) => {
      didStartDrawing.value = true
      if (options.e) {
        options.e.stopPropagation()
      }
    }
  })

  drawStore.selectAction(DrawAction.FullErase)


}

function onPenClick(e: MouseEvent) {
  drawStore.selectTool(lastSelectedPenMenuTool.value, { e, openMenu: true })
}

function onEraserClick(e: MouseEvent) {
  drawStore.selectTool(lastSelectedEraserTool.value, { e, openMenu: true })
}

async function sendBalloon() {

  if (shouldShowDateOfBirthConfirmation.value) {
    const canSendBalloon = await getDateOfBirthConfirmationResponse()
    if (!canSendBalloon) {
      sendBalloonModalOpen.value = false
      return
    }
  }

  state.value = State.sending
  drawingImg.value = drawStore.getCanvas().toDataURL({ format: 'jpeg', quality: 0.7 })

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
    toast('Balloon sent!', { duration: ToastDuration.long })
  }, timeout)
}


function onDismiss() {
  if (drawStore.getCanvas()) drawStore.selectAction(DrawAction.FullErase)
  sendBalloonModalOpen.value = false
}

function cancelBalloonHelper() {
  if (!user.value?.balloon?.sent) return
  cancelBalloon({ user_id: user.value!._id, balloon_id: user.value!.balloon!.sent })
  user.value!.balloon = undefined
  receivedBalloon.value = undefined
  state.value = State.create
  initCanvas()
}


</script>

<style scoped>
ion-modal {
  --height: auto;
}

.selected_chevron {
  @apply cursor-pointer w-[20px] h-[20px] absolute right-[-15px] bottom-[5px];
}

.selected::after {
  content: '';
  display: block;
  position: absolute;
  bottom: -2px;
  left: 10%;
  width: 80%;
  height: 3px;
  background-color: var(--ion-color-secondary);
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