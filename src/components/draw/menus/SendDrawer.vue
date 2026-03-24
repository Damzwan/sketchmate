<template>
  <ion-modal :is-open="sendMenuOpen" :initial-breakpoint="1" :breakpoints="[0, 1]" @didDismiss="onDismiss"
             @didPresent="onOpen"

             :keep-contents-mounted="true"
             :handle="true">
    <div class="bg-primary bot-pad-safe" v-if="user">
      <p class="text-2xl pl-3 py-2 cabin-sketch-regular">
        {{ selectedMates.length == 0 ? `Select mates` : `${selectedMates.length} mate${selectedMates.length > 1 ? `s` : ``} selected`
        }}</p>


      <PreviewDrawing :src="preview" class="pb-4" />
      <SendBalloonBanner />


      <div class="flex flex-col px-4 py-2 w-full justify-center items-center" v-if="user.mates.length === 0">
        <p class="cabin-sketch-regular text-xl mb-2">
          You don’t have any mates yet. Add one to start sending drawings!
        </p>
        <ion-button size="small" class="w-[200px]" color="secondary" @click="() => {
          r.push(`/${FRONTEND_ROUTES.connect}`);
          sendMenuOpen = false;
        }">
          Add a mate
        </ion-button>
      </div>


      <ion-list class="bg-primary max-h-96 overflow-y-auto scrollbar" v-if="!hideMatesList">
        <SendDrawerItem
          :key="user._id"
          :mate="{ _id: user._id, img: user.img, name: `${user.name} (me)` }"
          :isSelected="true"
          :isDisabled="true"
        />

        <SendDrawerItem
          v-for="mate in user.mates"
          :key="mate._id"
          :mate="mate"
          @click="onMateClick(mate)"
          :isSelected="selectedMates.some(m => m._id === mate._id)"
          :isDisabled="false"
        />
      </ion-list>


      <ion-fab slot="fixed" vertical="bottom" horizontal="end"
               class="animate-once animate-duration-300"
      >
        <ion-fab-button color="secondary" @click="onSendClick">
          <ion-icon :icon="svg(mdiSend)"></ion-icon>
        </ion-fab-button>
        <div
          class="bg-secondary absolute w-[25px] h-[25px] flex justify-center items-center rounded-full right-[-5px] bottom-[-5px] z-1000"
          v-if="selectedMates.length > 0">
          <p class="text-white font-semibold">{{ selectedMates.length }}</p>
        </div>
      </ion-fab>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">

import { IonButton, IonFab, IonFabButton, IonIcon, IonList, IonModal, modalController, useIonRouter } from '@ionic/vue'
import { Mate } from '@/types/server.types'
import { ref } from 'vue'
import { isNative, svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import SendBalloonBanner from '@/components/balloon/SendBalloonBanner.vue'
import SendDrawerItem from '@/components/draw/SendDrawerItem.vue'

import { exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import PreviewDrawing from '@/components/draw/PreviewDrawing.vue'
import { Keyboard } from '@capacitor/keyboard'

const { sendMenuOpen } = storeToRefs(useMenuStore())

const r = useIonRouter()
const { user } = storeToRefs(useAuthStore())


const showFab = ref(false)
const selectedMates = ref<Mate[]>([])
const { send } = useDrawStore()

const preview = ref<string>()

// TODO stupid hack since the keyboard is pushing up content
const hideMatesList = ref(false)
enableKeyboardListener()

function enableKeyboardListener() {
  if (!isNative()) return
  Keyboard.addListener('keyboardWillShow', () => {
    hideMatesList.value = true
  })

  Keyboard.addListener('keyboardWillHide', () => {
    hideMatesList.value = false
  })
}


function onMateClick(mate: Mate) {
  const foundMateIndex = selectedMates.value.findIndex(m => m._id == mate._id)

  if (foundMateIndex == -1) selectedMates.value.push(mate)
  else selectedMates.value = [
    ...selectedMates.value.slice(0, foundMateIndex),
    ...selectedMates.value.slice(foundMateIndex + 1)
  ]

}


function onDismiss() {
  showFab.value = false
  selectedMates.value = []
  sendMenuOpen.value = false
  preview.value = undefined
}

function onSendClick() {
  send(selectedMates.value.map(m => m._id))
  modalController.dismiss()
}

async function onOpen() {
  const { getCanvas } = useDrawStore()
  exportBoundingBoxImage(getCanvas()).then(url => {
    if (!url) return
    preview.value = url.img
  })
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