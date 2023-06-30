<template>
  <ion-modal :isOpen="cropperMenuOpen" @willDismiss="close" @didPresent="init">
    <div class="flex flex-col h-full">
      <div class="flex-grow">
        <img id="image" :src="imgUrl" ref="imgRef" alt="cropper image" class="hidden" />
      </div>

      <div class="h-10 flex justify-between items-center">
        <ion-button fill="clear" size="small" class="text-white" @click="close">Cancel</ion-button>
        <ion-button fill="clear" size="small" class="text-white" @click="apply">Apply</ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { IonModal, IonButton } from '@ionic/vue'
import { useMenuStore } from '@/store/draw/menu.store'
import { storeToRefs } from 'pinia'
import { setAppColors } from '@/helper/general.helper'
import { colorsPerRoute, photoSwiperColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

import 'cropperjs/dist/cropper.css'
import Cropper from 'cropperjs'
import { ref } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'

const { cropperMenuOpen } = storeToRefs(useMenuStore())
const { getCanvas } = useDrawStore()
const { selectAction } = useDrawStore()

let cropper: Cropper
const imgRef = ref<HTMLImageElement>()

defineProps<{
  imgUrl: string | undefined
}>()

function close() {
  cropperMenuOpen.value = false
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
  if (cropper) {
    cropper.destroy()
  }
}

function init() {
  setAppColors(photoSwiperColorConfig)
  cropper = new Cropper(imgRef.value!, { aspectRatio: getCanvas().width! / getCanvas().height!, background: false })
}

function apply() {
  const imgUrl = cropper.getCroppedCanvas().toDataURL()
  selectAction(DrawAction.AddBackgroundImage, { img: imgUrl })
  close()
}
</script>

<style scoped>
ion-modal {
  --background: #000000;
  --height: 100%;
  --width: 100%;
}
</style>