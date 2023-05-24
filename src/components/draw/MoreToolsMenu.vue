<template>
  <ion-popover trigger="more_tools">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" id="stickers" @click="openStickerMenu" :detail="true">
          <ion-icon :icon="svg(mdiStickerEmoji)" />
          <p class="pl-2 text-base">Stickers</p>
        </ion-item>
        <ion-item color="tertiary" :button="true" @click="onImgClick" :detail="true">
          <input type="file" class="hidden" ref="imgInput" @change="onImgUpload" accept="image/*" />
          <ion-icon :icon="svg(mdiImage)" />
          <p class="pl-2 text-base">Image</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="onCameraClick" :detail="true">
          <ion-icon :icon="svg(mdiCamera)" />
          <p class="pl-2 text-base">Camera</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="onTextClick" :detail="true">
          <ion-icon :icon="svg(mdiFormatText)" />
          <p class="pl-2 text-base">Text</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" :detail="true" id="shapes">
          <ion-icon :icon="svg(mdiShapeOutline)" />
          <p class="pl-2 text-base">Shapes</p>
          <ShapesMenu />
        </ion-item>
      </ion-list>
      <ion-action-sheet
        header="Image actions"
        class="my-custom-class"
        color="background"
        mode="ios"
        :is-open="imageActionSheetOpen"
        @didDismiss="imageActionSheetOpen = false"
        :buttons="imageActionSheetButtons"
      />
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import {
  ActionSheetButton,
  IonActionSheet,
  IonContent,
  IonIcon,
  IonItem,
  IonList,
  IonPopover,
  popoverController
} from '@ionic/vue'
import { compressImg, svg } from '@/helper/general.helper'
import {
  mdiCamera,
  mdiFormatText,
  mdiImage,
  mdiImagePlusOutline,
  mdiPanoramaVariantOutline,
  mdiShapeOutline,
  mdiStickerEmoji
} from '@mdi/js'
import { ref } from 'vue'
import { DrawAction } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw.store'
import { Camera, CameraResultType } from '@capacitor/camera'
import ShapesMenu from '@/components/draw/ShapesMenu.vue'
import { storeToRefs } from 'pinia'

const imgInput = ref<HTMLInputElement>()
const compressedImgDataUrl = ref<string | undefined>()
const imageActionSheetOpen = ref(false)
const { selectAction } = useDrawStore()
const { stickerMenuOpen } = storeToRefs(useDrawStore())

function openStickerMenu() {
  stickerMenuOpen.value = true
  closePopover()
}

// TODO move this
const imageActionSheetButtons: ActionSheetButton[] = [
  {
    text: 'Add image to canvas',
    role: 'selected',
    icon: svg(mdiImagePlusOutline),
    handler: addImage
  },
  {
    text: 'Use image as background',
    icon: svg(mdiPanoramaVariantOutline),
    role: 'selected',
    handler: addBackgroundImage
  },
  {
    text: 'Cancel',
    role: 'cancel',
    data: {
      action: 'cancel'
    }
  }
]

function closePopover() {
  return popoverController.dismiss()
}

function addImage() {
  selectAction(DrawAction.Sticker, { img: compressedImgDataUrl.value })
}

function addBackgroundImage() {
  selectAction(DrawAction.BackgroundImage, { img: compressedImgDataUrl.value })
}

function onTextClick() {
  selectAction(DrawAction.Text)
  closePopover()
}

async function onImgClick() {
  imgInput.value?.click()
}

async function onCameraClick() {
  const image = await Camera.getPhoto({
    quality: 100,
    allowEditing: true,
    resultType: CameraResultType.Uri
  })

  const blob = await fetch(image.webPath!).then(res => res.blob())
  const compressedFile = await compressImg(blob, 1280) // TODO maybe too big
  const reader = new FileReader()
  reader.onload = e => (compressedImgDataUrl.value = e.target?.result?.toString())

  reader.readAsDataURL(compressedFile)
  imageActionSheetOpen.value = true
  await closePopover()
}

async function onImgUpload(e: Event) {
  closePopover()
  const file = (e.target as HTMLInputElement).files?.[0]
  imageActionSheetOpen.value = true
  if (file) {
    const compressedFile = await compressImg(file, 1280) // TODO maybe too big
    const reader = new FileReader()
    reader.onload = e => (compressedImgDataUrl.value = e.target?.result?.toString())
    reader.readAsDataURL(compressedFile)
  }
}
</script>

<style>
ion-action-sheet.my-custom-class {
  --background: var(--ion-color-background);
  --button-background-selected: var(--ion-color-background);
  --button-color: var(--ion-color-contrast-2);
  --button-background-cancel: #ff0000; /* Custom color for cancel button background */
  --button-color-cancel: #ffffff; /* Custom color for cancel button text */
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  color: var(--ion-color-secondary); /* Custom color for cancel button text */
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  --background: #e97223;
}

.cancel-button {
  background: red;
}
</style>
