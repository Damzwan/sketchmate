<template>
  <!-- ========================================== -->
  <!-- COMPACT GROUPED TOASTS (Liquid Gaming Style)-->
  <!-- ========================================== -->
  <div v-if="!isExpanded && !isFullscreen" class="fixed top-safe mt-20 right-4 z-[100] flex flex-col gap-2 w-64 pointer-events-none">
    <TransitionGroup name="chat-toast">
      <div
        v-for="group in recentNotifications"
        :key="group.tabId"
        @click.stop="openFromNotification(group.tabId)"
        class="relative flex items-start p-2.5 rounded-xl border backdrop-blur-xl shadow-2xl pointer-events-auto cursor-pointer overflow-hidden transition-all active:scale-[0.98] bg-zinc-900/60 border-white/10"
      >
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="group.tabId === 'lobby' ? 'bg-cyan-400' : 'bg-secondary'"></div>
        <img :src="group.img" class="w-8 h-8 rounded-lg object-cover border border-white/10 shadow-md shrink-0 ml-1" />
        <div class="flex-1 min-w-0 ml-2.5 flex flex-col">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[10px] font-black text-white/70 uppercase tracking-tighter">{{ group.subtitle }}</span>
          </div>
          <div class="flex flex-col">
            <TransitionGroup name="line-slide">
              <p v-for="line in group.lines" :key="line.id" class="text-[13px] text-white/90 leading-tight cabin-sketch-regular font-bold tracking-wide break-words">
                {{ line.text }}
              </p>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>

  <!-- ========================================== -->
  <!-- LIQUID FROST DRAWER                        -->
  <!-- ========================================== -->
  <ion-modal
    :is-open="isVisible && isExpanded"
    @did-present="scrollToBottom(true)"
    @did-dismiss="chatWidget.closePanel()"
    :keepContentsMounted="true"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    class="liquid-chat-modal"
  >
    <div class="flex flex-col h-full bg-primary/30 backdrop-blur-3xl relative">

      <!-- TABS HEADER -->
      <div class="flex items-center gap-3 px-4 pt-4 pb-3 overflow-x-auto hide-scrollbar border-b border-primary/40 bg-white/20 rounded-t-[2.5rem] shrink-0">
        <!-- Overview -->
        <div @click="openOverviewTab" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all cursor-pointer" :class="activeTab === 'overview' ? 'bg-secondary text-white shadow-lg border-2 border-white/60 scale-105' : 'bg-secondary/15 text-secondary border border-secondary/30 grayscale-[40%]'">
          <ion-icon :icon="chatbubblesOutline" class="text-xl" />
          <div v-if="unreadConversationsCount > 0 && activeTab !== 'overview'" class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-black text-white">{{ unreadConversationsCount }}</div>
        </div>

        <!-- Lobby -->
        <div v-if="isInLobby" @click="openLobbyTab" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center border transition-all cursor-pointer" :class="activeTab === 'lobby' ? 'bg-white shadow-lg border-white text-black scale-105' : 'bg-white/30 border-white/40 text-black/40'">
          <ion-icon :icon="svg(mdiEarth)" class="text-2xl" />
          <div v-if="lobbyUnreadCount > 0 && activeTab !== 'lobby'" class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-black text-white">{{ lobbyUnreadCount }}</div>
        </div>

        <!-- Chat Heads -->
        <div v-for="head in activeChatHeads" :key="head.id" @click="activeTab = head.id" class="relative shrink-0 w-12 h-12 rounded-[1.2rem] transition-all cursor-pointer" :class="activeTab === head.id ? 'shadow-lg border-2 border-white scale-105' : 'opacity-60 border border-transparent'">
          <img :src="getPartnerInfo(head.id)?.img" class="w-full h-full rounded-[1.1rem] object-cover" />
          <div v-if="getUnreadCount(head.id) > 0 && activeTab !== head.id" class="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white z-10">{{ getUnreadCount(head.id) }}</div>
          <div v-if="activeTab === head.id" @click.stop="chatWidget.removeChatHead(head.id)" class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center z-20 border border-white/40">
            <ion-icon :icon="svg(mdiClose)" class="text-white text-[10px]" />
          </div>
        </div>
      </div>

      <!-- HEADER INFO & REPORT (Only for active chats) -->
      <div v-if="activeTab !== 'overview'" class="flex items-center justify-between px-4 py-2 bg-white/10 shrink-0 border-b border-white/10">
        <div class="flex flex-col">
          <span class="text-sm font-black text-black italic leading-none">{{ panelTitle }}</span>
          <span class="text-[9px] font-bold text-black/40 uppercase mt-1">
            <span v-if="activeTab === 'lobby'">{{ roomMembers.length }} vibing</span>
            <span v-else-if="currentPartnerInfo?.isOnline" class="text-green-600">Online</span>
            <span v-else>Offline</span>
          </span>
        </div>
        <button v-if="activeTab !== 'lobby'" @click.stop="openReportOptions" class="p-2 rounded-xl active:scale-90 transition-all">
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-black/40 text-xl" />
        </button>
      </div>

      <!-- CONTENT AREA -->
      <div
        class="flex-1 overflow-y-auto relative hide-scrollbar px-3 py-2"
        ref="messageContainer"
      >
        <!-- OVERVIEW VIEW -->
        <div v-if="activeTab === 'overview'" class="flex flex-col h-full">
          <div v-if="!isCreatingChat" class="animate-fade-in pb-20">
            <div class="px-2 mb-4 mt-2 text-[10px] font-black text-black/40 uppercase">Online Mates</div>
            <div class="flex overflow-x-auto hide-scrollbar gap-3 px-2 mb-6">
              <div v-for="friend in onlineMates" :key="friend._id" @click="startChatWithFriend(friend)" class="flex flex-col items-center gap-1 shrink-0 w-12 cursor-pointer">
                <div class="relative w-12 h-12 rounded-2xl transition-transform active:scale-90">
                  <img :src="friend.img" class="w-full h-full object-cover rounded-2xl border border-white" />
                  <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white"></div>
                </div>
                <span class="text-[9px] font-bold text-black/80 truncate w-full text-center">{{ friend.name.split(' ')[0] }}</span>
              </div>
            </div>
            <div class="px-2 mb-3 text-base font-black italic cabin-sketch-regular">Conversations</div>
            <div class="space-y-2">
              <ConversationItem v-for="chat in activeChats" :key="chat._id" :chat="chat" :currentUserId="user?._id || ''" :isOnline="isFriendOnline(getPartnerIdFromChat(chat))" :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false" @open="chatWidget.openPrivateChat(chat._id)" />
            </div>
          </div>

          <!-- NEW CHAT LIST -->
          <div v-else class="animate-fade-in space-y-6 pb-20">
            <div class="flex items-center justify-between p-2">
              <span class="text-sm font-black italic cabin-sketch-regular">Select a Mate</span>
              <button @click="isCreatingChat = false" class="text-xs font-black text-secondary uppercase tracking-widest">Cancel</button>
            </div>

            <!-- Ready to Chat -->
            <div v-if="eligibleMates.length > 0" class="space-y-2">
              <p class="text-[10px] font-black text-black/30 uppercase px-2 tracking-widest">Ready to Chat</p>
              <button
                v-for="friend in eligibleMates"
                :key="friend._id"
                @click="startChatWithFriend(friend)"
                class="w-full flex items-center p-3 bg-white/40 rounded-3xl border border-white/60 active:scale-95 transition-all shadow-sm"
              >
                <img :src="friend.img" class="w-11 h-11 rounded-xl object-cover border border-white/40 shadow-sm" />
                <span class="ml-4 text-base font-bold text-black">{{ friend.name }}</span>
                <div v-if="isFriendOnline(friend._id)" class="ml-auto w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              </button>
            </div>

            <!-- Needs Update -->
            <div v-if="ineligibleMates.length > 0" class="space-y-2">
              <p class="text-[10px] font-black text-black/20 uppercase px-2 tracking-widest">Needs Update</p>
              <div
                v-for="friend in ineligibleMates"
                :key="friend._id"
                class="w-full flex items-center p-3 bg-white/10 rounded-3xl border border-black/5 opacity-50 grayscale"
              >
                <img :src="friend.img" class="w-10 h-10 rounded-xl object-cover border border-white/10 shadow-sm" />
                <div class="ml-4 flex flex-col items-start">
                  <span class="text-sm font-bold text-black/60">{{ friend.name }}</span>
                  <span class="text-[8px] font-black uppercase text-black/30 mt-0.5">Version {{ friend.last_seen_version || '???' }}</span>
                </div>
                <div class="ml-auto text-xs opacity-30">🔒</div>
              </div>
            </div>
          </div>
        </div>

        <!-- MESSAGE FLOW -->
        <div v-else class="space-y-2 pb-4 flex flex-col justify-end min-h-full animate-tab-in">
          <div v-for="(msg, index) in currentMessages" :key="msg._id" class="w-full">
            <div v-if="msg.type && msg.type !== 'message'" @click="(ev) => openFriendPopover(ev, msg.member)" class="text-center text-[10px] italic text-black/50 my-3 cabin-sketch-regular cursor-pointer">
              <span class="font-bold">{{ msg.member?.name }}</span> {{ msg.type === 'join' ? 'hopped in' : 'left' }}
            </div>
            <div v-else class="flex items-start gap-2.5 px-1 py-0.5" :class="{'flex-row-reverse': isMe(msg), 'mt-[-6px]': isCompact(msg, index)}">
              <div class="w-8 h-8 shrink-0 flex items-end" v-if="!isMe(msg) && !isCompact(msg, index)">
                <img @click="(ev) => openFriendPopover(ev, msg.member || getPartnerInfo(activeTab).id)" :src="msg.member?.img || getPartnerInfo(activeTab).img" class="w-8 h-8 rounded-xl border border-white shadow-sm cursor-pointer object-cover" />
              </div>
              <div v-else-if="!isMe(msg)" class="w-8 shrink-0"></div>
              <div class="flex flex-col max-w-[75%]" :class="{ 'items-end': isMe(msg) }">
                <div class="py-2 px-3.5 text-[15px] shadow-sm cabin-sketch-regular tracking-wide" :class="isMe(msg) ? 'bg-secondary text-white rounded-2xl rounded-tr-sm' : 'bg-white/80 text-black rounded-2xl rounded-tl-sm border border-white/60'">
                  <div v-if="!isCompact(msg, index) && !isMe(msg) && activeTab === 'lobby'" class="text-[8px] font-black mb-1 opacity-50 uppercase font-sans">{{ msg.member?.name }}</div>
                  <div class="font-bold">{{ msg.content || msg.message }}</div>
                  <div class="text-[8px] mt-1 font-sans opacity-60 text-right">{{ dayjs(msg.createdAt).format('HH:mm') }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div v-if="activeTab !== 'overview'" class="p-3 bg-white/40 border-t border-white/50 backdrop-blur-2xl pb-safe shrink-0">
        <div class="flex items-center gap-2">
          <button @click.stop="openInviteOptions" class="w-11 h-11 rounded-2xl border border-white/80 bg-white/60 flex items-center justify-center active:scale-90 transition-all">
            <ion-icon :icon="activeTab === 'lobby' ? svg(mdiAccountMultiplePlusOutline) : svg(mdiAccountPlusOutline)" class="text-2xl text-secondary" />
          </button>
          <div class="flex-1 flex items-center gap-1 bg-white/80 border border-white/80 rounded-2xl p-1.5 shadow-inner">
            <ion-input
              ref="chatInput"
              color="secondary"
              v-model="inputText"
              @keyup.enter="handleSend"
              placeholder="Type something..."
              class="cabin-sketch-regular font-bold px-2"
            />
            <button
              @mousedown.prevent
              @click="handleSend"
              class="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all"
            >
              <ion-icon :icon="svg(mdiSend)" class="text-white text-lg ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- OVERVIEW FAB -->
      <ion-fab v-show="activeTab === 'overview' && !isCreatingChat" slot="fixed" vertical="bottom" horizontal="end" class="absolute bottom-6 right-4 z-50">
        <ion-fab-button color="secondary" @click="isCreatingChat = true">
          <ion-icon :icon="svg(mdiChatPlusOutline)" class="text-2xl text-white" />
        </ion-fab-button>
      </ion-fab>
    </div>
  </ion-modal>

  <!-- LIQUID FRIEND POPOVER -->
  <ion-popover
    :event="popoverEvent"
    @didDismiss="accountPopoverOpen = false"
    :is-open="accountPopoverOpen"
    v-if="user"
    class="liquid-popover"
  >
    <div class="flex flex-col justify-center items-center p-5 bg-white/20 backdrop-blur-3xl border border-white/30 rounded-[2.5rem] w-[260px] shadow-2xl" v-if="accountInfoToShow">
      <div class="relative mb-4">
        <img :src="accountInfoToShow.img" class="w-24 h-24 object-cover rounded-[2rem] border-4 border-white shadow-xl">
        <div v-if="isFriendOnline(accountInfoToShow._id)" class="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-white rounded-full"></div>
      </div>

      <p class="text-xl font-black text-black leading-tight text-center italic cabin-sketch-regular">
        {{ accountInfoToShow.name }}
      </p>
      <p v-if="accountInfoToShow._id === user._id" class="text-[10px] font-bold text-black/40 uppercase tracking-widest mt-1">That's You</p>

      <div v-if="accountInfoToShow._id !== user._id" class="mt-5 w-full flex flex-col gap-3">
        <ion-button v-if="user.mates.some(m => m._id === accountInfoToShow?._id)" color="secondary" expand="block" disabled class="liquid-btn opacity-50">
          Already Mates
        </ion-button>
        <template v-else>
          <ion-spinner color="secondary" v-if="friendRequestLoading" class="mx-auto" />
          <ion-button v-else-if="user.mate_requests_sent.some(m => m === accountInfoToShow?._id)" color="medium" expand="block" class="liquid-btn" @click="cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: accountInfoToShow._id})">
            Undo Request
          </ion-button>
          <ion-button v-else color="secondary" expand="block" class="liquid-btn" @click="becomeFriends(accountInfoToShow._id)">
            Add Friend
          </ion-button>
        </template>
      </div>
    </div>
  </ion-popover>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  actionSheetController,
  IonButton,
  IonFab,
  IonFabButton,
  IonIcon,
  IonInput,
  IonModal,
  IonPopover,
  IonSpinner
} from '@ionic/vue'
import { chatbubblesOutline } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import {
  mdiAccountMultiplePlusOutline,
  mdiAccountPlusOutline,
  mdiChatPlusOutline,
  mdiClose,
  mdiDotsHorizontal,
  mdiEarth,
  mdiSend
} from '@mdi/js'
import { compareVersions, svg } from '@/helper/general.helper'
import dayjs from 'dayjs'

