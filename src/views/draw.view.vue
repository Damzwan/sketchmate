<template>
  <ion-page>
    <LinearLoader text="Sending image..." class="absolute z-50" v-if="isLoading" />
    <ion-header class="ion-no-border bg-white">
      <SelectToolBar v-if="selectedObjectsRef.length > 0" />
      <div v-else>
        <PrimaryDrawToolBar />
        <SecondaryDrawToolBar v-if="secondaryToolBarOpen" />
      </div>
    </ion-header>
    <ion-content>
      <div>
        <canvas ref="myCanvasRef" />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, onIonViewDidEnter } from '@ionic/vue'
import PrimaryDrawToolBar from '@/components/draw/PrimaryDrawToolBar.vue'

import { ref } from 'vue'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import { disableHistorySaving, enableHistorySaving, selectPen } from '@/helper/draw.helper'
import SelectToolBar from '@/components/draw/SelectToolBar.vue'
import SecondaryDrawToolBar from '@/components/draw/SecondaryDrawToolBar.vue'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { useAppStore } from '@/store/app.store'
import { WHITE } from '@/config/draw.config'

const myCanvasRef = ref<HTMLCanvasElement>()

const { isLoading } = storeToRefs(useAppStore())
const drawStore = useDrawStore()
const { isDrawingMode, jsonToLoad, selectedObjectsRef, secondaryToolBarOpen } = storeToRefs(drawStore)

onIonViewDidEnter(async () => {
  if (!drawStore.retrieveCanvas()) {
    drawStore.storeCanvas(
      new fabric.Canvas(myCanvasRef.value!, {
        isDrawingMode: isDrawingMode.value,
        width: window.innerWidth,
        height: window.innerHeight - 46 - 50,
        backgroundColor: WHITE
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

  selectPen(c!)
  enableHistorySaving(c!)
})
</script>
