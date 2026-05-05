<template>
  <transition name="fade">
    <div @click="close" class="fixed inset-0 bg-black opacity-50 z-[999]" v-if="open" />
  </transition>

  <!-- Modal Content -->
  <transition name="slide">
    <div ref="scrollContainer"
         class="w-full bg-background rounded-t-lg overflow-y-auto z-[1000] fixed bottom-0 max-h-[80%" v-show="open">

      <!-- Loading State for API Comments -->
      <div v-if="isLoadingComments" class="flex justify-center p-8">
        <ion-spinner color="secondary"></ion-spinner>
      </div>

      <div class="block divide-y divide-secondary pt-2" v-else>
        <div v-for="(comment, i) in displayComments" :key="i"
             class="px-2 py-3 flex items-start w-full cursor-pointer"
             @click="(ev) => showAccountInfo(ev, comment.author_id || comment.sender)">

          <ion-avatar class="flex-shrink-0 h-[40px] w-[40px]">
            <img :src="comment.author?.img || senderImg(resolveUser(comment.sender))" alt="" class="aspect-square" />
          </ion-avatar>

          <div class="flex-1 ml-3">
            <div class="flex justify-between items-center">
              <div class="text-sm font-black text-black cabin-sketch-regular">
                {{ comment.author?.name || senderName(resolveUser(comment.sender)) }}
              </div>
              <div class="text-[10px] text-center mr-1 text-black/50 font-bold uppercase">
                {{ dayjs(comment.date || comment.createdAt).fromNow() }}
              </div>
            </div>
            <div class="text-sm text-black cabin-sketch-regular mt-0.5">{{ comment.message }}</div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="displayComments.length === 0" class="py-10 text-center opacity-40">
          <p class="font-bold cabin-sketch-regular text-black">No comments yet. Start the conversation!</p>
        </div>

        <!-- Input Area -->
        <div
          class="flex w-full justify-evenly items-center h-[60px] bg-background sticky bottom-0 border-t border-secondary px-2">
          <ion-avatar class="flex-shrink-0 h-[35px] w-[35px]">
            <img v-if="user" :src="user.img" alt="Me" class="aspect-square" />
          </ion-avatar>

          <ion-input
            placeholder="Say something..."
            ref="input"
            v-model="commentBody"
            autocapitalize="sentences"
            @keyup.enter="submitComment"
            color="secondary"
            class="mx-2"
          />

          <ion-button fill="clear" color="secondary" @mousedown.prevent @click="submitComment">
            <ion-icon :icon="svg(mdiSend)" v-show="commentBody.length > 0" />
          </ion-button>
        </div>
      </div>
    </div>
  </transition>

  <!-- User Info Popover -->
  <ion-popover :event="popoverEvent" @didDismiss="accountPopoverOpen = false" :isOpen="accountPopoverOpen">
    <div class="w-full flex flex-col justify-center items-center p-4 bg-primary" v-if="accountInfoToShow">
      <img :src="accountInfoToShow.img" class="w-[80px] rounded-full border-4 border-white shadow-sm">
      <p class="text-xl font-black py-2 text-black">
        {{ accountInfoToShow.name }} {{ accountInfoToShow._id === user._id ? '(Me)' : '' }}
      </p>

      <div v-if="accountInfoToShow._id !== user._id">
        <ion-button v-if="user.mates.some((m: any) => m._id === accountInfoToShow?._id)" color="secondary" disabled
                    fill="solid" shape="round">
          Friends
        </ion-button>
        <div v-else>
          <ion-spinner color="secondary" v-if="friendRequestLoading" />
          <ion-button v-else color="secondary" fill="solid" shape="round" @click="becomeFriends(accountInfoToShow._id)">
            {{ user.mate_requests_sent.includes(accountInfoToShow._id) ? 'Undo Request' : 'Become Friends' }}
          </ion-button>
        </div>
      </div>
      <ion-button @click="accountPopoverOpen = false" color="black" fill="clear" size="small">Close</ion-button>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch, computed } from 'vue'
