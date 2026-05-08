<template>
  <!-- GARBAGE BIN (Shows only when dragging the collapsed dock) -->
  <Transition name="fade-slow">
    <div
      v-show="isDragging && !isExpanded"
      class="fixed bottom-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-red-500/80 backdrop-blur-md rounded-full border-2 border-red-300 shadow-2xl flex items-center justify-center z-[60]"
      :class="{ 'scale-125 bg-red-600': isOverTrash }"
    >
      <ion-icon :icon="svg(mdiDeleteOutline)" class="text-3xl text-white drop-shadow-md" />
    </div>
  </Transition>

  <!-- ========================================== -->
  <!-- MINIMIZED STATE: FLOATING VERTICAL DOCK    -->
  <!-- ========================================== -->
  <Transition name="fade">
    <div
      v-show="isVisible && !isExpanded"
      ref="widgetRef"
      class="fixed z-50 pointer-events-auto touch-none select-none flex flex-col gap-3 p-2"
      :class="isDragging ? 'transition-none' : 'transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]'"
      :style="`left: ${x}px; top: ${y}px;`"
    >
      <div ref="dockHandleRef" class="flex flex-col gap-3 cursor-grab active:cursor-grabbing relative">

        <!-- Overview Bubble -->
        <div
          @click.stop="chatWidget.openOverview()"
          class="relative flex shrink-0 items-center justify-center w-14 h-14 rounded-[1.5rem] shadow-lg transition-transform bg-secondary border border-white/40 hover:scale-105"
        >
          <ion-icon :icon="chatbubblesOutline" class="text-2xl text-white" />
          <div v-if="totalUnread > 0" class="absolute -top-1 -right-1 w-5 h-5 bg-tertiary rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-sm">
            {{ totalUnread }}
          </div>
        </div>

        <!-- Lobby Bubble & Reactive Preview Box -->
        <div v-if="isInLobby" class="relative flex items-center justify-center">
          <div
            @click.stop="chatWidget.openLobby()"
            class="relative flex shrink-0 items-center justify-center w-14 h-14 rounded-[1.5rem] backdrop-blur-md shadow-md transition-transform border bg-white/60 border-white/60 hover:scale-105 z-10"
          >
            <span class="text-2xl drop-shadow-sm">🌐</span>
          </div>

          <!-- Lobby Preview (Popping out to the left) -->
          <Transition name="chat-fade">
            <div
              v-if="showLobbyPreview"
              @click.stop="chatWidget.openLobby()"
              class="absolute right-full mr-3 comment rounded-xl px-2 py-1.5 w-48 shadow-lg cursor-pointer backdrop-blur-md bg-black/60 border border-white/20 shrink-0 pointer-events-auto"
            >
              <!-- Preview Header -->
              <div class="flex items-center justify-between w-full mb-1 border-b border-white/10 pb-1.5">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 flex items-center justify-center rounded-lg bg-white/10 shadow-inner">
                    <ion-icon :icon="svg(mdiChatOutline)" class="text-white text-xs" />
                  </div>
                  <div class="flex flex-col">
                    <span class="text-white text-[10px] font-bold tracking-wide uppercase opacity-90 leading-none mt-0.5">Lobby</span>
                    <div class="flex items-center gap-1 mt-0.5">
                      <div class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                      <span class="text-white/60 text-[9px] font-medium">{{ roomMembers.length }} members</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Preview Messages -->
              <div class="flex flex-col space-y-1 mt-1.5">
                <div v-for="msg in visiblePreviewMessages" :key="msg._id" class="text-white text-xs leading-snug">

                  <!-- SYSTEM MESSAGE -->
                  <div v-if="msg.type && msg.type !== 'message'" class="flex items-center gap-1.5 opacity-70">
                    <img :src="msg.member.img" class="w-4 h-4 rounded-full shrink-0 object-cover" />
                    <div class="text-[11px] line-clamp-1">
                      <span class="font-medium">{{ msg.member.name }}</span>
                      <span>{{ msg.type === 'join' ? ' joined' : ' left' }}</span>
                    </div>
                  </div>

                  <!-- NORMAL MESSAGE -->
                  <div v-else class="flex items-start gap-1.5">
                    <img :src="msg.member?.img" class="w-4 h-4 rounded-full shrink-0 mt-[1px] object-cover" />
                    <div class="text-[11px] line-clamp-2">
                      <span class="font-medium text-blue-300">{{ msg.member?.name }}:</span>
                      <span class="opacity-80"> {{ msg.message || msg.content }}</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Private Chat Heads -->
        <div
          v-for="head in activeChatHeads"
          :key="head.id"
          @click.stop="chatWidget.openPrivateChat(head.id)"
          class="relative shrink-0 w-14 h-14 rounded-[1.5rem] backdrop-blur-md shadow-md transition-all flex items-center justify-center bg-white/40 border border-white/60 hover:scale-105"
          :class="{ 'animate-pop-bounce ring-4 ring-tertiary/50': bouncingBubbles.includes(head.id) }"
        >
          <img :src="getPartnerInfo(head.id)?.img" class="w-full h-full rounded-[1.3rem] object-cover pointer-events-none" />
          <div v-if="getPartnerInfo(head.id)?.isOnline" class="absolute -bottom-0.5 right-1 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full"></div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ========================================== -->
  <!-- EXPANDED STATE: ION-MODAL BOTTOM DRAWER    -->
  <!-- ========================================== -->
  <ion-modal
    :is-open="isVisible && isExpanded"
    @did-present="scrollToBottom()"
    @did-dismiss="chatWidget.closePanel()"
    :keepContentsMounted="true"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-chat-modal"
  >
    <div class="flex flex-col h-full bg-primary/20 backdrop-blur-3xl w-full relative">

      <!-- HORIZONTAL TABS (Inside Modal) -->
      <div class="flex items-center gap-3 px-4 pt-3 pb-2 overflow-x-auto hide-scrollbar shrink-0 border-b border-primary/20 bg-white/30 backdrop-blur-md rounded-t-[2.5rem]">
        <!-- Overview -->
        <div @click="activeTab = 'overview'" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all cursor-pointer" :class="activeTab === 'overview' ? 'bg-secondary text-white shadow-md' : 'bg-secondary/40 text-white/80 hover:bg-secondary/60'">
          <ion-icon :icon="chatbubblesOutline" class="text-xl" />
        </div>

        <!-- Lobby -->
        <div v-if="isInLobby" @click="activeTab = 'lobby'" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all cursor-pointer" :class="activeTab === 'lobby' ? 'bg-white shadow-md' : 'bg-white/40 hover:bg-white/60'">
          <span class="text-xl">🌐</span>
        </div>

        <!-- Active Chats -->
        <div v-for="head in activeChatHeads" :key="head.id" @click="activeTab = head.id" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] transition-all cursor-pointer" :class="activeTab === head.id ? 'shadow-md border-2 border-white scale-110' : 'opacity-60 grayscale-[30%] hover:grayscale-0 hover:opacity-100'">
          <img :src="getPartnerInfo(head.id)?.img" class="w-full h-full rounded-[1.1rem] object-cover" />
          <div v-if="activeTab === head.id" @click.stop="chatWidget.removeChatHead(head.id)" class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center cursor-pointer shadow-sm active:scale-90 z-20 border border-white/40">
            <ion-icon :icon="svg(mdiClose)" class="text-white text-[10px]" />
          </div>
        </div>
      </div>

      <!-- HEADER -->
      <div class="flex items-center justify-between px-4 py-2 bg-white/20 shrink-0 shadow-sm z-10">
        <div class="flex flex-col truncate">
          <span class="text-lg font-black text-black italic tracking-tight">{{ panelTitle }}</span>
          <span v-if="activeTab !== 'overview'" class="text-[10px] font-bold text-black/60 uppercase">
            <span v-if="activeTab === 'lobby'">{{ roomMembers.length }} Members</span>
            <span v-else-if="currentPartnerInfo?.isTyping" class="text-tertiary">Typing...</span>
            <span v-else-if="currentPartnerInfo?.isOnline" class="text-green-600">Online Now</span>
            <span v-else>Offline</span>
          </span>
        </div>

        <div class="flex items-center">
          <button v-if="activeTab !== 'overview' && activeTab !== 'lobby'" @click.stop="openReportOptions" class="p-1.5 rounded-xl hover:bg-black/5 active:scale-90 transition-all">
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-black/60 text-xl" />
          </button>
        </div>
      </div>

      <!-- BODY CONTENT (Scrollable Area) -->
      <div class="flex-1 overflow-y-auto relative bg-transparent hide-scrollbar px-3 py-2" ref="messageContainer">

        <!-- View 1: OVERVIEW -->
        <div v-if="activeTab === 'overview'" class="space-y-2 pb-4">
          <ConversationItem
            v-for="chat in activeChats"
            :key="chat._id"
            :chat="chat"
            :currentUserId="user?._id || ''"
            :isOnline="isFriendOnline(getPartnerIdFromChat(chat))"
            :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false"
            @open="chatWidget.openPrivateChat(chat._id)"
          />
        </div>

        <!-- View 2/3: LOBBY & PRIVATE CHAT (Unified Message Flow) -->
        <div v-else class="space-y-1.5 pb-4 flex flex-col justify-end min-h-full">
          <div v-if="currentMessages.length === 0" class="text-center py-6 text-sm font-bold text-black/40 italic">
            Send a message to start vibing.
          </div>

          <div v-for="(msg, index) in currentMessages" :key="msg._id" class="w-full">

            <!-- System Msg (Lobby) -->
            <div @click="(ev) => openFriendPopover(ev, msg.member)" v-if="msg.type && msg.type !== 'message'" class="flex items-center gap-1.5 justify-center opacity-70 text-[11px] italic text-gray-500 my-2 cursor-pointer">
              <img v-if="msg.member?.img" :src="msg.member.img" class="w-5 h-5 rounded-full shrink-0" />
              <span class="font-medium">{{ msg.member?.name }}</span> {{ msg.type === 'join' ? 'joined' : 'left' }}
            </div>

            <!-- Normal Msg -->
            <div v-else class="flex items-start gap-3 px-2 py-1" :class="{'flex-row-reverse': isMe(msg), 'mt-[-4px]': isCompact(msg, index)}">
              <!-- Avatar (Only if not me, and not compact) -->
              <div class="w-8 h-8 shrink-0" v-if="activeTab === 'lobby' || activeTab !== 'lobby'">
                <img @click="(ev) => openFriendPopover(ev, msg.member || getPartnerInfo(activeTab).id)" v-if="!isCompact(msg, index) && !isMe(msg)" :src="msg.member?.img || getPartnerInfo(activeTab).img" class="w-9 h-9 rounded-full border border-white shadow-sm mt-1 cursor-pointer object-cover" />
              </div>

              <div class="flex flex-col max-w-[75%] relative" :class="{ 'items-end': isMe(msg) }">
                <div class="py-2 px-3.5 rounded-[1.5rem] text-sm leading-snug font-bold shadow-sm break-words cabin-sketch-regular relative" :class="isMe(msg) ? 'bg-secondary text-white rounded-tr-none shadow-md' : 'bg-white/90 text-black rounded-tl-none border border-white/60 shadow-sm'">

                  <div v-if="!isCompact(msg, index) && !isMe(msg) && activeTab === 'lobby'" class="text-[10px] font-black mb-0.5 opacity-50 uppercase tracking-wider">
                    {{ msg.member?.name }}
                  </div>

                  <div class="pr-6">{{ msg.content || msg.message }}</div>

                  <div class="absolute bottom-1 right-2 text-[8px] font-sans font-black" :class="isMe(msg) ? 'opacity-70 text-white' : 'opacity-40 text-black'">
                    {{ dayjs(msg.createdAt || msg.timestamp).format('HH:mm') }}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- FOOTER (Input + Invite) -->
      <div v-if="activeTab !== 'overview'" class="p-2 bg-white/40 border-t border-white/50 backdrop-blur-xl shrink-0 pb-safe">
        <div class="flex items-center gap-1.5">
          <!-- Invite Button -->
          <button @click.stop="openInviteOptions" class="w-10 h-10 rounded-full bg-white/50 border border-white/60 hover:bg-white/80 active:scale-90 transition-all shrink-0 flex items-center justify-center shadow-sm">
            <ion-icon :icon="svg(mdiAccountPlusOutline)" class="text-xl text-secondary drop-shadow-sm" />
          </button>

          <!-- Input Bar (Using ion-input for native keyboard handling) -->
          <div class="flex-1 flex items-center gap-1 bg-white/80 border border-white/80 rounded-[2rem] p-1 shadow-inner">
            <ion-input
              ref="chatInputRef"
              v-model="inputText"
              @keyup.enter="handleSend"
              @ionInput="handleTyping"
              placeholder="Say something..."
              class="cabin-sketch-regular font-bold px-2"
              color="secondary"
              autocapitalize="sentences"
            />

            <button
              @mousedown.prevent
              @click="handleSend"
              :disabled="!inputText.trim() || isSending"
              class="w-9 h-9 rounded-full bg-secondary flex shrink-0 items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
            >
              <ion-icon v-if="!isSending" :icon="svg(mdiSend)" class="text-white text-base ml-0.5" />
              <ion-spinner v-else name="crescent" color="light" class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </ion-modal>

  <!-- Friend Popover -->
  <ion-popover :event="popoverEvent" @didDismiss="accountPopoverOpen = false" :isOpen="accountPopoverOpen" v-if="user">
    <div class="flex flex-col justify-center items-center p-4 bg-primary/10 backdrop-blur-2xl rounded-2xl w-[250px]" v-if="accountInfoToShow">
      <img :src="accountInfoToShow.img" class="w-20 h-20 object-cover rounded-[1.5rem] border-2 border-white shadow-md mb-3">
      <p class="text-lg font-black text-black leading-tight text-center">
        {{ `${accountInfoToShow.name} ${accountInfoToShow._id === user._id ? '(Me)' : ''}` }}
      </p>

      <div v-if="accountInfoToShow._id !== user._id" class="mt-4 w-full flex flex-col gap-2">
        <ion-button v-if="user.mates.some(m => m._id === accountInfoToShow?._id)" color="secondary" expand="block" disabled class="font-bold rounded-xl">
          Already Mates
        </ion-button>
        <template v-else>
          <ion-spinner color="secondary" v-if="friendRequestLoading" class="mx-auto" />
          <ion-button v-else-if="user.mate_requests_sent.some(m => m === accountInfoToShow?._id)" color="medium" expand="block" class="font-bold rounded-xl" @click="cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: accountInfoToShow._id})">
            Undo Request
          </ion-button>
          <ion-button v-else color="secondary" expand="block" class="font-bold rounded-xl" @click="becomeFriends(accountInfoToShow._id)">
            Add Friend
          </ion-button>
        </template>
      </div>
    </div>
  </ion-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useDraggable, useWindowSize, clamp } from '@vueuse/core'
