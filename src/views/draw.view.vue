<template>
  <ion-page>
    <ion-header>
      <Toolbars />
    </ion-header>
    <ion-content>
      <div class="absolute inset-0 flex m-0 pointer-none:">
        <canvas ref="myCanvasRef" class="w-full h-full " />
      </div>


      <div class="flex justify-center items-center absolute bottom-4 w-full">
        <div id="clickOutside" />
        <ion-button v-if="canResetView" @click="resetZoom" color="secondary" shape="round">
          <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
          Reset view
        </ion-button>
      </div>

      <ion-progress-bar type="indeterminate" class="absolute bottom-[0] z-50 h-1.5" color="secondary"
                        v-if="isSendingDrawing" />
    </ion-content>
    <!--    <VTour :steps="currDataSteps" ref="tour" :autoStart="true" />-->

    <!--    <transition name="slide">-->
    <!--      <div-->
    <!--        class="w-[300px] absolute top-[50px] right-2 bg-primary z-10 rounded-md p-3 text-black"-->
    <!--        v-show="showTipBox"-->
    <!--        ref="tooltip"-->
    <!--      >-->
    <!--        <div class="flex justify-between">-->
    <!--          <p class="text-xl font-semibold">{{ tipBoxTitle }}</p>-->
    <!--          <ion-icon :icon="svg(mdiClose)" class="w-[20px] h-[20px] cursor-pointer" @click="clearTip" />-->
    <!--        </div>-->
    <!--        <p class="text-base">{{ tipBoxContent }}</p>-->
    <!--      </div>-->
    <!--    </transition>-->
    <DrawMenus />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, IonIcon, IonProgressBar } from '@ionic/vue'

import { nextTick, onMounted, ref } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { svg } from '@/helper/general.helper'
import { mdiClose, mdiMagnifyMinusOutline } from '@mdi/js'
import '@/theme/custom_vuejs_tour.scss'
import { tutorialSteps } from '@/config/draw/draw.config'
import { useSwipe } from '@vueuse/core'
import { useAuthStore } from '@/store/auth.store'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import { useToast } from '@/service/toast.service'
import { resetZoom } from '@/helper/draw/drawInit.helper'

const myCanvasRef = ref<HTMLCanvasElement>()
const { toast } = useToast()

const drawStore = useDrawStore()
const { canResetView, showLoadingBackdrop } = storeToRefs(drawStore)


const { isSendingDrawing } = storeToRefs(useAuthStore())

const currDataSteps = ref(tutorialSteps)


onMounted(() => {
  // Ionic sometimes needs two frames for style + layout to settle, otherwise the width and height are empty
  requestAnimationFrame(() => {
    drawStore.initCanvas(myCanvasRef.value!)
  })
})


const showTipBox = ref(false)
const tipBoxContent = ref('')
const tipBoxTitle = ref('')

let didShowEnterSelectTip = false
let didShowSelectTip = false
let didShowMultiSelectTip = false
let hideTipTimeout: any = undefined

const tooltip = ref()
useSwipe(tooltip, {
  onSwipeEnd() {
    clearTip()
  }
})

function showTip(content: string, title = 'Tip', duration = 8000) {
  clearTimeout(hideTipTimeout)
  showTipBox.value = true
  tipBoxContent.value = content
  tipBoxTitle.value = title
  hideTipTimeout = setTimeout(() => (showTipBox.value = false), duration)
}

function clearTip() {
  clearTimeout(hideTipTimeout)
  hideTipTimeout = undefined
  showTipBox.value = false
}

//
// if (!localStorage.getItem(LocalStorage.selectTip)) localStorage.setItem(LocalStorage.selectTip, '2')
// if (parseInt(localStorage.getItem(LocalStorage.selectTip)!) > 0) {
//   watch(selectedObjectsRef, () => {
//     if (didShowSelectTip || parseInt(localStorage.getItem(LocalStorage.selectTip)!) == 0) return
//     if (selectedObjectsRef.value.length > 0) {
//       showTip(
//         'Move, rotate, scale objects and more! Exit by tapping outside or pressing the \'X\' in the upper left.',
//         'Select Mode',
//         10000
//       )
//       localStorage.setItem(LocalStorage.selectTip, `${parseInt(localStorage.getItem(LocalStorage.selectTip)!) - 1}`)
//       didShowSelectTip = true
//     }
//   })
// }
//
// if (!localStorage.getItem(LocalStorage.selectHint)) localStorage.setItem(LocalStorage.selectHint, '2')
// if (parseInt(localStorage.getItem(LocalStorage.selectHint)!) > 0) {
//   watch(selectedTool, () => {
//     if (didShowEnterSelectTip || parseInt(localStorage.getItem(LocalStorage.selectHint)!) == 0) return
//     if (selectedTool.value == DrawTool.Select)
//       if (drawStore.getCanvas().getObjects().length > 0) {
//         showTip('Tap on an object to select it')
//         localStorage.setItem(LocalStorage.selectHint, `${parseInt(localStorage.getItem(LocalStorage.selectHint)!) - 1}`)
//         didShowEnterSelectTip = true
//       } else {
//         showTip('Create an object before you can select it')
//       }
//   })
// }
//
// let t1: any
// if (!localStorage.getItem(LocalStorage.multiSelectHint)) localStorage.setItem(LocalStorage.multiSelectHint, '2')
// if (parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) > 0) {
//   clearTimeout(t1)
//   watch(selectedObjectsRef, () => {
//     if (didShowMultiSelectTip || parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) == 0) return
//     if (selectedObjectsRef.value.length == 1 && drawStore.getCanvas().getObjects().length > 1 && !showTipBox.value) {
//       t1 = setTimeout(() => {
//         if (showTipBox.value) return
//         if (isMobile()) showTip('Long tap object to enter multi select mode')
//         else showTip('Hold shift while tapping on an object to multi select')
//         localStorage.setItem(
//           LocalStorage.multiSelectHint,
//           `${parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) - 1}`
//         )
//         didShowMultiSelectTip = true
//       }, 50)
//     }
//   })
// }
</script>

<style scoped>
ion-content {
  --background: var(--ion-color-primary);
}

/* Starting state (entering) */
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

/* Enter end state */
.slide-enter-to {
  opacity: 1;
  transform: translateX(0);
}

/* Leave start state */
.slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

/* Leave end state */
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
