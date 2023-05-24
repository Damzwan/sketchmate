<template>
  <ion-page>
    <LinearLoader text="Sending image..." class="absolute z-50" v-if="isLoading" />
    <ion-header class="ion-no-border bg-white">
      <SelectToolBar v-if="selectedObjectsRef.length > 0" />
      <PrimaryDrawToolBar v-else />
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
import { disableHistorySaving, enableHistorySaving, renderIcon, selectPen } from '@/helper/draw.helper'
import SelectToolBar from '@/components/draw/SelectToolBar.vue'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { useAppStore } from '@/store/app.store'
import { WHITE } from '@/config/draw.config'
import { mdiDelete } from '@mdi/js'
import { pencil } from 'ionicons/icons'
import { svg } from '@/helper/general.helper'
import StickerMenu from '@/components/draw/StickerMenu.vue'

const myCanvasRef = ref<HTMLCanvasElement>()

const { isLoading } = storeToRefs(useAppStore())
const drawStore = useDrawStore()
const { isDrawingMode, jsonToLoad, selectedObjectsRef } = storeToRefs(drawStore)

// TODO interesting
// const cloneImg = document.createElement('img')
// cloneImg.src = svg(mdiDelete)
//
// fabric.Object.prototype.controls.deleteControl = new fabric.Control({
//   x: 0.5,
//   y: -0.5,
//   offsetY: -16,
//   offsetX: 16,
//   cursorStyle: 'pointer',
//   mouseUpHandler: () => false,
//   render: renderIcon(cloneImg),
//   cornerSize: 20
// })

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
