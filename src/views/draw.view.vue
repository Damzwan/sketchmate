<template>
  <ion-page>
    <TopSafeArea :color="primaryColor" />


    <div class="flex flex-col h-full safe-area">
      <Toolbars />

      <div
        class="grow flex m-0 pointer-none"
        :class="{ 'pointer-events-none opacity-50': disconnectedRoomId }"
      >
        <canvas ref="myCanvasRef" class="w-full h-full" id="mainCanvas" />
      </div>

      <ResetZoomButton />
    </div>

    <ion-progress-bar
      type="indeterminate"
      class="absolute bottom-0 z-50 h-1.5"
      color="secondary"
      v-if="isSendingDrawing"
    />

    <Tutorial />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage, IonProgressBar, onIonViewDidEnter } from '@ionic/vue'

import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import '@/theme/custom_vuejs_tour.scss'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import Tutorial from '@/components/draw/Tutorial.vue'
import ResetZoomButton from '@/components/draw/ResetZoomButton.vue'
import TopSafeArea from '@/components/general/TopSafeArea.vue'
import { primaryColor } from '@/config/colors.config'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'


const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
const { isSendingDrawing } = storeToRefs(useDrawStore())
const {disconnectedRoomId} = storeToRefs(useDrawSyncer())


onIonViewDidEnter(() => {
  requestAnimationFrame(() => {
    initCanvas(myCanvasRef.value!)
  })
})


</script>

<style scoped>

</style>