import { actionSheetController, IonIcon, IonSpinner, IonModal, IonPopover, IonButton, IonInput } from '@ionic/vue'
import { chatbubblesOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import {
  mdiClose, mdiSend, mdiAccountPlusOutline, mdiDeleteOutline,
  mdiChatOutline, mdiDotsHorizontal, mdiFlagVariantOutline, mdiBlockHelper
} from '@mdi/js'
import { svg } from '@/helper/general.helper'
import dayjs from 'dayjs'

import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useFriendStore } from '@/store/friend.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useSocketService } from '@/service/api/socket/socket.service'
import { sendLobbyMessage } from '@/service/api/socket/drawSyncing.socket'
import ConversationItem from './ConversationItem.vue'
import { Mate } from '@/types/server.types'

const chatWidget = useChatWidgetStore()
const { isVisible, isExpanded, activeTab, activeChatHeads, bouncingBubbles, showLobbyPreview } = storeToRefs(chatWidget)

const chatStore = useChatStore()
const authStore = useAuthStore()
const friendStore = useFriendStore()
const drawSyncerStore = useDrawSyncer()
const { cancelSendMateRequest, sendMateRequest, match } = useSocketService()

const { activeChats, messagesByChat, typingStatuses } = storeToRefs(chatStore)
const { user } = storeToRefs(authStore)
const { friends, isFriendOnline, friendRequestLoading } = storeToRefs(friendStore)
const { lobbyChatMessages, roomMembers } = storeToRefs(drawSyncerStore)

