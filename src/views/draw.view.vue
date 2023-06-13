<template>
  <ion-page>
    <LinearLoader :text="loadingText" class="absolute z-50" v-if="isLoading" :darken="true" />
    <ion-header class="ion-no-border bg-white">
      <ShapeCreationToolbar v-if="shapeCreationMode != undefined" />
      <div v-else>
        <!--        We use v-show instead of v-if due to a bug-->
        <SelectToolBar v-show="selectedObjectsRef.length > 0" class="z-[1000] absolute left-0 top-0" />
        <PrimaryDrawToolBar />
      </div>
    </ion-header>
    <ion-content>
      <div>
        <canvas ref="myCanvasRef" />
      </div>
      <SavedMenu />
      <ShapesMenu />

      <div class="flex justify-center items-center absolute bottom-4 w-full">
        <ion-button v-if="canZoomOut" @click="resetZoom" color="secondary" shape="round">
          <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
          Reset zoom
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonPage, onIonViewDidEnter } from '@ionic/vue'
import PrimaryDrawToolBar from '@/components/draw/toolbar/PrimaryDrawToolBar.vue'

import { ref } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import SelectToolBar from '@/components/draw/toolbar/SelectToolBar.vue'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { useAppStore } from '@/store/app.store'
import SavedMenu from '@/components/draw/menu/SavedMenu.vue'
import ShapeCreationToolbar from '@/components/draw/toolbar/ShapeCreationToolbar.vue'
import ShapesMenu from '@/components/draw/menu/ShapesMenu.vue'
import { resetZoom } from '@/helper/draw/gesture.helper'
import { svg } from '@/helper/general.helper'
import { mdiMagnifyMinusOutline } from '@mdi/js'
import { useSelect } from '@/service/draw/tools/select.tool'

const myCanvasRef = ref<HTMLCanvasElement>()

const drawStore = useDrawStore()
const { loadingText, shapeCreationMode, canZoomOut, isLoading } = storeToRefs(drawStore)
const { selectedObjectsRef } = storeToRefs(useSelect())

onIonViewDidEnter(async () => {
  await drawStore.initCanvas(myCanvasRef.value!)
})
</script>
