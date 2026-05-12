<!-- components/chat/ChatOverview.vue -->
<template>
  <div class="flex flex-col h-full">
    <!-- 1. DRAWING INVITES -->
    <InviteList
      :invitations="invitations"
      @join="(roomId) => $emit('join-session', roomId)"
    />

    <!-- 2. MATE PROPOSALS -->
    <div v-if="incomingMateRequests.length > 0" class="px-2 mb-6 animate-fade-in">
      <div class="flex items-center gap-2 mb-2 px-1">
        <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
        <div class="text-[10px] font-black text-secondary uppercase tracking-widest">
          Mate Proposals
        </div>
      </div>

      <div class="space-y-2">
        <ConversationItem
          v-for="request in incomingMateRequests"
          :key="'proposal-' + request._id"
          :chat="request"
          :currentUserId="user?._id || ''"
          :isOnline="isFriendOnline(getPartnerIdFromChat(request))"
          :isTyping="typingStatuses[getPartnerIdFromChat(request)] || false"
          @open="chatWidget.openPrivateChat(request._id)"
        />
      </div>
    </div>

    <!-- 3. CREATE CHAT STATE (Modularized) -->
    <ChatFriendPicker
      v-if="isCreatingChat"
      :friends="friends"
      :min-chat-version="MIN_CHAT_VERSION"
      :is-friend-online="isFriendOnline"
      @cancel="isCreatingChat = false"
      @select-friend="startChatWithFriend"
    />

    <!-- 4. OVERVIEW STATE -->
    <div v-else class="animate-fade-in pb-24 overflow-y-auto hide-scrollbar">

      <LobbyConversationItem
        v-if="isInLobby"
        :unreadCount="lobbyUnreadCount"
        :memberCount="roomMembers.length"
        :lastMessage="lastLobbyMessage"
        @open="activeTab = 'lobby'"
      />

      <!-- ONLINE MATES HORIZONTAL SCROLL -->
      <div v-if="onlineMates.length > 0">
        <div class="px-2 mb-4 mt-2 text-[10px] font-black text-black/40 uppercase tracking-widest">Online Mates</div>
        <div class="flex overflow-x-auto hide-scrollbar gap-4 px-2 mb-8">
          <div v-for="friend in onlineMates" :key="friend._id" @click="startChatWithFriend(friend)"
               class="flex flex-col items-center gap-1.5 shrink-0 w-14 cursor-pointer">
            <div class="relative w-14 h-14 rounded-2xl transition-transform active:scale-90 shadow-sm">
              <img :src="friend.img" class="w-full h-full object-cover rounded-2xl border-2 border-white" />
              <div
                class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-white shadow-sm"></div>
            </div>
            <span class="text-[9px] font-black text-black/80 truncate w-full text-center uppercase tracking-tighter">
              {{ friend.name.split(' ')[0] }}
            </span>
          </div>
        </div>
      </div>

      <div class="px-2 mb-4 text-2xl font-normal cabin-sketch-regular text-black">
        Conversations
      </div>
      <div class="space-y-2 px-2">
        <!-- EMPTY STATE -->
        <div v-if="combinedConversations.length === 0 && !isInLobby"
             class="p-10 text-center bg-black/5 rounded-[2rem] border border-dashed border-black/10">
          <p class="text-[11px] font-bold text-black/20 italic uppercase tracking-widest leading-relaxed">
            Your sketchbook is empty.<br />Send a balloon to find a mate!
          </p>
        </div>

        <ConversationItem
          v-for="chat in combinedConversations"
          :key="chat._id"
          :chat="chat"
          :currentUserId="user?._id || ''"
          :isOnline="isFriendOnline(getPartnerIdFromChat(chat))"
          :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false"
          @open="chatWidget.openPrivateChat(chat._id)"
        />
      </div>
    </div>

    <!-- FLOATING ACTION BUTTON -->
    <ion-fab v-show="!isCreatingChat" slot="fixed" vertical="bottom" horizontal="end" class="absolute bottom-6 right-2">
      <ion-fab-button color="secondary" @click="isCreatingChat = true" class="shadow-none">
        <ion-icon :icon="svg(mdiChatPlusOutline)" class="text-2xl text-white" />
      </ion-fab-button>
    </ion-fab>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { IonFab, IonFabButton, IonIcon } from '@ionic/vue'
import { mdiChatPlusOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import LobbyConversationItem from './LobbyConversationItem.vue'
import ConversationItem from './ConversationItem.vue'
import InviteList from '@/components/chat/InviteList.vue'
import ChatFriendPicker from './ChatFriendPicker.vue' // <-- Added Import

import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useFriendStore } from '@/store/friend.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

defineEmits(['join-session'])

const MIN_CHAT_VERSION = '0.4.3'

const chatWidget = useChatWidgetStore()
const chatStore = useChatStore()
const friendStore = useFriendStore()
const drawSyncer = useDrawSyncer()

const { activeTab } = storeToRefs(chatWidget)
const { activeChats, typingStatuses } = storeToRefs(chatStore)
const { user } = storeToRefs(useAuthStore())
const { friends, isFriendOnline, pendingRequests } = storeToRefs(friendStore)
const { lobbyChatMessages, roomMembers, invitations } = storeToRefs(drawSyncer)

const isCreatingChat = ref(false)
const isInLobby = computed(() => !!roomMembers.value?.length)
const lobbyUnreadCount = ref(0)

const incomingMateRequests = computed(() => {
  return activeChats.value.filter(chat =>
    chat.status === 'mate_pending' &&
    chat.initiator_id !== user.value?._id
  )
})

const combinedConversations = computed(() => {
  const all = [...activeChats.value, ...pendingRequests.value]
  return all.sort((a, b) => {
    const dateA = new Date(a.updatedAt || 0).getTime()
    const dateB = new Date(b.updatedAt || 0).getTime()
    return dateB - dateA
  })
})

const onlineMates = computed(() =>
  friends.value.filter(f => isFriendOnline.value(f._id))
)

// Note: `eligibleMates` was removed here because `ChatFriendPicker` handles it internally now.

const lastLobbyMessage = computed(() => {
  const lastChatMessage = lobbyChatMessages.value.findLast(
    (item) => item.type === 'message'
  )
  return lastChatMessage?.type === 'message' ? lastChatMessage.message : undefined
})

const getPartner = (chat: any) =>
  chat?.participants?.find((p: any) => p._id !== user.value?._id)

const getPartnerIdFromChat = (chat: any) => getPartner(chat)?._id || ''

const startChatWithFriend = (friend: any) => {
  const existing = combinedConversations.value.find(c =>
    c.participants.some(p => p._id === friend._id)
  )

  if (existing) {
    chatWidget.openPrivateChat(existing._id)
  } else {
    chatWidget.addChatHead(friend._id, 'friend')
    activeTab.value = friend._id
  }
  isCreatingChat.value = false
  chatWidget.openPanel()
}
</script>

<style scoped>
/* (Keep your existing styles here) */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-fade-in {
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pb-24 {
  padding-bottom: 6rem;
}

</style>