import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useFriendStore } from '@/store/friend.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useSocketService } from '@/service/api/socket/socket.service'
import { sendLobbyMessage } from '@/service/api/socket/drawSyncing.socket'
import ConversationItem from './ConversationItem.vue'
import { useDrawUIStore } from '@/draw/store/drawUI.store'

// --- Stores ---
const chatWidget = useChatWidgetStore()
const { isVisible, isExpanded, activeTab, activeChatHeads } = storeToRefs(chatWidget)
const chatStore = useChatStore()
const authStore = useAuthStore()
const friendStore = useFriendStore()
const drawSyncerStore = useDrawSyncer()
const { cancelSendMateRequest, sendMateRequest } = useSocketService()
const {isFullscreen} = storeToRefs(useDrawUIStore())

const { activeChats, messagesByChat, typingStatuses } = storeToRefs(chatStore)
const { user } = storeToRefs(authStore)
const { friends, isFriendOnline } = storeToRefs(friendStore)
const { lobbyChatMessages, roomMembers } = storeToRefs(drawSyncerStore)

// --- Constants ---
const MIN_CHAT_VERSION = '0.4.3'

// --- Computed Lists ---
const isInLobby = computed(() => !!roomMembers.value?.length)
const onlineMates = computed(() => friends.value.filter(f => isFriendOnline.value(f._id)))

