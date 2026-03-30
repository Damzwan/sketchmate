<template>
  <!-- Floating preview + button -->
  <div
    class="absolute top-safe right-2 z-50 pointer-events-auto"
    :class="topMargin"
    @click="chatMenuOpen = true"
  >
    <div class="comment rounded-xl px-2 py-1.5 w-45 shadow-md cursor-pointer">

      <!-- Header -->
      <div class="flex flex-col gap-1 w-full mb-3">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 shadow-inner">
              <ion-icon :icon="svg(mdiChatOutline)" class="text-white text-sm" />
            </div>

            <div class="flex flex-col">
              <span class="text-white text-xs font-bold tracking-wide uppercase opacity-90">Chat</span>
              <div class="flex items-center gap-1">
                <div class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                <span class="text-white/60 text-[10px] font-medium">
            {{ roomMembers.length }} members
          </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="disconnectedRoomId"
          class="flex items-center gap-1.5 mt-1 animate-pulse px-1"
        >
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
          <span class="text-amber-400 text-[9px] font-black uppercase tracking-widest">
      Reconnecting...
    </span>
        </div>
      </div>

      <!-- Messages -->
      <TransitionGroup
        name="chat-fade"
        tag="div"
        class="flex flex-col space-y-1"
      >
        <div
          v-for="msg in visiblePreviewMessages"
          :key="msg._id"
          class="text-white text-xs leading-snug"
        >

          <!-- SYSTEM MESSAGE -->
          <div
            v-if="msg.type !== 'message'"
            class="flex items-center gap-1 opacity-70"
          >
            <img
              :src="msg.member.img"
              class="w-4 h-4 rounded-full shrink-0"
            />

            <div class="text-[11px] line-clamp-2">
              <span class="font-medium">{{ msg.member.name }}</span>
              <span v-if="msg.type === 'join'"> joined</span>
              <span v-else> left</span>
            </div>
          </div>

          <!-- NORMAL MESSAGE -->
          <div
            v-else
            class="flex items-start gap-1"
          >
            <img
              :src="msg.member.img"
              class="w-4 h-4 rounded-full shrink-0 mt-[1px]"
            />

            <div class="text-[11px] line-clamp-2">
              <span class="font-medium text-blue-300">{{ msg.member.name }}:</span>
              <span class="opacity-80"> {{ msg.message }}</span>
            </div>
          </div>

        </div>
      </TransitionGroup>
    </div>
  </div>
  <!-- Modal -->
  <ion-modal
    :is-open="chatMenuOpen"
    @will-present="() => scrollToBottom(false)"
    @did-dismiss="chatMenuOpen = false"
    :initial-breakpoint="1" :breakpoints="[0, 1]"
    handle-behavior="cycle"
  >
    <div class="flex flex-col h-full bg-background">

      <!-- Header -->
      <div class="px-4 py-3 flex items-center justify-between">
        <h2 class="text-2xl font-semibold cabin-sketch-regular">Lobby Chat</h2>
      </div>

      <!-- Messages -->
      <div
        ref="chatContent"
        class="overflow-y-auto max-h-72 px-3 py-2 space-y-1.5"
      >
        <div v-for="msg in lobbyChatMessages" :key="msg._id" class="w-full cursor-pointer" @click="(ev) => {
          openFriendPopover(ev, msg.member)
        }">

          <!-- SYSTEM MESSAGE -->
          <div
            v-if="msg.type !== 'message'"
            class="flex items-center gap-1.5 justify-center opacity-70 text-[11px] italic text-gray-500"
          >
            <img
              :src="msg.member.img"
              class="w-5 h-5 rounded-full shrink-0"
            />
            <span class="truncate">
        <span class="font-medium">{{ msg.member.name }}</span>
        <span v-if="msg.type === 'join'"> joined the lobby</span>
        <span v-else> left the lobby</span>
      </span>
          </div>

          <!-- NORMAL MESSAGE -->
          <div
            v-else
            class="flex items-start gap-3 px-2 py-1"
            :class="{ 'flex-row-reverse': msg.member._id === user?._id }"
          >
            <img
              :src="msg.member.img"
              class="w-8 h-8 rounded-full border border-gray-100 shadow-sm shrink-0 mt-1"
            />

            <div
              class="flex flex-col max-w-[75%]"
              :class="{ 'items-end': msg.member._id === user?._id }"
            >
    <span class="text-[11px] font-medium text-gray-500 mb-0.5 px-1 uppercase tracking-wider">
      {{ msg.member.name }}
    </span>

              <div
                class="py-2 px-3.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words cabin-sketch-regular"
                :class="msg.member._id === user?._id
          ? 'bg-primary  rounded-tr-none shadow-md'
            : 'bg-primary-light  rounded-tl-none shadow-sm'"
              >
                {{ msg.message }}
              </div>

              <div
                class="text-[10px] text-gray-400 mt-1 px-1"
                :class="{ 'text-right': msg.member._id === user?._id }"
              >
                {{ dayjs(msg.timestamp).fromNow() }}
              </div>
            </div>
          </div>

        </div>
      </div>
      <!-- Input -->
      <div class="p-2 bg-background">
        <div class="h-[2px] w-full bg-primary mb-2 rounded-full"></div>
        <div class="flex w-full justify-evenly items-center h-[50px]">
          <ion-avatar class="flex justify-center items-center mx-2 w-[40px]" style="flex-shrink: 0">
            <img v-if="user" :src="user.img" alt="" class="aspect-square" />
          </ion-avatar>
          <ion-input
            placeholder="Say something..."
            ref="input"
            class="cabin-sketch-regular"
            v-model="newMessage"
            autocapitalize="sentences"
            @keyup.enter="handleSendMessage()"
            color="secondary"
          />
          <ion-button fill="clear" color="secondary" @click="handleSendMessage()" :icon="svg(mdiSend)"
                      v-show="newMessage.length > 0">
            <ion-icon :icon="svg(mdiSend)" />
          </ion-button>
        </div>
      </div>

    </div>
  </ion-modal>

  <!--  TODO reusable component pls-->
  <ion-popover :event="e" @didDismiss="accountPopoverOpen = false" :isOpen="accountPopoverOpen" v-if="user">
    <div class="w-full h-full flex flex-col justify-center items-center p-2" v-if="accountInfoToShow">
      <img :src="accountInfoToShow.img" :alt="accountInfoToShow.img" class="w-[128px] rounded-full">
      <p class="text-2xl font-bold py-1 text-black">
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
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { IonIcon, IonModal, IonButton, IonAvatar, IonInput, IonSpinner, IonPopover } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiChat, mdiChatOutline, mdiSend } from '@mdi/js'
import { sendLobbyMessage } from '@/service/api/socket/drawSyncing.socket'
import dayjs from 'dayjs'
import { useFriendStore } from '@/store/friend.store'
import { useSocketService } from '@/service/api/socket/socket.service'
import { Mate } from '@/types/server.types'
import { useRoute } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'

