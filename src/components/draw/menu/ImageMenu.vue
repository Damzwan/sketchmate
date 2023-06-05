<template>
  <ion-popover trigger="image">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="imgInput?.click()">
          <input type="file" class="hidden" ref="imgInput" @change="onImgUpload" accept="image/*" />
          <ion-icon :icon="svg(mdiImage)" />
          <p class="pl-2 text-sm">Image</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="bgImgInput?.click()">
          <input type="file" class="hidden" ref="bgImgInput" @change="onBgImgUpload" accept="image/*" />
          <ion-icon :icon="svg(mdiOverscan)" />
          <p class="pl-2 text-sm">Background image</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { mdiImage, mdiOverscan } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { ref } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'
import { compressImg, svg } from '@/helper/general.helper'

const imgInput = ref<HTMLInputElement>()
const bgImgInput = ref<HTMLInputElement>()

async function onImgUpload(e: Event) {
  const { selectAction } = useDrawStore()
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    const compressedFile = await compressImg(file)
    const reader = new FileReader()
    reader.onload = e => selectAction(DrawAction.Sticker, { img: e.target?.result?.toString() })
    reader.readAsDataURL(compressedFile)
  }
  close()
}

async function onBgImgUpload(e: Event) {
  const { selectAction } = useDrawStore()
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    const compressedFile = await compressImg(file, 1280)
    const reader = new FileReader()
    reader.onload = e => selectAction(DrawAction.BackgroundImage, { img: e.target?.result?.toString() })
    reader.readAsDataURL(compressedFile)
  }
  close()
}

function close() {
  popoverController.dismiss()
}
</script>

<style scoped></style>