const canChat = (version?: string) => {
  if (!version) return false
  return compareVersions(version, MIN_CHAT_VERSION) !== -1
}

const eligibleMates = computed(() => {
  return friends.value.filter(f => canChat(f.last_seen_version))
})

const ineligibleMates = computed(() => {
  return friends.value.filter(f => !canChat(f.last_seen_version))
})

const lobbyLastSeenCount = ref(0)
const lobbyUnreadCount = computed(() => Math.max(0, lobbyChatMessages.value.length - lobbyLastSeenCount.value))
const unreadConversationsCount = computed(() => activeChats.value.filter(c => (c.unread_counts?.[user.value?._id || ''] || 0) > 0).length)

const isCreatingChat = ref(false)

// --- Tab Methods ---
const openOverviewTab = () => { activeTab.value = 'overview'; isCreatingChat.value = false }
const openLobbyTab = () => { activeTab.value = 'lobby'; lobbyLastSeenCount.value = lobbyChatMessages.value.length }

// --- Friend Popover ---
const accountPopoverOpen = ref(false)
const popoverEvent = ref<Event | null>(null)
const accountInfoToShow = ref<any>(null)
const friendRequestLoading = ref(false)

const openFriendPopover = (ev: Event, info: any) => {
  if (!info) return
  accountInfoToShow.value = info
  popoverEvent.value = ev
  accountPopoverOpen.value = true
}

