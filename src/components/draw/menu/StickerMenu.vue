<template>
  <ion-modal
    :is-open="stickerMenuOpen"
    @willPresent="
      () => {
        selectedSegment = '0'
        setAppColors(drawModalColorConfig)
      }
    "
    :handle="false"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    @willDismiss="onDismiss"
  >
    <ion-header class="py-1 bg-secondary">
      <ion-toolbar color="secondary">
        <ion-button
          fill="clear"
          @click="deleteMode = !deleteMode"
          :disabled="isLoading"
          class="absolute left-0 bottom-[-6px]"
          v-if="!emptyPage"
        >
          <ion-icon :icon="svg(deleteMode ? mdiCancel : mdiDelete)" color="white" />
        </ion-button>
        <ion-segment mode="ios" class="w-[70%]" :disabled="isDisabled" v-model="selectedSegment">
          <ion-segment-button value="0">
            <ion-label>Stickers</ion-label>
          </ion-segment-button>
          <ion-segment-button value="1">
            <ion-label>Emblems</ion-label>
          </ion-segment-button>
        </ion-segment>
        <input type="file" class="hidden" ref="imgInput" @change="onUpload" accept="image/*" />
        <ion-button
          fill="clear"
          @click="() => imgInput!.click()"
          :disabled="isDisabled"
          class="absolute right-0 bottom-[-6px]"
          :class="{ 'animate-pulse': emptyPage }"
        >
          <ion-icon :icon="svg(mdiPlus)" color="white" />
        </ion-button>
      </ion-toolbar>
    </ion-header>
    <ion-content color="background" v-if="user">
      <LinearLoader v-if="isLoading" class="h-[65%]" :dynamic-text="dynamicStickerLoading" />
      <div v-else class="h-full">
        <div v-if="selectedSegment == 0" class="h-full">
          <NoStickers v-if="user.stickers.length == 0" type="stickers" />
          <div class="saved-grid" v-else>
            <div v-for="sticker in user.stickers" :key="sticker">
              <div
                class="relative cursor-pointer hover:opacity-80"
                :class="{ 'animate-wiggle': deleteMode }"
                @click="selectImg(sticker)"
              >
                <ion-img
                  :src="sticker"
                  class="rounded-lg"
                  :class="{ 'opacity-70': deleteMode, 'hover:brightness-90': deleteMode }"
                />
                <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
                  <ion-icon :icon="svg(mdiMinus)" class="fill-gray-300 w-full h-[40px]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="h-full">
          <NoStickers v-if="user!.emblems.length == 0" type="emblems" />
          <div v-else class="saved-grid">
            <div v-for="emblem in user!.emblems" :key="emblem">
              <div
                class="relative cursor-pointer hover:opacity-80"
                :class="{ 'animate-wiggle': deleteMode }"
                @click="selectImg(emblem)"
              >
                <ion-img :src="emblem" class="rounded-lg" :class="{ 'opacity-70': deleteMode }" />
                <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
                  <ion-icon :icon="svg(mdiMinus)" class="fill-gray-300 w-full h-[40px]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonLabel,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { useAPI } from '@/service/api/api.service'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import { storeToRefs } from 'pinia'
import { compressImg, setAppColors, svg } from '@/helper/general.helper'
import { mdiCancel, mdiDelete, mdiMinus, mdiPlus } from '@mdi/js'
import { computed, ref } from 'vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'
import NoStickers from '@/components/draw/NoStickers.vue'
import FullScreenLoader from '@/components/loaders/CircularLoader.vue'
import { useMenuStore } from '@/store/draw/menu.store'
import LinearLoader from '@/components/loaders/LinearLoader.vue'
import { dynamicStickerLoading } from '@/config/draw.config'
import { colorsPerRoute, drawModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

const api = useAPI()
const { user } = storeToRefs(useAppStore())
const { toast } = useToast()
const isLoading = ref(false)
const selectedSegment = ref('0')
const loadingText = computed(() => (selectedSegment.value == '0' ? 'sticker' : 'emblem'))
const deleteMode = ref(false)
const isDisabled = computed(() => isLoading.value || deleteMode.value)

const emptyPage = computed(() =>
  selectedSegment.value == '0' ? user.value!.stickers.length === 0 : user.value!.emblems.length === 0
)

const imgInput = ref<HTMLInputElement>()
const { selectAction } = useDrawStore()
const { stickerMenuOpen } = storeToRefs(useMenuStore())

async function onUpload(e: any) {
  isLoading.value = true
  const file = e.target.files[0]
  const img = (await compressImg(file, { size: 512 })) as File
  if (selectedSegment.value === '0') await createSticker(img)
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

async function createEmblem(img: File) {
  const imgUrl = await api.createEmblem({
    _id: user.value!._id,
    img: img
  })
  user.value!.emblems.push(imgUrl!)
  toast('Emblem Created!')
}

function selectImg(img: string) {
  if (deleteMode.value) {
    if (selectedSegment.value === '0') {
      user.value!.stickers = user.value!.stickers.filter(emblem => emblem != img)
      api.deleteSticker({
        user_id: user.value!._id,
        sticker_url: img
      })
      if (user.value?.stickers.length == 0) deleteMode.value = false
    } else {
      user.value!.emblems = user.value!.emblems.filter(emblem => emblem != img)
      api.deleteEmblem({
        user_id: user.value!._id,
        emblem_url: img
      })
      if (user.value?.emblems.length == 0) deleteMode.value = false
    }
  } else {
    selectAction(DrawAction.Sticker, { img: img })
    modalController.dismiss()
  }
}

function onDismiss() {
  stickerMenuOpen.value = false
  deleteMode.value = false
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
}
</script>

<style scoped>
ion-toolbar {
  --min-height: 0;
}

.saved-grid {
  @apply grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4;
}

ion-modal {
  --height: 70%;
}
</style>
