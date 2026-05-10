<template>
  <div class="flex items-center gap-3 px-4 pt-4 pb-3 overflow-x-auto hide-scrollbar border-b border-primary/40 bg-white/20 rounded-t-[2.5rem] shrink-0">

    <!-- Overview Tab -->
    <div @click="activeTab = 'overview'"
         class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all cursor-pointer"
         :class="activeTab === 'overview' ? 'bg-secondary text-white shadow-lg border-2 border-white/60 scale-105' : 'bg-secondary/15 text-secondary border border-secondary/30 grayscale-[40%]'">
      <ion-icon :icon="chatbubblesOutline" class="text-xl" />
      <div v-if="unreadConversationsCount > 0 && activeTab !== 'overview'"
           class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-black text-white">
        {{ unreadConversationsCount }}
      </div>
    </div>

    <!-- Lobby Tab -->
    <div v-if="isInLobby" @click="activeTab = 'lobby'"
         class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center border transition-all cursor-pointer"
         :class="activeTab === 'lobby' ? 'bg-cyan-400 shadow-lg border-white text-white scale-105' : 'bg-cyan-400/20 border-cyan-400/40 text-cyan-600'">
      <ion-icon :icon="svg(mdiEarth)" class="text-2xl" />
    </div>

    <!-- Dynamic Chat Heads -->
    <div v-for="head in activeChatHeads" :key="head.id" @click="activeTab = head.id"
         class="relative shrink-0 w-12 h-12 rounded-[1.2rem] transition-all cursor-pointer"
         :class="activeTab === head.id ? 'shadow-lg border-2 border-white scale-105' : 'opacity-60 border border-transparent'">

      <!-- Improved Resolver: Checks if partner info exists before rendering img -->
      <template v-if="getPartner(head.id)">
        <img
          :src="getPartner(head.id).img"
          class="w-full h-full rounded-[1.1rem] object-cover transition-all"
          :class="{ 'grayscale opacity-60': isExpired(head.id) }"
        />

        <!-- Online Status Indicator (Only if not expired) -->
        <div v-if="isPartnerOnline(head.id) && !isExpired(head.id)"
             class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm z-30">
        </div>
      </template>

      <div v-else class="w-full h-full bg-secondary/10 animate-pulse rounded-[1.1rem] flex items-center justify-center">
        <ion-icon :icon="chatbubblesOutline" class="text-secondary opacity-20" />
      </div>

      <!-- Unread Badge -->
      <div v-if="getUnreadCount(head.id) > 0 && activeTab !== head.id"
           class="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white z-10">
        {{ getUnreadCount(head.id) }}
      </div>

      <!-- Close Button -->
      <div v-if="activeTab === head.id" @click.stop="chatWidget.removeChatHead(head.id)"
           class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center z-20 border border-white/40">
        <ion-icon :icon="svg(mdiClose)" class="text-white text-[10px]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { IonIcon } from '@ionic/vue'
import { chatbubblesOutline } from 'ionicons/icons'
import { mdiEarth, mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useFriendStore } from '@/store/friend.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

const chatWidget = useChatWidgetStore()
const friendStore = useFriendStore()
const chatStore = useChatStore()
const authStore = useAuthStore()

const { activeTab, activeChatHeads } = storeToRefs(chatWidget)
const { activeChats } = storeToRefs(chatStore)
const { user } = storeToRefs(authStore)
const { roomMembers } = storeToRefs(useDrawSyncer())

const isInLobby = computed(() => !!roomMembers.value?.length)

// Helper to check if a conversation is expired
const isExpired = (chatId: string) => {
  const chat = activeChats.value.find(c => c._id === chatId)
  return chat?.status === 'expired'
}

// Combined unread logic for both active and pending lists
const unreadConversationsCount = computed(() => {
  const me = user.value?._id || ''
  const activeCount = activeChats.value.filter(c => (c.unread_counts?.[me] || 0) > 0).length
  const pendingCount = friendStore.pendingRequests.filter(c => (c.unread_counts?.[me] || 0) > 0).length
  return activeCount + pendingCount
})

const getPartner = (id: string) => friendStore.resolvePartnerInfo(id)

// Checks online status based on resolved partner ID
const isPartnerOnline = (chatId: string) => {
  const partner = getPartner(chatId)
  return partner ? friendStore.isFriendOnline(partner._id) : false
}

const getUnreadCount = (chatId: string) => {
  const me = user.value?._id || ''
  // Check active chats
  const chat = activeChats.value.find(c => c._id === chatId)
  if (chat) return chat.unread_counts?.[me] || 0

  // Check pending requests
  const pending = friendStore.pendingRequests.find(c => c._id === chatId)
  return pending?.unread_counts?.[me] || 0
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
</style>