<template>
  <ion-modal :is-open="sendMenuOpen" :initial-breakpoint="1" :breakpoints="[0, 1]" @didDismiss="onDismiss"

             :keep-contents-mounted="true"
             :handle="false">
    <div class="bg-primary" v-if="user">
      <p class="text-2xl pl-3 py-2 cabin-sketch-regular">
        {{ selectedMates.length == 0 ? `Select mates` : `${selectedMates.length} mate${selectedMates.length > 1 ? `s` : ``} selected`
        }}</p>


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


      <ion-list class="bg-primary">
        <SendDrawerItem v-for="mate in user.mates" :mate="mate" @click="onMateClick(mate)" :key="mate._id"
                        :isSelected="selectedMates.some(m => m._id == mate._id)" />
      </ion-list>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end" v-show="showFab"
               class="animate-once animate-duration-300"
               :class="{'animate-jump-in': selectedMates.length > 0, 'animate-jump-out': selectedMates.length == 0}">
        <ion-fab-button color="secondary" @click="onSendClick">
          <ion-icon :icon="svg(mdiSend)"></ion-icon>
        </ion-fab-button>
        <div
          class="bg-secondary absolute w-[25px] h-[25px] flex justify-center items-center rounded-full right-[-5px] bottom-[-5px] z-[1000]">
          <p class="text-white font-semibold">{{ selectedMatesLengthToShow }}</p>
        </div>
      </ion-fab>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">

import { IonButton, IonFab, IonFabButton, IonIcon, IonList, IonModal, modalController, useIonRouter } from '@ionic/vue'
import { Mate } from '@/types/server.types'
import { ref } from 'vue'
import { svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/draw/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import SendBalloonBanner from '@/components/balloon/SendBalloonBanner.vue'
import SendDrawerItem from '@/components/draw/SendDrawerItem.vue'

const { sendMenuOpen } = storeToRefs(useMenuStore())

const r = useIonRouter()
const { user } = storeToRefs(useAuthStore())


const showFab = ref(false)
const selectedMates = ref<Mate[]>([])
const selectedMatesLengthToShow = ref(0)
const { send, createBalloon } = useDrawStore()


function onMateClick(mate: Mate) {
  showFab.value = true
  const foundMateIndex = selectedMates.value.findIndex(m => m._id == mate._id)

  if (foundMateIndex == -1) selectedMates.value.push(mate)
  else selectedMates.value = [
    ...selectedMates.value.slice(0, foundMateIndex),
    ...selectedMates.value.slice(foundMateIndex + 1)
  ]

  // Trick due to fadeout animation of ion-fab
  if (selectedMates.value.length == 0) setTimeout(() => selectedMatesLengthToShow.value = selectedMates.value.length, 300)
  else selectedMatesLengthToShow.value = selectedMates.value.length
}


function onDismiss() {
  showFab.value = false
  selectedMates.value = []
  sendMenuOpen.value = false
}

function onSendClick() {
  send(selectedMates.value.map(m => m._id))
  modalController.dismiss()
}

</script>


<style scoped>
ion-modal {
  --height: auto;
}

ion-list{
  padding: 0;
}

</style>