const becomeFriends = async (id: string) => {
  friendRequestLoading.value = true
  await sendMateRequest({ sender: user.value._id, sender_name: user.value.name, receiver: id })
  friendRequestLoading.value = false
}

// --- Action Sheets ---
const openReportOptions = async () => {
  const partner = getPartnerInfo(activeTab.value)
  const actionSheet = await actionSheetController.create({
    header: `Manage ${partner.name}`,
    cssClass: 'liquid-action-sheet',
    buttons: [
      { text: 'Block User', role: 'destructive', handler: () => { /* Logic */ } },
      { text: 'Report Content', handler: () => { /* Logic */ } },
      { text: 'Cancel', role: 'cancel' }
    ]
  })
  await actionSheet.present()
}

const openInviteOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Share Session',
    cssClass: 'liquid-action-sheet',
    buttons: [
      { text: 'Copy Invite Link', handler: () => { /* Logic */ } },
      { text: 'Invite Friends', handler: () => { /* Logic */ } },
      { text: 'Cancel', role: 'cancel' }
    ]
  })
  await actionSheet.present()
}

// --- Notification Logic ---
const recentNotifications = ref<any[]>([])
let isInitialLobbyLoad = true
let isInitialChatLoad = true

const openFromNotification = (tabId: string) => {
  recentNotifications.value = recentNotifications.value.filter(n => n.tabId !== tabId)
  chatWidget.openPanel()
  if (tabId === 'lobby') openLobbyTab(); else chatWidget.openPrivateChat(tabId)
}

