<!-- components/chat/ChatOverview.vue -->
<template>
  <div class="flex flex-col h-full">
    <!-- 1. DRAWING INVITES (Live Session Invites) -->
    <InviteList
      :invitations="invitations"
      @join="(roomId) => $emit('join-session', roomId)"
    />

    <!-- 2. MATE PROPOSALS (Pinned to top for urgency) -->
    <div v-if="incomingMateRequests.length > 0" class="px-2 mb-6 animate-fade-in">
      <div class="flex items-center gap-2 mb-2 px-1">
        <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
        <div class="text-[10px] font-black text-secondary uppercase tracking-widest">
          Mate Proposals
        </div>
      </div>

      <div class="space-y-2">
        <!-- We use the standard ConversationItem here so it looks familiar but stays pinned -->
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

    <!-- 3. CREATE CHAT STATE (Friend Picker) -->
    <div v-if="isCreatingChat" class="animate-fade-in space-y-6 pb-20 px-2">
      <div class="flex items-center justify-between p-2">
        <span class="text-sm font-black italic cabin-sketch-regular">New Sketchmate</span>
        <button @click="isCreatingChat = false" class="text-xs font-black text-secondary uppercase tracking-widest">
          Cancel
        </button>
      </div>

      <div v-if="eligibleMates.length > 0" class="space-y-2">
        <p class="text-[10px] font-black text-black/30 uppercase px-2 tracking-widest">Your Mates</p>
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
    </div>

    <!-- 4. OVERVIEW STATE -->
    <div v-else class="animate-fade-in pb-24 overflow-y-auto hide-scrollbar">

      <!-- LOBBY ITEM -->
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

      <div class="px-2 mb-3 text-base cabin-sketch-regular">Conversations</div>

      <div class="space-y-2 px-2">
        <!-- EMPTY STATE -->
        <div v-if="combinedConversations.length === 0 && !isInLobby"
             class="p-10 text-center bg-black/5 rounded-[2rem] border border-dashed border-black/10">
          <p class="text-[11px] font-bold text-black/20 italic uppercase tracking-widest leading-relaxed">
            Your sketchbook is empty.<br />Send a balloon to find a mate!
          </p>
        </div>

        <!-- CONVERSATION LIST (Proposals still appear here so history is never lost) -->
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

    <!-- FLOATING ACTION BUTTON (Shadow removed for a cleaner look) -->
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
import { mdiChatPlusOutline, mdiHeart } from '@mdi/js'
import { compareVersions, svg } from '@/helper/general.helper'

import LobbyConversationItem from './LobbyConversationItem.vue'
import ConversationItem from './ConversationItem.vue'
import InviteList from '@/components/chat/InviteList.vue'

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

/**
 * MATE PROPOSALS:
 * List of people who sent a Mate request to the current user.
 */
const incomingMateRequests = computed(() => {
  return activeChats.value.filter(chat =>
    chat.status === 'mate_pending' &&
    chat.initiator_id !== user.value?._id
  )
})

/**
 * UNIFIED CONVERSATION LIST:
 * We show EVERYTHING here so chat history is never lost.
 */
const combinedConversations = computed(() => {
  const all = [...activeChats.value, ...pendingRequests.value]

  // We sort by updatedAt so the most recent interactions (proposals included) are at the top
  return all.sort((a, b) => {
    const dateA = new Date(a.updatedAt || 0).getTime()
    const dateB = new Date(b.updatedAt || 0).getTime()
    return dateB - dateA
  })
})

const onlineMates = computed(() =>
  friends.value.filter(f => isFriendOnline.value(f._id))
)

const eligibleMates = computed(() =>
  friends.value.filter(f => f.last_seen_version && compareVersions(f.last_seen_version, MIN_CHAT_VERSION) !== -1)
)

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

.cabin-sketch-regular {
  font-family: 'cabin-sketch-regular', sans-serif;
}

/* Remove default shadow from ion-fab-button if needed via deep selector */
::v-deep(ion-fab-button) {
  --box-shadow: none;
}
</style>