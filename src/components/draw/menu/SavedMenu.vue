<template>
  <ion-modal
    :handle="false"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    :is-open="savedMenuOpen"
    @willPresent="setAppColors(drawModalColorConfig)"
    @willDismiss="onDismiss"
  >
    <ion-header class="py-1 bg-secondary">
      <ion-toolbar color="secondary" v-if="user">
        <ion-button
          :disabled="user.saved.length == 0 || isLoading"
          fill="clear"
          @click="deleteMode = !deleteMode"
          class="absolute left-0 bottom-[-6px]"
        >
          <ion-icon :icon="svg(deleteMode ? mdiCancel : mdiDelete)" color="white" />
        </ion-button>
        <ion-segment mode="ios" class="w-[70%]">
          <ion-segment-button>
            <ion-label>Saved drawings</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content v-if="user">
      <NoStickers v-if="user.saved.length == 0" type="saved drawings" />
      <div class="saved-grid" v-else>
        <div v-for="saved in user.saved" :key="saved.img" class="image-container">
          <div
            class="relative cursor-pointer hover:opacity-80 image-frame"
            :class="{ 'animate-wiggle': deleteMode }"
            @click="deleteMode ? onDelete(saved) : addSavedToCanvas(saved)"
          >
            <ion-img
              :src="saved.img"
              class="object-contain rounded-lg w-full h-full"
              :class="{ 'opacity-70': deleteMode, 'hover:brightness-90': deleteMode }"
            />
            <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
              <ion-icon :icon="svg(mdiMinus)" class="fill-gray-300 w-full h-[40px]" />
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
import { setAppColors, svg } from '@/helper/general.helper'
import { mdiCancel, mdiDelete, mdiMinus } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { ref } from 'vue'
import { Saved } from '@/types/server.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'
import { useAPI } from '@/service/api/api.service'
import NoStickers from '@/components/draw/NoStickers.vue'
import { useMenuStore } from '@/store/draw/menu.store'
import { colorsPerRoute, drawModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

const { user, isLoading } = storeToRefs(useAppStore())
const { selectAction } = useDrawStore()
const { savedMenuOpen } = storeToRefs(useMenuStore())
const deleteMode = ref(false)
const { deleteSaved } = useAPI()

async function addSavedToCanvas(saved: Saved) {
  const drawing = await fetch(saved.drawing).then(drawing => drawing.json())
  selectAction(DrawAction.AddSavedToCanvas, { json: drawing })
  modalController.dismiss()
}

function onDelete(saved: Saved) {
  deleteSaved({
    user_id: user.value!._id,
    img_url: saved.img,
    drawing_url: saved.drawing
  })
  user.value!.saved = user.value!.saved.filter(item => item.drawing != saved.drawing)
  if (user.value?.saved.length == 0) deleteMode.value = false
}

function onDismiss() {
  savedMenuOpen.value = false
  deleteMode.value = false
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
}
</script>

<style scoped>
ion-modal {
  --height: 70%;
}

.saved-grid {
  @apply grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 p-4;
}

ion-toolbar {
  --min-height: 0;
}

.image-container {
  @apply w-full h-full;
}

.image-frame {
  @apply w-full h-full;
}
</style>
