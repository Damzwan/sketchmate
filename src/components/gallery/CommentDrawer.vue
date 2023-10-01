<template>
  <transition name="fade">
    <div @click="close" class="fixed inset-0 bg-black opacity-50 z-[999]" v-if="open"></div>
  </transition>

  <!-- Modal Content -->
  <transition name="slide">
    <div class="w-full bg-background rounded-t-lg overflow-y-auto z-[1000] fixed bottom-0" v-show="open">
      <div class="block divide-y divide-secondary pt-2">
        <div v-for="(comment, i) in currInboxItem.comments" :key="i" class="px-2 py-2 flex items-center w-full">
          <ion-avatar class="flex justify-center items-center h-[40px] w-[40px]"
            ><img :src="senderImg(user, comment.sender)" alt="" class="aspect-square"
          /></ion-avatar>
          <div class="flex-1 ml-2">
            <div class="text-sm font-bold">{{ senderName(user, comment.sender) }}</div>
            <div class="text-sm">{{ comment.message }}</div>
          </div>
          <div class="text-sm text-center mr-1">{{ dayjs(comment.date).format('MMM D, HH:mm') }}</div>
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
import { IonAvatar, IonButton, IonIcon, IonInput } from '@ionic/vue'

import { InboxItem } from '@/types/server.types'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import dayjs from 'dayjs'
import { useSocketService } from '@/service/api/socket.service'
import { App } from '@capacitor/app'

const socketService = useSocketService()
const { user } = useAppStore()
const { toast } = useToast()
const modal = ref()

const props = defineProps({
  open: {
    required: true,
    type: Boolean
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

const commentBody = ref('')
const input = ref<any>()

let backListener: any = undefined
const escListener = (event: KeyboardEvent) => {
  if (event.key === 'Escape' || event.keyCode === 27) {
    closeWithTimeout(20)
  }
}

function autoFocusInput() {
  // fucking ionic timeout needed
  if (props.currInboxItem?.comments.length === 0) setTimeout(() => input.value.$el.setFocus(), 100)
}

watch(
  () => props.open,
  async () => {
    if (props.open) {
      backListener = await App.addListener('backButton', () => {
        setTimeout(close, 20)
      })
      window.addEventListener('keydown', escListener)
      autoFocusInput()
    } else {
      await backListener.remove()
      window.removeEventListener('keydown', escListener)
    }
  }
)

async function comment() {
  if (commentBody.value.length == 0) return

  socketService.comment({
    inbox_id: props.currInboxItem._id,
    sender: user!._id,
    message: commentBody.value,
    mate_id: user!.mate!._id,
    name: user!.name
  })
  toast('Comment placed')
  close()
}

function closeWithTimeout(time: number) {
  setTimeout(close, time)
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