const isInLobby = computed(() => !!roomMembers.value?.length)
const totalUnread = computed(() => activeChats.value.reduce((total, chat) => total + (chat.unread_counts?.[user.value?._id || ''] || 0), 0))

// === Message Logic ===
const inputText = ref('')
const isSending = ref(false)
const messageContainer = ref<HTMLElement | null>(null)
const chatInputRef = ref<any>(null)

// Unified Message Array
const currentMessages = computed(() => {
  return activeTab.value === 'lobby' ? lobbyChatMessages.value : (messagesByChat.value[activeTab.value] || [])
})

// === Lobby Preview Logic ===
const visiblePreviewMessages = ref<any[]>([])
let isInitialLobbyLoad = true

watch(lobbyChatMessages, (messages) => {
  if (isInitialLobbyLoad) { isInitialLobbyLoad = false; return }
  const latest = messages[messages.length - 1]
  if (!latest) return

  visiblePreviewMessages.value.push(latest)
  if (visiblePreviewMessages.value.length > 2) visiblePreviewMessages.value.shift()

  chatWidget.triggerLobbyPreview()

  setTimeout(() => {
    visiblePreviewMessages.value = visiblePreviewMessages.value.filter(m => m !== latest)
  }, 5000)
}, { deep: true })

// Helper mappings
const isMe = (msg: any) => msg.sender_id === user.value?._id || msg.member?._id === user.value?._id
const isCompact = (msg: any, index: number) => {
  if (index === 0) return false
  const prev = currentMessages.value[index - 1]
  const currentId = msg.sender_id || msg.member?._id
  const prevId = prev.sender_id || prev.member?._id
  return currentId === prevId && prev.type !== 'join' && prev.type !== 'leave'
}

