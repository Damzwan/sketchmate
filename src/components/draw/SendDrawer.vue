<template>
  <ion-modal trigger="send-drawing" :initial-breakpoint="1" :breakpoints="[0, 1]" @didDismiss="onDismiss" :handle="false">
    <div class="bg-background">
      <h1 class="text-2xl pl-3 py-2">
        {{ selectedMates.length == 0 ? `Select mates` : `${selectedMates.length} mate${selectedMates.length > 1 ? `s` : ``} selected`
        }}</h1>
      <ion-list>
        <SendDrawerMate v-for="mate in user.mates" :mate="mate" @click="onMateClick(mate)" :key="mate._id" />
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

import { IonFab, IonFabButton, IonIcon, IonList, IonModal, modalController } from '@ionic/vue'
import { Mate, User } from '@/types/server.types'
import { ref } from 'vue'
import SendDrawerMate from '@/components/draw/SendDrawerMate.vue'
import { svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import { useDrawStore } from '@/store/draw/draw.store'

const props = defineProps<{
  user: User
}>()

const showFab = ref(false)
const selectedMates = ref<Mate[]>([])
const selectedMatesLengthToShow = ref(0)
const { send } = useDrawStore()

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
</style>