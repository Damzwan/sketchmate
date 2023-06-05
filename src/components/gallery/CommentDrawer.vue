<template>
  <ion-modal
    :is-open="open"
    @will-dismiss="close"
    class="comment_count"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    @didPresent="checkIfShouldAutoFocus"
  >
    <div class="block divide-y divide-secondary pt-2">
      <div v-for="(comment, i) in currInboxItem.comments" :key="i" class="px-2 py-2 flex items-center w-full">
        <ion-avatar class="flex justify-center items-center h-[40px] w-[40px]"
          ><img :src="senderImg(user, comment.sender)" alt="" class="aspect-square"
        /></ion-avatar>
        <div class="flex-1 ml-2">
          <div class="text-sm font-bold">{{ senderName(user, comment.sender) }}</div>
          <div class="text-sm">{{ comment.message }}</div>
        </div>
        <div class="text-sm text-center mr-1">{{ dayjs(comment.date).format('MMM D') }}</div>
      </div>

      <div class="flex w-full justify-evenly items-center h-[50px]">
        <ion-avatar class="flex justify-center items-center mx-2 w-[50px]"
          ><img v-if="user" :src="user.img" alt="" class="aspect-square"
        /></ion-avatar>
        <ion-input placeholder="Say something..." id="input" v-model="commentBody" />
        <ion-button fill="clear" color="primary" @click="comment">
          <ion-icon :icon="svg(mdiSend)" v-show="commentBody.length > 0" />
        </ion-button>
      </div>
      <div class="bottom_notch_spacer" />
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { IonAvatar, IonButton, IonIcon, IonInput, IonModal } from '@ionic/vue'

import { InboxItem } from '@/types/server.types'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import dayjs from 'dayjs'
import { useSocketService } from '@/service/api/socket.service'

const socketService = useSocketService()
const { user } = useAppStore()
const { toast } = useToast()

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

function checkIfShouldAutoFocus() {
  const elem: any = document.getElementById('input')
  // if (props.currInboxItem?.comments.length === 0) elem.setFocus()
}

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
  // setTimeout(() => place_comment_ref.value?.blur(), 10)
  close()
}

function close() {
  commentBody.value = ''
  emit('update:open', false)
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

.bottom_notch_spacer {
  height: calc(env(safe-area-inset-bottom) / 4);
}

ion-modal {
  --scroll-padding-bottom: var(--keyboard-height);
}
</style>