const getPartnerIdFromChat = (chat: any) => chat?.participants?.find((p: any) => p._id !== user.value?._id)?._id || ''
const getPartnerInfo = (tabId: string) => {
  const chat = activeChats.value.find(c => c._id === tabId)
  let partnerId = '', name = 'New Chat', img = ''
  if (chat) {
    const p = chat.participants.find((p: any) => p._id !== user.value?._id)
    partnerId = p?._id || ''; name = p?.name || 'Mate'; img = p?.img || ''
  } else {
    const f = friends.value.find(f => f._id === tabId)
    partnerId = f?._id || ''; name = f?.name || 'Mate'; img = f?.img || ''
  }
  return { id: partnerId, name, img, isOnline: partnerId ? isFriendOnline.value(partnerId) : false, isTyping: partnerId ? typingStatuses.value[partnerId] : false }
}

const currentPartnerInfo = computed(() => getPartnerInfo(activeTab.value))
const panelTitle = computed(() => {
  if (activeTab.value === 'overview') return 'Chats & Vibes'
  if (activeTab.value === 'lobby') return 'Lobby Chat'
  return currentPartnerInfo.value.name
})

const scrollToBottom = async () => {
  await nextTick()
  // Trigger immediately and then slightly delayed to ensure Ionic Modal has fully laid out the DOM
  setTimeout(() => {
    if (messageContainer.value) messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }, 50)
  setTimeout(() => {
    if (messageContainer.value) messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }, 250)
}