// Stores
const drawSyncerStore = useDrawSyncer()
const { lobbyChatMessages, disconnectedRoomId, roomMembers } = storeToRefs(drawSyncerStore)
const { chatMenuOpen } = storeToRefs(useMenuStore())
const { user } = storeToRefs(useAuthStore())

// State
const newMessage = ref('')
const chatContent = ref<HTMLElement | null>(null)

const route = useRoute()
const topMargin = computed(() => {
  const mapping: any = {
    [`/${FRONTEND_ROUTES.draw}`]: 'mt-14',
    [`/${FRONTEND_ROUTES.gallery}`]: 'mt-16',
    [`/${FRONTEND_ROUTES.connect}`]: 'mt-32'
  }

  return mapping[route.path] || 'mt-14'
})

// Scroll logic
const scrollToBottom = async (smooth = true) => {
  await nextTick()
  const el = chatContent.value
  if (!el) return

  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })
}

// Watch messages
watch(lobbyChatMessages, () => {
  if (chatMenuOpen.value) {
    scrollToBottom()
  }
}, { deep: true })

// When modal opens
watch(chatMenuOpen, (isOpen) => {
  if (isOpen) {
    scrollToBottom(false)
  }
})

// Send message
const handleSendMessage = () => {
  const text = newMessage.value.trim()
  if (!text) return

  sendLobbyMessage(text)

  newMessage.value = ''
  scrollToBottom()
}

const visiblePreviewMessages = ref<any[]>([])

watch(lobbyChatMessages, (messages) => {
  // if (chatMenuOpen.value) return
  const latest = messages[messages.length - 1]
  if (!latest) return

  visiblePreviewMessages.value.push(latest)

  // keep max 3
  if (visiblePreviewMessages.value.length > 3) {
    visiblePreviewMessages.value.shift()
  }

  // auto remove after 10s
  setTimeout(() => {
    visiblePreviewMessages.value =
      visiblePreviewMessages.value.filter(m => m !== latest)
  }, 10000)

}, { deep: true })


// account popover logic
const e: any = ref()
const accountPopoverOpen = ref(false)
const accountInfoToShow = ref<Mate>()
const friendToBe = ref<string>()
const { friendRequestLoading } = storeToRefs(useFriendStore())
const { cancelSendMateRequest, sendMateRequest, match } = useSocketService()

function openFriendPopover(ev: any, member: Mate) {
  accountInfoToShow.value = member
  accountPopoverOpen.value = true
  e.value = ev
}

function becomeFriends(follower: string) {
  if (!user.value) return
  friendToBe.value = follower
  if (user.value.mate_requests_received.some(m => m == follower)) match({
    _id: user.value._id,
    mate_id: follower
  })
  else sendMateRequest({
    sender: user.value._id, sender_name: user.value.name,
    receiver: follower
  })

}
</script>

<style scoped>
.chat-fade-enter-active,
.chat-fade-leave-active {
  transition: all 0.3s ease-out;
}

.chat-fade-enter-from {
  opacity: 0;
  transform: translateX(-15px) scale(0.95);
}

.chat-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

ion-modal {
  --height: auto;
}

.comment {
  background-color: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(12px);
}
</style>