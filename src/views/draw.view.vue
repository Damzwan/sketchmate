<template>
  <ion-page>
    <ion-header></ion-header>
    <ion-content>
      <Toolbars />
      <DrawMenus/>
      <div class="w-full h-full" v-if="showLoadingBackdrop" />


      <div id="canvas">
        <canvas ref="myCanvasRef" />
      </div>

      <div class="flex justify-center items-center absolute bottom-4 w-full">
        <div id="clickOutside" />
        <ion-button v-if="canZoomOut" @click="resetZoom" color="secondary" shape="round">
          <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
          Reset view
        </ion-button>
      </div>

      <ion-progress-bar type="indeterminate" class="absolute bottom-[0] z-50 h-1.5" color="secondary"
                        v-if="isSendingDrawing" />
    </ion-content>
    <VTour :steps="currDataSteps" ref="tour" :autoStart="true" />

    <transition name="slide">
      <div
        class="w-[300px] absolute top-[50px] right-2 bg-primary z-10 rounded-md p-3 text-black"
        v-show="showTipBox"
        ref="tooltip"
      >
        <div class="flex justify-between">
          <p class="text-xl font-semibold">{{ tipBoxTitle }}</p>
          <ion-icon :icon="svg(mdiClose)" class="w-[20px] h-[20px] cursor-pointer" @click="clearTip" />
        </div>
        <p class="text-base">{{ tipBoxContent }}</p>
      </div>
    </transition>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPage, IonProgressBar, onIonViewDidEnter, IonHeader } from '@ionic/vue'

import { ref, watch } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { resetZoom } from '@/helper/draw/gesture.helper'
import { isMobile, svg } from '@/helper/general.helper'
import { mdiClose, mdiMagnifyMinusOutline } from '@mdi/js'
import { useSelect } from '@/service/draw/tools/select.tool'
import '@/theme/custom_vuejs_tour.scss'
import { tutorialSteps } from '@/config/draw/draw.config'
import { LocalStorage } from '@/types/storage.types'
import { DrawTool } from '@/types/draw.types'
import { useSwipe } from '@vueuse/core'
import { useAuthStore } from '@/store/auth.store'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import DrawMenus from '@/components/draw/menu/DrawMenus.vue'

const myCanvasRef = ref<HTMLCanvasElement>()

console.log("Loaded")

const drawStore = useDrawStore()
const { showLoadingBackdrop, canZoomOut, selectedTool } =
  storeToRefs(drawStore)
const { isSendingDrawing } = storeToRefs(useAuthStore())
const { selectedObjectsRef } = storeToRefs(useSelect())

const currDataSteps = ref(tutorialSteps)

onIonViewDidEnter(async () => {
  await drawStore.initCanvas(myCanvasRef.value!)
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

if (!localStorage.getItem(LocalStorage.selectTip)) localStorage.setItem(LocalStorage.selectTip, '2')
if (parseInt(localStorage.getItem(LocalStorage.selectTip)!) > 0) {
  watch(selectedObjectsRef, () => {
    if (didShowSelectTip || parseInt(localStorage.getItem(LocalStorage.selectTip)!) == 0) return
    if (selectedObjectsRef.value.length > 0) {
      showTip(
        'Move, rotate, scale objects and more! Exit by tapping outside or pressing the \'X\' in the upper left.',
        'Select Mode',
        10000
      )
      localStorage.setItem(LocalStorage.selectTip, `${parseInt(localStorage.getItem(LocalStorage.selectTip)!) - 1}`)
      didShowSelectTip = true
    }
  })
}

if (!localStorage.getItem(LocalStorage.selectHint)) localStorage.setItem(LocalStorage.selectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.selectHint)!) > 0) {
  watch(selectedTool, () => {
    if (didShowEnterSelectTip || parseInt(localStorage.getItem(LocalStorage.selectHint)!) == 0) return
    if (selectedTool.value == DrawTool.Select)
      if (drawStore.getCanvas().getObjects().length > 0) {
        showTip('Tap on an object to select it')
        localStorage.setItem(LocalStorage.selectHint, `${parseInt(localStorage.getItem(LocalStorage.selectHint)!) - 1}`)
        didShowEnterSelectTip = true
      } else {
        showTip('Create an object before you can select it')
      }
  })
}

let t1: any
if (!localStorage.getItem(LocalStorage.multiSelectHint)) localStorage.setItem(LocalStorage.multiSelectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) > 0) {
  clearTimeout(t1)
  watch(selectedObjectsRef, () => {
    if (didShowMultiSelectTip || parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) == 0) return
    if (selectedObjectsRef.value.length == 1 && drawStore.getCanvas().getObjects().length > 1 && !showTipBox.value) {
      t1 = setTimeout(() => {
        if (showTipBox.value) return
        if (isMobile()) showTip('Long tap object to enter multi select mode')
        else showTip('Hold shift while tapping on an object to multi select')
        localStorage.setItem(
          LocalStorage.multiSelectHint,
          `${parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) - 1}`
        )
        didShowMultiSelectTip = true
      }, 50)
    }
  })
}
</script>

<style scoped>
ion-content {
  --background: #faf0e6;
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