const addNotification = (notif: any) => {
  if (isExpanded.value) return
  const existing = recentNotifications.value.find(n => n.tabId === notif.tabId)
  const messageText = notif.text || notif.content
  if (existing) {
    existing.lines.push({ id: Date.now(), text: messageText })
    if (existing.lines.length > 3) existing.lines.shift()
    clearTimeout(existing.timer)
    existing.timer = setTimeout(() => { recentNotifications.value = recentNotifications.value.filter(n => n.tabId !== notif.tabId) }, 8000)
  } else {
    const newGroup = { tabId: notif.tabId, subtitle: notif.subtitle, img: notif.img, lines: [{ id: Date.now(), text: messageText }], timer: null as any }
    newGroup.timer = setTimeout(() => { recentNotifications.value = recentNotifications.value.filter(n => n.tabId !== notif.tabId) }, 8000)
    recentNotifications.value.push(newGroup)
  }
}

watch(lobbyChatMessages, (messages) => {
  if (isInitialLobbyLoad) { isInitialLobbyLoad = false; lobbyLastSeenCount.value = messages.length; return }
  if (activeTab.value === 'lobby' && isExpanded.value) { lobbyLastSeenCount.value = messages.length; return }
  const latest = messages[messages.length - 1]
  if (!latest || latest.member?._id === user.value?._id) return
  addNotification({ tabId: 'lobby', subtitle: latest.member?.name, text: latest.content || latest.message, img: latest.member?.img })
}, { deep: true })

watch(() => activeChats.value.map(c => c.last_message?._id), (newIds, oldIds) => {
  if (isInitialChatLoad) { isInitialChatLoad = false; return }
  newIds.forEach((id, i) => {
    if (id && (!oldIds || !oldIds.includes(id))) {
      const chat = activeChats.value[i]
      if (chat?.last_message?.sender_id !== user.value?._id) {
        const p = getPartnerInfo(chat._id)
        addNotification({ tabId: chat._id, subtitle: p.name, text: chat.last_message?.content, img: p.img })
      }
    }
  })
}, { deep: true })

