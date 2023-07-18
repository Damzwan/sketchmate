<template>
  <ion-modal
    :is-open="stickerMenuOpen"
    @willPresent="
      () => {
        setAppColors(drawModalColorConfig)
      }
    "
    :handle="false"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    @willDismiss="onDismiss"
  >
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-button
            @click="deleteMode = !deleteMode"
            v-if="!emptyPage"
            fill="clear"
            :disabled="isLoading"
            class="relative left-[-5px]"
          >
            <ion-icon :icon="svg(deleteMode ? mdiCancel : mdiDeleteOutline)" slot="icon-only" />
          </ion-button>
        </ion-buttons>

        <ion-buttons slot="end">
          <ion-button
            @click="() => imgInput!.click()"
            v-if="isStickerOrEmblem"
            fill="clear"
            :disabled="isLoading"
            class="relative right-[-5px]"
            :class="{ 'animate-bounce': emptyPage && !isLoading }"
          >
            <ion-icon :icon="svg(mdiPlus)" slot="icon-only" />
          </ion-button>
        </ion-buttons>

        <input type="file" class="hidden" ref="imgInput" @change="onUpload" accept="image/*" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <LinearLoader v-if="isLoading" class="h-[85%]" :dynamic-text="dynamicStickerLoading" />
      <div class="h-full w-full" v-else>
        <StickersPage
          v-if="stickersEmblemsSavedSelectedTab == 'sticker'"
          :delete-mode="deleteMode"
          @select-sticker="selectSticker"
          v-on:update:delete-mode="setDeleteModeDelayed"
        />
        <EmblemsPage
          v-else-if="stickersEmblemsSavedSelectedTab == 'emblem'"
          :deleteMode="deleteMode"
          @select-emblem="selectEmblem"
          v-on:update:delete-mode="setDeleteModeDelayed"
        />
        <SavedPage
          v-else
          :deleteMode="deleteMode"
          @select-saved="selectedSaved"
          v-on:update:delete-mode="setDeleteModeDelayed"
        />
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar color="primary">
        <ion-segment
          mode="md"
          @ionChange="onSegmentChange"
          :value="stickersEmblemsSavedSelectedTab"
          color="secondary"
          :disabled="isDisabled"
        >
          <ion-segment-button value="sticker">
            <ion-label>Stickers</ion-label>
          </ion-segment-button>
          <ion-segment-button value="emblem">
            <ion-label>Emblems</ion-label>
          </ion-segment-button>
          <ion-segment-button value="saved">
            <ion-label>Saved drawings</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script lang="ts" setup>
import {
  IonContent,
  IonFooter,
  IonIcon,
  IonModal,
  IonToolbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonHeader,
  modalController,
  IonButton,
  IonButtons
} from '@ionic/vue'
import { useAPI } from '@/service/api/api.service'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import { storeToRefs } from 'pinia'
import { compressImg, setAppColors, svg } from '@/helper/general.helper'
import { mdiCancel, mdiClose, mdiDelete, mdiDeleteOutline, mdiPlus, mdiPlusOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useMenuStore } from '@/store/draw/menu.store'
import { colorsPerRoute, drawModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import StickersPage from '@/components/draw/menu/StickersEmblemsSavedMenu/StickersPage.vue'
import EmblemsPage from '@/components/draw/menu/StickersEmblemsSavedMenu/EmblemsPage.vue'
import SavedPage from '@/components/draw/menu/StickersEmblemsSavedMenu/SavedPage.vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction, StickersEmblemsSavedTabOptions } from '@/types/draw.types'
import { Saved } from '@/types/server.types'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { dynamicStickerLoading } from '@/config/draw/draw.config'

const api = useAPI()
const drawStore = useDrawStore()
const { user } = storeToRefs(useAppStore())
const { toast } = useToast()
const isLoading = ref(false)
const deleteMode = ref(false)
const isDisabled = computed(() => isLoading.value || deleteMode.value)

const { stickersEmblemsSavedSelectedTab } = storeToRefs(useMenuStore())

const emptyPage = computed(() =>
  stickersEmblemsSavedSelectedTab.value == 'sticker'
    ? user.value!.stickers.length === 0
    : stickersEmblemsSavedSelectedTab.value == 'emblem'
    ? user.value!.emblems.length === 0
    : user.value!.saved.length === 0
)

const isStickerOrEmblem = computed(
  () => stickersEmblemsSavedSelectedTab.value == 'emblem' || stickersEmblemsSavedSelectedTab.value == 'sticker'
)

const imgInput = ref<HTMLInputElement>()
const { stickerMenuOpen } = storeToRefs(useMenuStore())

function onSegmentChange(e: any) {
  stickersEmblemsSavedSelectedTab.value = e.detail.value
  deleteMode.value = false
}

async function selectSticker(sticker: string) {
  if (deleteMode.value) {
    console.log(user.value?.stickers, sticker)
    user.value!.stickers = user.value!.stickers.filter(item => item != sticker)
    api.deleteSticker({
      user_id: user.value!._id,
      sticker_url: sticker
    })
    if (user.value?.stickers.length == 0) deleteMode.value = false
  } else {
    drawStore.selectAction(DrawAction.Sticker, { img: sticker })
    modalController.dismiss()
  }
}

async function selectEmblem(emblem: string) {
  if (deleteMode.value) {
    user.value!.emblems = user.value!.emblems.filter(item => item != emblem)
    api.deleteEmblem({
      user_id: user.value!._id,
      emblem_url: emblem
    })
    if (user.value?.emblems.length == 0) deleteMode.value = false
  } else {
    drawStore.selectAction(DrawAction.Sticker, { img: emblem })
    modalController.dismiss()
  }
}

async function selectedSaved(saved: Saved) {
  if (deleteMode.value) {
    api.deleteSaved({
      user_id: user.value!._id,
      img_url: saved.img,
      drawing_url: saved.drawing
    })
    user.value!.saved = user.value!.saved.filter(item => item.drawing != saved.drawing)
    if (user.value?.saved.length == 0) deleteMode.value = false
  } else {
    const drawing = await fetch(saved.drawing).then(drawing => drawing.json())
    drawStore.selectAction(DrawAction.AddSavedToCanvas, { json: drawing })
    modalController.dismiss()
  }
}

async function onUpload(e: any) {
  isLoading.value = true
  const file = e.target.files[0]
  const img = (await compressImg(file, { size: 512 })) as File
  if (stickersEmblemsSavedSelectedTab.value === 'sticker') await createSticker(img)
  else await createEmblem(img)
  isLoading.value = false
}

async function createSticker(img: File) {
  const imgUrl = await api.createSticker({
    _id: user.value!._id,
    img: img
  })
  user.value!.stickers.push(imgUrl!)
  toast('Sticker Created!')
}

//
async function createEmblem(img: File) {
  const imgUrl = await api.createEmblem({
    _id: user.value!._id,
    img: img
  })
  user.value!.emblems.push(imgUrl!)
  toast('Emblem Created!')
}

function onDismiss() {
  stickerMenuOpen.value = false
  deleteMode.value = false
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
}

// We delay so that it does not interfere with the button (deletemode = !deletemode)
function setDeleteModeDelayed(value: boolean) {
  setTimeout(() => (deleteMode.value = value), 50)
}
</script>

<style scoped>
ion-toolbar {
  --min-height: 0;
}

ion-modal {
  --height: 60%;
}

ion-label {
  font-size: 0.75rem;
}

ion-buttons {
  height: 40px;
}
</style>