let typingTimeout: any = null
const handleTyping = () => {
  if (activeTab.value === 'lobby' || activeTab.value === 'overview') return
  const pId = currentPartnerInfo.value.id
  if (!pId) return
  chatStore.sendTypingIndicator(pId, true)
  if (typingTimeout) clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => chatStore.sendTypingIndicator(pId, false), 1500)
}

const handleSend = async () => {
  const text = inputText.value.trim()
  if (!text || isSending.value) return

  if (activeTab.value === 'lobby') {
    sendLobbyMessage(text)
    inputText.value = ''
    scrollToBottom()
    chatInputRef.value?.$el.setFocus()
    return
  }

  const pId = currentPartnerInfo.value.id
  if (!pId) return

  inputText.value = ''
  isSending.value = true

  try {
    const response = await chatStore.sendMessage(pId, text)
    if (activeChatHeads.value.find(h => h.id === activeTab.value && h.type === 'friend')) {
      chatWidget.removeChatHead(activeTab.value)
      chatWidget.openPrivateChat(response.conversation._id)
    }
    scrollToBottom()
  } catch (error) {
    inputText.value = text
  } finally {
    isSending.value = false
    chatStore.sendTypingIndicator(pId, false)
    chatInputRef.value?.$el.setFocus()
  }
}

