<template>
  <ion-page>
    <ion-header>
      <Toolbars />
    </ion-header>
    <ion-content>
      <div class="absolute inset-0 flex m-0 pointer-none:">
        <canvas ref="myCanvasRef" class="w-full h-full " />
      </div>


      <ion-progress-bar type="indeterminate" class="absolute bottom-0 z-50 h-1.5" color="secondary"
                        v-if="isSendingDrawing" />
    </ion-content>

    <Tutorial />
    <DrawMenus />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, IonProgressBar } from '@ionic/vue'

import { onMounted, ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import '@/theme/custom_vuejs_tour.scss'
import { useAuthStore } from '@/store/auth.store'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import Tutorial from '@/components/draw/Tutorial.vue'

const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
const { isSendingDrawing } = storeToRefs(useAuthStore())


onMounted(() => {
  // Ionic sometimes needs two frames for style + layout to settle, otherwise the width and height are empty
  requestAnimationFrame(() => {
    initCanvas(myCanvasRef.value!)
  })
})


</script>

<style scoped>
ion-content {
  --background: var(--ion-color-primary);
}


</style>