import { IonAvatar, IonButton, IonIcon, IonInput, IonPopover, IonSpinner, useBackButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { mdiSend } from '@mdi/js'

import { useAuthStore } from '@/store/auth.store'
import { useInboxStore } from '@/store/inbox.store'
import { useFriendStore } from '@/store/friend.store'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { useSocketService } from '@/service/api/socket/socket.service'
import { fetchPostComments } from '@/service/api/post.api'
import { senderImg, senderName, svg } from '@/helper/general.helper'

dayjs.extend(relativeTime)

const props = defineProps<{
  open: boolean;
  user: any;
  currInboxItem: any;
  indexOfCurrInboxItem: number;
}>()

const emit = defineEmits(['update:open', 'update:currInboxItem'])

const socketService = useSocketService()
const { friendRequestLoading } = storeToRefs(useFriendStore())
const { findUserInInboxUsers } = useInboxStore()
const { config } = storeToRefs(usePhotoSwiper())

const scrollContainer = ref<HTMLElement | null>(null)
const commentBody = ref('')
const input = ref<any>()
const isLoadingComments = ref(false)
const localPostComments = ref<any[]>([])
const lastFetchedId = ref<string | null>(null)

const popoverEvent = ref<any>(null)
const accountPopoverOpen = ref(false)
const accountInfoToShow = ref<any>(null)

const isPost = computed(() => !!props.currInboxItem?.author_id)

const displayComments = computed(() => {
  if (isPost.value) return localPostComments.value
  return props.currInboxItem?.comments || []
})

function resolveUser(userId: string) {
  if (config.value.userLookup) {
    const found = config.value.userLookup(userId)
    if (found) return found
  }
  return findUserInInboxUsers(userId) || userId
}

async function submitComment() {
  if (commentBody.value.trim().length === 0) return
  const message = commentBody.value
  commentBody.value = ''

  if (config.value.onComment) {
    try {
      await config.value.onComment(props.currInboxItem, message)
      localPostComments.value.push({
        author_id: props.user._id,
        author: {
          _id: props.user._id,
          name: props.user.name,
          img: props.user.img
        },
        message: message,
        createdAt: new Date().toISOString()
      })
      if (props.currInboxItem) props.currInboxItem.comment_count++
    } catch (e) {
      console.error('Failed to post comment')
    }
  } else {
    socketService.comment({
      inbox_id: props.currInboxItem._id,
      sender: props.user._id,
      message: message,
      followers: props.currInboxItem.followers,
      name: props.user.name
    })
  }
  scrollToBottom()
}

function showAccountInfo(ev: any, userId?: string) {
  if (!userId) return
  popoverEvent.value = ev
  accountInfoToShow.value = resolveUser(userId)
  accountPopoverOpen.value = true
}

function becomeFriends(followerId: string) {
  if (props.user.mate_requests_received.includes(followerId)) {
    socketService.match({ _id: props.user._id, mate_id: followerId })
  } else if (props.user.mate_requests_sent.includes(followerId)) {
    socketService.cancelSendMateRequest({ sender: props.user._id, sender_name: props.user.name, receiver: followerId })
  } else {
    socketService.sendMateRequest({ sender: props.user._id, sender_name: props.user.name, receiver: followerId })
  }
}

const scrollToBottom = async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

const escListener = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

function close() {
  emit('update:open', false)
  commentBody.value = ''
}

// Watch for changes to the active item in the swiper
watch(() => props.currInboxItem?._id, (newId) => {
  // If the item changes, we MUST reset the cache for public posts
  // This handles the case where user swipes, closes, and reopens on a new item
  if (isPost.value) {
    localPostComments.value = []
    lastFetchedId.value = null
  }
})

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', escListener)

    if (isPost.value) {
      const currentId = props.currInboxItem?._id
      // CACHE CHECK: Only fetch if we haven't loaded this specific post yet
      if (currentId && lastFetchedId.value !== currentId) {
        isLoadingComments.value = true
        try {
          const res = await fetchPostComments(currentId)
          localPostComments.value = res.comments || []
          lastFetchedId.value = currentId
        } catch (e) {
          console.error('Failed to load post comments', e)
        } finally {
          isLoadingComments.value = false
        }
      }
    }

    scrollToBottom()
    if (displayComments.value.length === 0) {
      setTimeout(() => input.value?.$el?.setFocus(), 300)
    }
  } else {
    window.removeEventListener('keydown', escListener)
  }
})

watch(() => props.currInboxItem?.comments?.length, (newVal, oldVal) => {
  if (props.open && newVal > oldVal) scrollToBottom()
})

useBackButton(9999, (processNextHandler) => {
  if (props.open) close()
  else processNextHandler()
})
</script>

<style scoped lang="scss">
ion-input { --color: black; --placeholder-color: rgba(0, 0, 0, 0.3); }
ion-popover { --background: var(--ion-color-primary); --width: 280px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active { transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-leave-active { transition: transform 0.2s ease-in; }
.slide-enter-from, .slide-leave-to { transform: translateY(100%); }
</style>