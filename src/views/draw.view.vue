<template>
  <ion-page>
    <TopSafeArea :color="primaryColor" />

    <ion-content class="my-safe-area">

      <div class="flex flex-col h-full">
        <Toolbars />

        <div class="grow flex m-0 pointer-none:">
          <canvas ref="myCanvasRef" class="w-full h-full " id="mainCanvas" />
        </div>

        <ResetZoomButton />
      </div>

      <ion-progress-bar
        type="indeterminate"
        class="absolute bottom-0 z-50 h-1.5"
        color="secondary"
        v-if="isSendingDrawing"
      />
    </ion-content>

    <Tutorial />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage, IonProgressBar, onIonViewDidEnter, IonHeader } from '@ionic/vue'

import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import '@/theme/custom_vuejs_tour.scss'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import Tutorial from '@/components/draw/Tutorial.vue'
import ResetZoomButton from '@/components/draw/ResetZoomButton.vue'
import TopSafeArea from '@/components/general/TopSafeArea.vue'
import { primaryColor } from '@/config/colors.config'


const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
const { isSendingDrawing } = storeToRefs(useDrawStore())


onIonViewDidEnter(() => {
  requestAnimationFrame(() => {
    console.log(myCanvasRef.value)
    initCanvas(myCanvasRef.value!)
  })
})


</script>

<style scoped>

</style>
