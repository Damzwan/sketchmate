<template>
  <ion-page id="root">
    <LinearLoader :text="loadingText" class="absolute z-50" v-if="isLoading" :darken="true" />
    <ion-header class="ion-no-border">
      <div id="select">
        <ShapeCreationToolbar v-show="shapeCreationMode != undefined || colorPickerMode" />
        <div v-show="shapeCreationMode === undefined && !colorPickerMode">
          <!--        We use v-show instead of v-show to keep the state of the component-->
          <SelectToolBar v-show="selectedObjectsRef.length > 0" class="z-[1000] absolute left-0 top-0" />
          <PrimaryDrawToolBar />
        </div>
      </div>
    </ion-header>
    <ion-content :style="{ background: WHITE }">
      <ShapesMenu />

      <div>
        <div id="canvas">
          <canvas ref="myCanvasRef" />
        </div>
        <div class="w-full h-[50px] bg-primary bottom-0 absolute" v-if="isTrial">
          <ion-button class="w-full h-full p-0 m-0" @click="router.push(FRONTEND_ROUTES.connect)">
            Go back to connect page
          </ion-button>
        </div>
      </div>

      <div class="flex justify-center items-center absolute bottom-4 w-full">
        <div id="clickOutside" />
        <ion-button v-if="canZoomOut" @click="resetZoom" color="secondary" shape="round">
          <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
          Reset zoom
        </ion-button>
      </div>
    </ion-content>
    <VTour :steps="currDataSteps" ref="tour" @onTourEnd="onTourEnd" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, onIonViewDidEnter } from '@ionic/vue'
import PrimaryDrawToolBar from '@/components/draw/toolbar/PrimaryDrawToolBar.vue'

import { computed, onMounted, ref, watch } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import SelectToolBar from '@/components/draw/toolbar/SelectToolBar.vue'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import ShapeCreationToolbar from '@/components/draw/toolbar/ShapeCreationToolbar.vue'
import { resetZoom } from '@/helper/draw/gesture.helper'
import { svg } from '@/helper/general.helper'
import { mdiMagnifyMinusOutline } from '@mdi/js'
import { useSelect } from '@/service/draw/tools/select.tool'
import ShapesMenu from '@/components/draw/menu/ShapesMenu.vue'
import { useRoute } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import '@/theme/custom_vuejs_tour.scss'
import { tutorialSteps, tutorialSteps2, WHITE } from '@/config/draw/draw.config'
import { LocalStorage } from '@/types/storage.types'
import { DrawTool } from '@/types/draw.types'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'
import { dismissButton } from '@/config/toast.config'
import { checkForIntersections } from '@/helper/draw/draw.helper'

const myCanvasRef = ref<HTMLCanvasElement>()

const drawStore = useDrawStore()
const { loadingText, shapeCreationMode, canZoomOut, isLoading, colorPickerMode, selectedTool } = storeToRefs(drawStore)
const { selectedObjectsRef } = storeToRefs(useSelect())

const currDataSteps = ref(tutorialSteps)
const { toast, isOpen } = useToast()

onIonViewDidEnter(async () => {
  await drawStore.initCanvas(myCanvasRef.value!)
})

const route = useRoute()
const isTrial = computed(() => route.query.trial)

const tour = ref()
const isSelectTour = ref(false)

let alreadyShownSelect = false
let alreadyShownMulti = false
let alreadyShownDouble = false

onMounted(() => {
  if (!localStorage.getItem(LocalStorage.tour1)) tour.value.resetTour()
})

if (!localStorage.getItem(LocalStorage.tour2)) {
  watch(selectedObjectsRef, () => {
    if (selectedObjectsRef.value.length > 0 && !localStorage.getItem(LocalStorage.tour2)) {
      document.getElementById('canvas')!.style.pointerEvents = 'none'
      document.getElementById('select')!.style.pointerEvents = 'none'
      currDataSteps.value = tutorialSteps2
      isSelectTour.value = true
      tour.value.resetTour()
    }
  })
}

if (!localStorage.getItem(LocalStorage.selectHint)) localStorage.setItem(LocalStorage.selectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.selectHint)!) > 0) {
  watch(selectedTool, () => {
    if (alreadyShownSelect || parseInt(localStorage.getItem(LocalStorage.selectHint)!) == 0) return
    if (selectedTool.value == DrawTool.Select)
      if (drawStore.getCanvas().getObjects().length > 0) {
        toast('Tap on an object to select it', {
          duration: ToastDuration.long,
          buttons: [dismissButton],
          color: 'secondary'
        })
        localStorage.setItem(LocalStorage.selectHint, `${parseInt(localStorage.getItem(LocalStorage.selectHint)!) - 1}`)
        alreadyShownSelect = true
      } else {
        toast('Create an object before you can select it', {
          duration: ToastDuration.medium,
          buttons: [dismissButton],
          color: 'secondary'
        })
      }
  })
}

if (!localStorage.getItem(LocalStorage.multiSelectHint)) localStorage.setItem(LocalStorage.multiSelectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) > 0) {
  watch(selectedObjectsRef, () => {
    if (
      alreadyShownMulti ||
      parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) == 0 ||
      !localStorage.getItem(LocalStorage.tour2)
    )
      return
    if (selectedObjectsRef.value.length > 0 && drawStore.getCanvas().getObjects().length > 1 && !isOpen.value) {
      toast('Long tap object to enter multi select mode', {
        duration: ToastDuration.long,
        buttons: [dismissButton],
        color: 'secondary'
      })
      localStorage.setItem(
        LocalStorage.multiSelectHint,
        `${parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) - 1}`
      )
      alreadyShownMulti = true
    }
  })
}

if (!localStorage.getItem(LocalStorage.doubleTap)) localStorage.setItem(LocalStorage.doubleTap, '2')
if (parseInt(localStorage.getItem(LocalStorage.doubleTap)!) > 0) {
  watch(selectedObjectsRef, () => {
    if (
      alreadyShownDouble ||
      parseInt(localStorage.getItem(LocalStorage.doubleTap)!) == 0 ||
      !localStorage.getItem(LocalStorage.tour2)
    )
      return
    if (
      selectedObjectsRef.value.length > 0 &&
      drawStore.getCanvas().getObjects().length > 1 &&
      checkForIntersections(drawStore.getCanvas()) &&
      !isOpen.value
    ) {
      toast('Double tap object underneath selected object to select it', {
        duration: ToastDuration.long,
        buttons: [dismissButton],
        color: 'secondary'
      })
      localStorage.setItem(LocalStorage.doubleTap, `${parseInt(localStorage.getItem(LocalStorage.doubleTap)!) - 1}`)
      alreadyShownDouble = true
    }
  })
}

function onTourEnd() {
  localStorage.setItem(isSelectTour.value ? LocalStorage.tour2 : LocalStorage.tour1, 'si')
  if (isSelectTour.value) {
    document.getElementById('canvas')!.style.pointerEvents = 'auto'
    document.getElementById('select')!.style.pointerEvents = 'auto'
  }
}
</script>
