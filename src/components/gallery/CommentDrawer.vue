<template>
  <transition name="fade">
    <div @click="close" class="fixed inset-0 bg-black opacity-50 z-[999]" v-if="open"/>
  </transition>

  <!-- Modal Content -->
  <transition name="slide">
    <div class="w-full bg-background rounded-t-lg overflow-y-auto z-[1000] fixed bottom-0" v-show="open">
      <ion-popover :event="e" @didDismiss="accountPopoverOpen = false" :isOpen="accountPopoverOpen">
        <div class="w-full h-full flex flex-col justify-center items-center p-2" v-if="accountInfoToShow">
          <img :src="accountInfoToShow.img" :alt="accountInfoToShow.img" class="w-[128px] rounded-full">
          <p class="text-2xl font-bold py-1">
            {{ `${accountInfoToShow.name} ${accountInfoToShow._id == user._id ? '(Me)' : ''}` }}</p>
          <div v-if="accountInfoToShow._id != user._id">
            <ion-button v-if="user.mates.some(m => m._id == accountInfoToShow?._id)" color="secondary" disabled>Already
              friends
            </ion-button>

            <div v-else>
              <ion-spinner color="secondary" v-if="friendRequestLoading" />
              <ion-button color="secondary"
                          v-else-if="user.mate_requests_sent.some(m => m == accountInfoToShow?._id)"
                          @click="cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: accountInfoToShow._id})">
                Undo request
              </ion-button>

              <ion-button color="secondary" v-else
                          @click="becomeFriends(accountInfoToShow._id)">
                Become friends
              </ion-button>
            </div>

          </div>
          <ion-button @click="accountPopoverOpen = false" color="secondary" fill="clear">Close</ion-button>
        </div>
      </ion-popover>
      <div class="block divide-y divide-secondary pt-2">
        <div v-for="(comment, i) in currInboxItem.comments" :key="i"
             class="px-2 py-2 flex items-center w-full cursor-pointer"
             @click="(ev) => showAccountInfo(ev, currInboxItem.original_followers.find(m => m == comment.sender))">
          <ion-avatar class="flex justify-center items-center h-[40px] w-[40px]"
          ><img :src="senderImg(findUserInInboxUsers(comment.sender))" alt="" class="aspect-square"
          /></ion-avatar>
          <div class="flex-1 ml-2">
            <div class="flex justify-between items-center">
              <div class="text-sm font-bold">{{ senderName(findUserInInboxUsers(comment.sender)) }}</div>
              <div class="text-sm text-center mr-1">{{ dayjs(comment.date).fromNow() }}</div>
            </div>
            <div class="text-sm">{{ comment.message }}</div>
          </div>
        </div>

        <div class="flex w-full justify-evenly items-center h-[50px]">
          <ion-avatar class="flex justify-center items-center mx-2 w-[40px]" style="flex-shrink: 0">
            <img v-if="user" :src="user.img" alt="" class="aspect-square" />
          </ion-avatar>
          <ion-input
            placeholder="Say something..."
            ref="input"
            v-model="commentBody"
            autocapitalize="sentences"
            @keyup.enter="comment"
          />
          <ion-button fill="clear" color="secondary" @click="comment" :icon="svg(mdiSend)">
            <ion-icon :icon="svg(mdiSend)" v-show="commentBody.length > 0" />
          </ion-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { IonAvatar, IonButton, IonIcon, IonInput, IonPopover, IonSpinner, useBackButton } from '@ionic/vue'

import { InboxItem, Mate, User } from '@/types/server.types'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import dayjs from 'dayjs'
import { useSocketService } from '@/service/api/socket.service'
import { storeToRefs } from 'pinia'

const socketService = useSocketService()
const { cancelSendMateRequest } = useSocketService()
const { toast } = useToast()
const { friendRequestLoading } = storeToRefs(useAppStore())
const { findUserInInboxUsers } = useAppStore()

const props = defineProps({
  open: {
    required: true,
    type: Boolean
  },
  user: {
    required: true,
    type: Object as () => User
  },
  currInboxItem: {
    required: true,
    type: Object as () => InboxItem
  },
  indexOfCurrInboxItem: {
    required: true,
    type: Number
  }
})
const emit = defineEmits(['update:open', 'update:currInboxItem'])

const e: any = ref()
const accountPopoverOpen = ref(false)
const accountInfoToShow = ref<Mate>()

const commentBody = ref('')
const input = ref<any>()

const escListener = (event: KeyboardEvent) => {
  event.stopPropagation()
  if (event.key === 'Escape' || event.keyCode === 27) {
    closeWithTimeout(20)
  }
}

function showAccountInfo(ev: any, mate_id?: string) {
  if (!mate_id) return
  e.value = ev
  accountPopoverOpen.value = true
  accountInfoToShow.value = findUserInInboxUsers(mate_id)
}

function autoFocusInput() {
  // fucking ionic timeout needed
  if (props.currInboxItem?.comments.length === 0) setTimeout(() => input.value.$el.setFocus(), 100)
}

useBackButton(9999, (processNextHandler) => {
  if (props.open) close()
  else processNextHandler()
})


watch(
  () => props.open,
  async () => {
    if (props.open) {
      window.addEventListener('keydown', escListener)
      autoFocusInput()
    } else {
      window.removeEventListener('keydown', escListener)
    }
  }
)

async function comment() {
  if (commentBody.value.length == 0) return

  socketService.comment({
    inbox_id: props.currInboxItem._id,
    sender: props.user._id,
    message: commentBody.value,
    followers: props.currInboxItem.followers,
    name: props.user.name
  })
  toast('Comment placed')
  close()
}

function closeWithTimeout(time: number) {
  setTimeout(close, time)
}

function becomeFriends(follower: string) {
  if (props.user.mate_requests_received.some(m => m == follower)) socketService.match({
    _id: props.user._id,
    mate_id: follower
  })
  else socketService.sendMateRequest({
    sender: props.user._id, sender_name: props.user.name,
    receiver: follower
  })

}

function close() {
  emit('update:open', false)

  input.value?.$el.blur()
  commentBody.value = ''
}
</script>

<style scoped lang="scss">
.comment_count {
  --background: var(--ion-color-background);
  --height: auto;
}

ion-popover {
  --background: var(--ion-color-background);
}

.block {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

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
