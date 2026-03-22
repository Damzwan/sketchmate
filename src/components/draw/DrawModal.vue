<template>
  <ion-modal @didPresent="init" :is-open="drawMenuOpen" @didDismiss="drawMenuOpen = false" :keep-contents-mounted="true"
             @willDismiss="() => { EventBus.emit('drawModalClosed')}">
    <div class="w-full h-full flex flex-col safe-area">
      <TopSafeArea :color="primaryColor" />
      <Toolbars />
      <div class="absolute inset-0 flex m-0 pointer-none " :style="{background: BACKGROUND}">
        <canvas ref="myCanvasRef" class="w-full h-full " id="modalCanvas" />
      </div>
      <ResetZoomButton />

    </div>
  </ion-modal>
</template>

<script setup lang="ts">

import { IonModal } from '@ionic/vue'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { BACKGROUND } from '@/draw/config/canvas.config'
import { EventBus } from '@/main'
import ResetZoomButton from '@/components/draw/ResetZoomButton.vue'
import { primaryColor } from '@/config/colors.config'
import TopSafeArea from '@/components/general/TopSafeArea.vue'

const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
const { drawMenuOpen } = storeToRefs(useMenuStore())

function init() {
  initCanvas(myCanvasRef.value!, true)
}
</script>

<style scoped>
ion-modal {
  --height: 100%;
  --width: 100%;
}
</style>