// --- Infrastructure ---
const inputText = ref('')
const messageContainer = ref<HTMLElement | null>(null)
const currentMessages = computed(() => activeTab.value === 'lobby' ? lobbyChatMessages.value : (messagesByChat.value[activeTab.value] || []))
const panelTitle = computed(() => activeTab.value === 'overview' ? 'Mates' : (activeTab.value === 'lobby' ? 'Session Lobby' : getPartnerInfo(activeTab.value).name))
const currentPartnerInfo = computed(() => activeTab.value !== 'overview' && activeTab.value !== 'lobby' ? getPartnerInfo(activeTab.value) : null)

const getUnreadCount = (chatId: string) => {
  const chat = activeChats.value.find(c => c._id === chatId)
  return chat?.unread_counts?.[user.value?._id || ''] || 0
}

const scrollToBottom = (instant = false) => {
  const el = messageContainer.value
  if (!el) return
  if (instant) {
    el.scrollTop = el.scrollHeight
    return
  }
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
  })
}

const handleSend = async () => {
  if (!inputText.value.trim()) return
  if (activeTab.value === 'lobby') sendLobbyMessage(inputText.value.trim())
  else await chatStore.sendMessage(getPartnerInfo(activeTab.value).id, inputText.value.trim())
  inputText.value = ''; scrollToBottom()
}

const startChatWithFriend = (friend: any) => {
  const existing = activeChats.value.find(c => c.participants.some(p => p._id === friend._id))
  if (existing) chatWidget.openPrivateChat(existing._id); else { chatWidget.addChatHead(friend._id, 'friend'); activeTab.value = friend._id }
  isCreatingChat.value = false
}

const getPartnerIdFromChat = (chat: any) => chat?.participants?.find((p: any) => p._id !== user.value?._id)?._id || ''
const getPartnerInfo = (tabId: string) => {
  const chat = activeChats.value.find(c => c._id === tabId)
  if (chat) { const p = chat.participants.find(p => p._id !== user.value?._id); return { id: p?._id, name: p?.name, img: p?.img, isOnline: isFriendOnline.value(p?._id) } }
  const f = friends.value.find(f => f._id === tabId); return { id: f?._id, name: f?.name, img: f?.img, isOnline: isFriendOnline.value(f?._id) }
}
const isMe = (msg: any) => msg.sender_id === user.value?._id || msg.member?._id === user.value?._id
const isCompact = (msg: any, index: number) => index > 0 && (msg.sender_id || msg.member?._id) === (currentMessages.value[index-1].sender_id || currentMessages.value[index-1].member?._id) && currentMessages.value[index-1].type !== 'join'

watch(activeTab, async (newTab) => {
  // Reset scroll immediately to prevent jitters
  if (messageContainer.value) messageContainer.value.scrollTop = 0

  if (newTab !== 'overview' && newTab !== 'lobby') {
    await chatStore.loadMessages(newTab, true)
  }
  if (newTab === 'lobby') lobbyLastSeenCount.value = lobbyChatMessages.value.length

  await nextTick()
  scrollToBottom(true)
})
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 16px); }

ion-modal.liquid-chat-modal {
  --height: 85vh;
  --border-radius: 2.5rem 2.5rem 0 0;
  --box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.15);
}

/* Liquid Popover Styling */
.liquid-popover {
  --background: transparent;
  --box-shadow: none;
}
.liquid-popover::part(content) {
  border-radius: 2.5rem;
  background: transparent;
}

.liquid-btn {
  --border-radius: 1.2rem;
  --box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  font-weight: 900;
}

/* Toast Animations */
.chat-toast-enter-active { transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.chat-toast-leave-active { transition: all 0.6s ease-in; position: absolute; width: 100%; }
.chat-toast-move { transition: transform 0.4s ease; }
.chat-toast-enter-from { opacity: 0; transform: translateX(60px) scale(0.9); }
.chat-toast-leave-to { opacity: 0; transform: translateX(40px); filter: blur(8px); }
.line-slide-enter-active { transition: all 0.3s ease-out; }
.line-slide-enter-from { opacity: 0; transform: translateY(5px); }

/* Basic Fade for UI elements */
.animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

@keyframes tabIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-tab-in {
  animation: tabIn 0.15s ease-out forwards;
}
</style>