watch(activeTab, async (newTab) => {
  if (newTab !== 'overview' && newTab !== 'lobby') {
    await chatStore.loadMessages(newTab, true)
  }
  scrollToBottom()
})

watch(() => currentMessages.value.length, () => {
  if (isExpanded.value) scrollToBottom()
})

// === Draggable Dock Logic ===
const widgetRef = ref<HTMLElement | null>(null)
const dockHandleRef = ref<HTMLElement | null>(null)
const { width, height } = useWindowSize()
const getSafeTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ion-safe-area-top').trim()) || 0

let savedX = width.value - 80
let savedY = height.value / 2
const isOverTrash = ref(false)

const { x, y, isDragging } = useDraggable(widgetRef, {
  initialValue: { x: savedX, y: savedY },
  handle: dockHandleRef,
  onMove: (pos) => {
    const isNearBottom = pos.y > height.value - 150
    const isNearCenter = pos.x > width.value / 4 && pos.x < (width.value * 3) / 4
    isOverTrash.value = isNearBottom && isNearCenter
    pos.x = clamp(pos.x, 10, width.value - 70)
    pos.y = clamp(pos.y, getSafeTop() + 10, height.value - 80)
  },
  onEnd: () => {
    if (isOverTrash.value) chatWidget.hideWidget()
    isOverTrash.value = false
  }
})

// === Popovers & Action Sheets ===
const popoverEvent = ref<any>()
const accountPopoverOpen = ref(false)
const accountInfoToShow = ref<Mate>()
const friendToBe = ref<string>()

const openFriendPopover = (ev: any, member: Mate | string) => {
  if (typeof member === 'string') return // Fallback if full object not passed
  accountInfoToShow.value = member
  accountPopoverOpen.value = true
  popoverEvent.value = ev
}

const becomeFriends = (follower: string) => {
  if (!user.value) return
  friendToBe.value = follower
  if (user.value.mate_requests_received.some(m => m == follower)) match({ _id: user.value._id, mate_id: follower })
  else sendMateRequest({ sender: user.value._id, sender_name: user.value.name, receiver: follower })
}

const openInviteOptions = async () => {
  const buttons = []
  if (activeTab.value === 'lobby') {
    buttons.push(
      { text: 'Invite to Private Chat', handler: () => console.log('Private') },
      { text: 'Invite to Online Lobby', handler: () => console.log('Lobby') }
    )
  } else {
    buttons.push({ text: 'Invite to Lobby', handler: () => console.log('Invite to lobby') })
  }
  buttons.push({ text: 'Cancel', role: 'cancel' })
  const actionSheet = await actionSheetController.create({ header: 'Invite Options', cssClass: 'liquid-action-sheet', buttons })
  await actionSheet.present()
}

const openReportOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'User Options',
    cssClass: 'liquid-action-sheet',
    buttons: [
      { text: 'Report User', role: 'destructive', icon: svg(mdiFlagVariantOutline), handler: () => {} },
      { text: 'Block User', role: 'destructive', icon: svg(mdiBlockHelper), handler: () => {} },
      { text: 'Cancel', role: 'cancel' }
    ]
  })
  await actionSheet.present()
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fade-slow-enter-active, .fade-slow-leave-active { transition: all 0.3s ease; }
.fade-slow-enter-from, .fade-slow-leave-to { opacity: 0; transform: translate(-50%, 20px) scale(0.8); }

.chat-fade-enter-active, .chat-fade-leave-active { transition: all 0.3s ease-out; }
.chat-fade-enter-from { opacity: 0; transform: translateX(-15px) scale(0.95); }
.chat-fade-leave-to { opacity: 0; transform: translateY(-10px); }

/* Socket Pop Animation */
@keyframes popBounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  75% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.animate-pop-bounce { animation: popBounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

.pb-safe { padding-bottom: env(safe-area-inset-bottom, 16px); }

/* Ion Modal Styling */
ion-modal.liquid-chat-modal {
  --height: 80vh;
  --border-radius: 2.5rem 2.5rem 0 0;
  --box-shadow: 0 -20px 40px rgba(0,0,0,0.2);
}

.comment {
  background-color: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(12px);
}
</style>