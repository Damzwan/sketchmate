<template>
  <ion-page>
    <LinearLoader :text="loadingText" class="absolute z-50" v-if="isLoading" />
    <ion-header class="ion-no-border bg-white">
      <ShapeCreationToolbar v-if="shapeCreationMode != undefined" />
      <div v-else>
        <SelectToolBar v-if="selectedObjectsRef.length > 0" />
        <PrimaryDrawToolBar v-else />
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
import { IonContent, IonHeader, IonPage, onIonViewDidEnter, IonIcon, IonButton } from '@ionic/vue'
import PrimaryDrawToolBar from '@/components/draw/PrimaryDrawToolBar.vue'

import { ref } from 'vue'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import {
  changeFabricBaseSettings,
  disableHistorySaving,
  enableHistorySaving,
  selectPen
} from '@/helper/draw/draw.helper'
import SelectToolBar from '@/components/draw/SelectToolBar.vue'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { useAppStore } from '@/store/app.store'
import { WHITE } from '@/config/draw.config'
import SavedMenu from '@/components/draw/SavedMenu.vue'
import ShapeCreationToolbar from '@/components/draw/ShapeCreationToolbar.vue'
import ShapesMenu from '@/components/draw/ShapesMenu.vue'
import { useToast } from '@/service/toast.service'
import { DrawTool } from '@/types/draw.types'
import { enableZoomAndPan, resetZoom } from '@/helper/draw/gesture.helper'
import { svg } from '@/helper/general.helper'
import { mdiAbacus, mdiMagnifyMinusOutline } from '@mdi/js'

const myCanvasRef = ref<HTMLCanvasElement>()

const { isLoading } = storeToRefs(useAppStore())
const drawStore = useDrawStore()
const { toast } = useToast()
const { jsonToLoad, selectedObjectsRef, loadingText, shapeCreationMode, canZoomOut } = storeToRefs(drawStore)

changeFabricBaseSettings()

onIonViewDidEnter(async () => {
  if (!drawStore.retrieveCanvas()) {
    drawStore.storeCanvas(
      new fabric.Canvas(myCanvasRef.value!, {
        isDrawingMode: true,
        width: window.innerWidth,
        height: window.innerHeight - 46 - 50,
        backgroundColor: WHITE,
        fireMiddleClick: true,
        preserveObjectStacking: true
      })
    )
  }
  const c = drawStore.retrieveCanvas()

  disableHistorySaving(c!)
  if (jsonToLoad.value) {
    await new Promise<void>(resolve => {
      c!.clear()
      c!.loadFromJSON(jsonToLoad.value, () => {
        const json = jsonToLoad.value as any

        c!.width = window.innerWidth
        c!.height = window.innerHeight - 46 - 50

        const scaleX = c!.width / json['width']
        const scaleY = c!.height! / json['height']

        const objects = c!.getObjects() // Get objects from the canvas
        for (const obj of objects as any[]) {
          obj.scaleX *= scaleX
          obj.scaleY *= scaleY
          obj.left *= scaleX
          obj.top *= scaleY
        }

        c!.setZoom(1) // Set zoom back to 1 after scaling
        jsonToLoad.value = undefined
        c!.renderAll() // Re-render the canvas
        resolve()
      })
    })
  }

  drawStore.selectTool(DrawTool.Pen, undefined, false)
  enableHistorySaving(c!)
})
</script>
