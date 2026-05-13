<template>
  <div
    class="flex items-center gap-3 px-4 pt-4 pb-3 overflow-x-auto hide-scrollbar border-b border-primary/40 bg-white/20 rounded-t-[2.5rem] shrink-0"
  >
    <!-- 1. Overview Tab -->
    <div
      @click="activeTab = 'overview'"
      class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all cursor-pointer"
      :class="
        activeTab === 'overview'
          ? 'bg-secondary text-white shadow-lg border-2 border-white/60 scale-105'
          : 'bg-secondary/15 text-secondary border border-secondary/30 grayscale-[40%]'
      "
    >
      <ion-icon :icon="chatbubblesOutline" class="text-xl" />
      <div
        v-if="unreadConversationsCount > 0 && activeTab !== 'overview'"
        class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-black text-white"
      >
        {{ unreadConversationsCount }}
      </div>
    </div>

    <!-- 2. Vertical Divider (Visible only if there's content to the right) -->
    <div
      v-if="isInLobby || activeChatHeads.length > 0"
      class="h-6 w-[2px] bg-secondary/30 shrink-0 mx-1 rounded-full transition-all duration-300"
    ></div>

    <!-- 3. Lobby Tab -->
    <div
      v-if="isInLobby"
      @click="activeTab = 'lobby'"
      class="relative shrink-0 w-12 h-12 rounded-[1.2rem] flex items-center justify-center border transition-all cursor-pointer"
      :class="
        activeTab === 'lobby'
          ? 'bg-cyan-400 shadow-lg border-white text-white scale-105'
          : 'bg-cyan-400/20 border-cyan-400/40 text-cyan-600'
      "
    >
      <ion-icon :icon="svg(mdiEarth)" class="text-2xl" />
      <div
        v-if="unreadLobbyCount > 0 && activeTab !== 'lobby'"
        class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-black text-white"
      >
        {{ unreadLobbyCount }}
      </div>
    </div>

    <!-- 4. Dynamic Chat Heads -->
    <div
      v-for="head in activeChatHeads"
      :key="head.id"
      @click="activeTab = head.id"
      class="relative shrink-0 w-12 h-12 rounded-[1.2rem] transition-all cursor-pointer"
      :class="
        activeTab === head.id
          ? 'shadow-lg border-2 border-white scale-105'
          : 'opacity-60 border border-transparent'
      "
    >
      <template v-if="getPartner(head.id)">
        <img
          :src="getPartner(head.id)?.img"
          class="w-full h-full rounded-[1.1rem] object-cover transition-all"
          :class="{ 'grayscale opacity-60': isExpired(head.id) }"
        />

        <div
          v-if="isPartnerOnline(head.id) && !isExpired(head.id)"
          class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm z-30"
        ></div>
      </template>

      <div
        v-else
        class="w-full h-full bg-secondary/10 animate-pulse rounded-[1.1rem] flex items-center justify-center"
      >
        <ion-icon :icon="chatbubblesOutline" class="text-secondary opacity-20" />
      </div>

      <!-- Unread Badge -->
      <div
        v-if="getUnreadCount(head.id) > 0 && activeTab !== head.id"
        class="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white z-10"
      >
        {{ getUnreadCount(head.id) }}
      </div>

      <!-- Close Button -->
      <div
        v-if="activeTab === head.id"
        @click.stop="chatWidget.removeChatHead(head.id)"
        class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center z-20 border border-white/40"
      >
        <ion-icon :icon="svg(mdiClose)" class="text-white text-[10px]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const { roomMembers, lobbyChatMessages } = storeToRefs(useDrawSyncer())

const isInLobby = computed(() => !!roomMembers.value?.length)

const interestingLobbyMessages = computed(() =>
  lobbyChatMessages.value.filter(msg => msg.type === 'message')
)
const unreadLobbyCount = ref(0)

watch(
  [() => interestingLobbyMessages.value.length, activeTab],
  ([newLen, newTab], [oldLen]) => {
    if (newTab === 'lobby') {
      unreadLobbyCount.value = 0
      return
    }

    if (newTab !== 'lobby' && oldLen !== undefined && newLen > oldLen) {
      unreadLobbyCount.value += (newLen - oldLen)
    }
  }
)

const getChatFromHead = (headId: string) => {
  return [...activeChats.value, ...friendStore.pendingRequests].find(c => {
    if (c._id === headId) return true;
    return c.participants.some(p => p._id === headId);
  });
}

const isExpired = (headId: string) => {
  const chat = getChatFromHead(headId);
  return chat?.status === 'expired'
}

const unreadConversationsCount = computed(() => {
  const me = user.value?._id || ''
  const activeCount = activeChats.value.filter(c => (c.unread_counts?.[me] || 0) > 0).length
  const pendingCount = friendStore.pendingRequests.filter(c => (c.unread_counts?.[me] || 0) > 0).length
  return activeCount + pendingCount
})

const getPartner = (headId: string) => {
  const chat = getChatFromHead(headId);
  if (chat) {
    return chat.participants.find((p: any) => p._id !== user.value?._id);
  }

  // f no chat exists, headId is a User ID (brand new chat)
  return friendStore.resolvePartnerInfo(headId);
}

const isPartnerOnline = (headId: string) => {
  const partner = getPartner(headId)
  return partner ? friendStore.isFriendOnline(partner._id) : false
}

const getUnreadCount = (headId: string) => {
  const me = user.value?._id || ''
  const chat = getChatFromHead(headId);
  return chat?.unread_counts?.[me] || 0
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