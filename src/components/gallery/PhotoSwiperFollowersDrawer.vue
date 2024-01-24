<template>
  <transition name="fade">
    <div @click="close" class="fixed inset-0 bg-black opacity-50 z-[999]" v-if="open"></div>
  </transition>
  <transition name="slide">
    <div class="w-full bg-background rounded-t-lg overflow-y-auto z-[1000] fixed bottom-0" v-show="open">
      <h1 class="text-2xl pl-3 py-2">Followers</h1>
      <ion-list>
        <ion-item v-for="follower in followers" :key="follower">
          <img :src="senderImg(findUserInInboxUsers(follower))" :alt="follower" class="rounded-full w-[48px] my-2"
               slot="start">
          <h2 class="font-medium text-lg">
            {{ follower == user._id ? `${senderName(findUserInInboxUsers(follower))} (Me)` : senderName(findUserInInboxUsers(follower))
            }}</h2>

          <div v-if="follower != user._id && !user.mates.some(m1 => m1._id == follower)" slot="end">
            <ion-spinner color="secondary" v-if="friendRequestLoading && friendToBe==follower" />
            <ion-button color="secondary" fill="clear" v-else-if="user.mate_requests_sent.some(m => m == follower)"
                        @click="cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: follower})">
              Undo request
            </ion-button>

            <ion-button color="secondary" fill="clear" v-else
                        @click="becomeFriends(follower)">
              Become friends
            </ion-button>
          </div>
        </ion-item>
      </ion-list>
      <input type="text" ref="i" class="hidden">
    </div>
  </transition>
</template>

<script setup lang="ts">

import { IonButton, IonItem, IonList, IonSpinner, useBackButton } from '@ionic/vue'
import { User } from '@/types/server.types'
import { ref, watch } from 'vue'
import { useSocketService } from '@/service/api/socket.service'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { senderImg, senderName } from '@/helper/general.helper'

const props = defineProps<{
  followers: string[],
  user: User,
  open: boolean
}>()
const emit = defineEmits(['update:open'])

const { cancelSendMateRequest, sendMateRequest, match } = useSocketService()
const { friendRequestLoading } = storeToRefs(useAppStore())
const { findUserInInboxUsers } = useAppStore()

const friendToBe = ref<string>()


const escListener = (event: KeyboardEvent) => {
  event.stopPropagation()
  if (event.key === 'Escape' || event.keyCode === 27) {
    close()
  }
}


function becomeFriends(follower: string) {
  friendToBe.value = follower
  if (props.user.mate_requests_received.some(m => m == follower)) match({
    _id: props.user._id,
    mate_id: follower
  })
  else sendMateRequest({
    sender: props.user._id, sender_name: props.user.name,
    receiver: follower
  })

}

useBackButton(9999, (processNextHandler) => {
  if (props.open) close()
  else processNextHandler()
})

watch(
  () => props.open, () => props.open ? window.addEventListener('keydown', escListener) : window.removeEventListener('keydown', escListener)
)

function close() {
  emit('update:open', false)
}
</script>

<style scoped lang="scss">
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide-up/slide-down transition for modal content */
.slide-enter-active {
  transition: transform 0.1s ease-out;
}

.slide-leave-active {
  transition: transform 0.1s ease-in;
}

.slide-enter-from {
  transform: translateY(100%); /* starts from the bottom, off-screen */
}

.slide-leave-to {
  transform: translateY(100%); /* slides down completely, off-screen */
}
</style>