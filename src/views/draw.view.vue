<template>
  <ion-page>
    <LinearLoader :text="loadingText" class="absolute z-50" v-if="isLoading" :darken="true" />
    <ion-header class="ion-no-border">
      <ShapeCreationToolbar v-if="shapeCreationMode != undefined" />
      <div v-else>
        <!--        We use v-show instead of v-if due to a bug-->
        <SelectToolBar v-show="selectedObjectsRef.length > 0" class="z-[1000] absolute left-0 top-0" />
        <PrimaryDrawToolBar />
      </div>
    </ion-header>
    <ion-content>
      <ShapesMenu />

      <div>
        <canvas ref="myCanvasRef" />
        <div class="w-full h-[50px] bg-primary" v-if="isTrial">
          <ion-button class="w-full h-full p-0 m-0" @click="router.push(FRONTEND_ROUTES.connect)">
            Go back to connect page
          </ion-button>
        </div>
      </div>

      <div class="flex justify-center items-center absolute bottom-4 w-full">
        <ion-button v-if="canZoomOut" @click="resetZoom" color="secondary" shape="round">
          <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
          Reset zoom
        </ion-button>
      </div>
    </ion-content>
    <VTour :steps="steps" autoStart />
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, onIonViewDidEnter, popoverController } from '@ionic/vue'
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

const myCanvasRef = ref<HTMLCanvasElement>()

const drawStore = useDrawStore()
const { loadingText, shapeCreationMode, canZoomOut, isLoading } = storeToRefs(drawStore)
const { selectedObjectsRef } = storeToRefs(useSelect())

onIonViewDidEnter(async () => {
  await drawStore.initCanvas(myCanvasRef.value!)
})

const route = useRoute()
const isTrial = computed(() => route.query.trial)

const steps = [
  {
    target: '[data-step="1"]',
    content: `<div>
    <p class="text-xl">Pen</p>
    <p class="text-base">Open the menu to adjust pen style and color.</p>
  </div>`
  },
  {
    target: '[data-step="2"]',
    content: `<div>
    <p class="text-xl">Eraser</p>
    <p class="text-base">Remove strokes, undo erases, or clear canvas.</p>
  </div>`
  },
  {
    target: '[data-step="3"]',
    content: `<div>
    <p class="text-xl">Add Elements</p>
    <p class="text-base">Include stickers, images, text, shapes and saved drawings.</p>
  </div>`
  },
  {
    target: '[data-step="4"]',
    content: `<div>
  <p class="text-xl">Selection</p>
  <p class="text-base">Select to move, rotate, resize, recolor objects. Includes copy, delete, save and merge.</p>
</div>`
  },
  {
    target: '[data-step="5"]',
    content: `<div>
    <p class="text-xl">Lasso</p>
    <p class="text-base">For precise control over selection.</p>
  </div>`
  },
  {
    target: '[data-step="6"]',
    content: `<div>
    <p class="text-xl">Need Help?</p>
    <p class="text-base">Press for tutorials on each section.</p>
  </div>`
  }
]
</script>
