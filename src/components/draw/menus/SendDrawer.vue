<template>
  <ion-modal
    v-if="isCanvasInit"
    :is-open="sendMenuOpen"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    @didDismiss="onDismiss"
    @didPresent="onOpen"
    :keep-contents-mounted="true"
    :handle="true"
  >
    <div class="bg-primary bot-pad-safe" v-if="user">
      <!-- Header -->
      <p class="text-2xl pl-3 py-2 cabin-sketch-regular">
        {{ count === 0 ? 'Select mates' : `${count} mate${count > 1 ? 's' : ''} selected` }}
      </p>

      <!-- Preview Drawing -->
      <PreviewDrawing
        :newPreview="newPreview"
        :src="preview"
        @crop-completed="onCropCompleted"
        :aspectRatio="getAspectRatio()"
      />

      <SendBalloonBanner :getDataToSend="getDataToSend" />

      <!-- Mates List -->
      <ion-list v-if="!hideMatesList" class="bg-primary max-h-96 overflow-y-auto scrollbar" @touchmove.stop>
        <!-- Current user -->
        <SendDrawerItem
          :key="user._id"
          :mate="{ _id: user._id, img: user.img, name: `${user.name} (me)` }"
          :isSelected="true"
          :isDisabled="true"
        />

        <!-- Other mates -->
        <SendDrawerItem
          v-for="mate in user.mates"
          :key="mate._id"
          :mate="mate"
          @click="() => toggle(mate._id)"
          :isSelected="selected.has(mate._id)"
          :isDisabled="false"
        />
      </ion-list>

      <!-- Send FAB -->
      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="animate-once animate-duration-300">
        <ion-fab-button color="secondary" @click="onSendClick" :disabled="isLoading">
          <ion-icon :icon="svg(mdiSend)" />
        </ion-fab-button>

        <div
          v-if="count > 0"
          class="bg-secondary absolute w-[25px] h-[25px] flex justify-center items-center rounded-full right-[-5px] bottom-[-5px] z-1000"
        >
          <p class="text-white font-semibold">{{ count }}</p>
        </div>
      </ion-fab>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonModal, IonList, IonFab, IonFabButton, IonIcon, modalController } from '@ionic/vue'
import { Keyboard } from '@capacitor/keyboard'
import { mdiSend } from '@mdi/js'

import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { svg, isNative } from '@/helper/general.helper'

import SendBalloonBanner from '@/components/connect/balloon/SendBalloonBanner.vue'
import SendDrawerItem from '@/components/draw/SendDrawerItem.vue'

import { useMateSelection } from '@/draw/services/useMateSelection'
import { useCanvasPreview } from '@/draw/services/useCanvasPreview'

// @ts-ignore
import PreviewDrawing from '@/components/draw/PreviewDrawing.vue'
import { computeBounds } from '@/draw/helpers/export.helper'

// ---- Stores ----
const { sendMenuOpen } = storeToRefs(useMenuStore())
const { user } = storeToRefs(useAuthStore())
const { send, getCanvas, getAspectRatio } = useDrawStore()
const { isCanvasInit } = storeToRefs(useDrawStore()) // TODO let us be more clever about this

// ---- Composables ----
const { selected, toggle, count, reset } = useMateSelection()
const { preview, newPreview, init, crop, reset: resetPreview, getDataToSend, isLoading } = useCanvasPreview(getCanvas)

// ---- Keyboard handling ----
const hideMatesList = ref(false)
if (isNative()) {
  Keyboard.addListener('keyboardWillShow', () => (hideMatesList.value = true))
  Keyboard.addListener('keyboardWillHide', () => (hideMatesList.value = false))
}

// ---- Modal actions ----
function onDismiss() {
  reset()
  resetPreview()
  sendMenuOpen.value = false
}

async function onOpen() {
  init()
}

async function onCropCompleted(event: any) {
  await crop(event)
}

async function onSendClick() {
  const data = await getDataToSend()
  send(Array.from(selected.value), data)
  modalController.dismiss()
}
</script>

<style scoped>
ion-modal {
  --height: auto;
}

ion-list {
  padding: 0;
}

ion-fab {
  margin-bottom: env(safe-area-inset-bottom);
  margin-right: env(safe-area-inset-right);
}
</style>