<template>
  <ion-modal @didPresent="init" :is-open="drawMenuOpen" @didDismiss="drawMenuOpen = false"
             @willDismiss="() => { EventBus.emit('drawModalClosed')}">
    <ion-header>
      <div class="w-full h-12 top-0 flex justify-end bg-primary">
        <ion-button fill="clear" @click="() => {
          modalController.dismiss()

        }">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-black" />
        </ion-button>
      </div>
      <Toolbars />
    </ion-header>
    <ion-content>
      <div class="absolute inset-0 flex m-0 pointer-none " :style="{background: BACKGROUND}">
        <canvas ref="myCanvasRef" class="w-full h-full " />
      </div>

      <ResetZoomButton />

    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">

import { IonButton, IonContent, IonHeader, IonIcon, IonModal, modalController } from '@ionic/vue'
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { BACKGROUND } from '@/draw/config/canvas.config'
import { mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { EventBus } from '@/main'
import ResetZoomButton from '@/components/draw/ResetZoomButton.vue'

const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
const { drawMenuOpen } = storeToRefs(useMenuStore())

function init() {
  initCanvas(myCanvasRef.value!, true)
}
</script>

<style scoped>

</style>