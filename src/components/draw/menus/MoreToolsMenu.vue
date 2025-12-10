<template>
  <ion-popover :keepContentsMounted="true" :showBackdrop="false" ref="t" :is-open="moreToolsMenuOpen" :event="menuEvent"
               @didDismiss="moreToolsMenuOpen = false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" :detail="true" id="background-color">
          <ion-icon :icon="svg(mdiPaletteOutline)" />
          <p class="pl-2 text-base">Background Color</p>

          <ion-popover trigger="background-color" side="right">
            <ColorPicker :color="backgroundColor" @update:color="onCanvasBackgroundChange" :show-opacity="true" />
          </ion-popover>
        </ion-item>

        <ion-item
          color="tertiary"
          :button="true"
          id="stickers"
          @click="openStickerMenu"
          :detail="true"
          :disabled="!user"
        >
          <ion-icon :icon="svg(mdiStickerEmoji)" />
          <p class="pl-2 text-base">Stickers</p>
        </ion-item>

        <ion-item
          color="tertiary"
          :button="true"
          id="stickers"
          @click="openEmblemMenu"
          :detail="true"
          :disabled="!user"
        >
          <ion-icon :icon="svg(mdiStickerCircleOutline)" />
          <p class="pl-2 text-base">Emblems</p>
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

        <ion-item color="tertiary" :button="true" :detail="true" @click="openShapesMenu">
          <ion-icon :icon="svg(mdiShapeOutline)" />
          <p class="pl-2 text-base">Shapes</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" :detail="true" @click="openSavedMenu" :disabled="!user">
          <ion-icon :icon="svg(mdiContentSave)" />
          <p class="pl-2 text-base">Saved Drawings</p>
        </ion-item>
      </ion-list>
      <ion-action-sheet
        id="action-sheet"
        class="my-custom-class"
        color="background"
        mode="ios"
        :is-open="imageActionSheetOpen"
        @didDismiss="imageActionSheetOpen = false"
        :buttons="imageActionSheetButtons"
      />
    </ion-content>
    <ImageCropper :img-url="compressedImgDataUrl" />
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
  mdiContentSave,
  mdiDraw,
  mdiFormatText,
  mdiImage,
  mdiImagePlusOutline,
  mdiPaletteOutline,
  mdiPanoramaVariantOutline,
  mdiShapeOutline,
  mdiStickerCircleOutline,
  mdiStickerEmoji
} from '@mdi/js'
import { ref, watch } from 'vue'
import { DrawAction, Menu } from '@/draw/types/draw.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useMenuStore } from '@/store/menu.store'
import ImageCropper from '@/components/draw/ImageCropper.vue'
import { storeToRefs } from 'pinia'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { useAuthStore } from '@/store/auth.store'


import { createSketchFromDataURL } from '@/draw/helpers/export.helper'

const imgInput = ref<HTMLInputElement>()
const compressedImgDataUrl = ref<string | undefined>()
const imageActionSheetOpen = ref(false)
const { selectAction } = useDrawStore()
const { user } = storeToRefs(useAuthStore())
const { openMenu } = useMenuStore()
const { backgroundColor } = storeToRefs(useDrawStore())

const { shapesMenuOpen, stickersEmblemsSavedSelectedTab, moreToolsMenuOpen, menuEvent } = storeToRefs(useMenuStore())
const t = ref<any>()

watch(shapesMenuOpen, () => {
  if (!shapesMenuOpen.value) {
    t.value.$el.dismiss()
  }
})

function openStickerMenu() {
  openMenu(Menu.StickerEmblemSaved)
  stickersEmblemsSavedSelectedTab.value = 'sticker'
  closePopover()
}

function openEmblemMenu() {
  openMenu(Menu.StickerEmblemSaved)
  stickersEmblemsSavedSelectedTab.value = 'emblem'
  closePopover()
}

function openShapesMenu(e: any) {
  openMenu(Menu.Shapes, e)
}

function openSavedMenu() {
  openMenu(Menu.StickerEmblemSaved)
  stickersEmblemsSavedSelectedTab.value = 'saved'
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
    text: 'Create sketch from image',
    role: 'selected',
    icon: svg(mdiDraw),
    handler: createSketchFromImage
  },
  // TODO this does not really work anymore with a big canvas
  // {
  //   text: 'Use image as background',
  //   icon: svg(mdiPanoramaVariantOutline),
  //   role: 'selected',
  //   handler: () => openMenu(Menu.Cropper)
  // },
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
  if (!compressedImgDataUrl.value) return
  selectAction(DrawAction.AddImage, { imageUrl: compressedImgDataUrl.value })
}

async function createSketchFromImage() {
  selectAction(DrawAction.AddImage, { imageUrl: await createSketchFromDataURL(compressedImgDataUrl.value!) })
}

function onTextClick() {
  selectAction(DrawAction.AddText, undefined)
  closePopover()
}

function onCanvasBackgroundChange(color: string) {
  selectAction(DrawAction.SetCanvasBackground, { color })
}

async function onImgClick() {
  imgInput.value?.click()
}

async function onCameraClick() {
  await closePopover() // weird location but it does not work otherwise haha

  const image = await Camera.getPhoto({
    quality: 100,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    allowEditing: false
  })

  const blob = await fetch(image.webPath!).then(res => res.blob())
  const compressedFile = await compressImg(blob, { size: 1280 }) // TODO maybe too big
  const reader = new FileReader()
  reader.onload = e => (compressedImgDataUrl.value = e.target?.result?.toString())

  reader.readAsDataURL(compressedFile)
  imageActionSheetOpen.value = true
}

async function onImgUpload(e: any) {
  closePopover() // TODO weird location but it does not work otherwise haha
  const file = e.target.files?.[0]
  e.target.value = ''
  imageActionSheetOpen.value = true
  if (file) {
    const compressedFile = await compressImg(file, { size: 1280 }) // TODO maybe too big
    const reader = new FileReader()
    reader.onload = e => (compressedImgDataUrl.value = e.target?.result?.toString())
    reader.readAsDataURL(compressedFile)
  }
}
</script>

<style scoped>
ion-action-sheet.my-custom-class {
  --background: var(--ion-color-primary);
  --button-background-selected: var(--ion-color-primary);
  --button-color: var(--ion-color-dark);
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  color: var(--ion-color-secondary); /* Custom color for cancel button text */
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  --background: #e97223;
}

ion-list{
  padding: 0;
}
</style>