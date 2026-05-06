<template>
  <ion-page>
    <TopBar title="Chats" />

    <ion-content class="bg-background">
      <div class="px-4 pt-4 pb-24 space-y-8 max-w-2xl mx-auto">

        <!-- Modularized Online List -->
        <OnlineFriends
          :friends="onlineMates"
          @start="startChat"
        />

        <!-- Pending Requests -->
        <transition-group name="fade-slow" tag="div" class="space-y-3">
          <button
            v-if="receivedRequests.length > 0"
            key="received"
            @click="openRequests('received')"
            class="w-full flex items-center justify-between p-4 bg-tertiary/40 backdrop-blur-md border border-tertiary/60 rounded-[2rem] shadow-lg active:scale-[0.98] transition-transform"
          >
            <div class="flex items-center space-x-3">
              <div
                class="w-10 h-10 rounded-xl bg-tertiary shadow-inner flex items-center justify-center border border-tertiary/40">
                <span class="text-xl">💌</span>
              </div>
              <div class="text-left">
                <p class="text-sm font-black text-black leading-tight">Message Requests</p>
                <p class="text-xs font-bold text-black/60">{{ receivedRequests.length }} waiting for you</p>
              </div>
            </div>
          </button>

          <button
            v-if="sentRequests.length > 0"
            key="sent"
            @click="openRequests('sent')"
            class="w-full flex items-center justify-between p-3 bg-white/20 backdrop-blur-md border border-white/40 rounded-[2rem] shadow-sm active:scale-[0.98] transition-transform opacity-80"
          >
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl bg-black/10 flex items-center justify-center">
                <span class="text-sm">✈️</span>
              </div>
              <div class="text-left">
                <p class="text-xs font-black text-black leading-tight">Sent Invites</p>
                <p class="text-[10px] font-bold text-black/60">{{ sentRequests.length }} pending response</p>
              </div>
            </div>
          </button>
        </transition-group>

        <!-- Active Conversations -->
        <section>
          <p class="text-base font-black text-black tracking-tight italic mb-3 px-1">Conversations</p>

          <div v-if="activeChats.length === 0"
               class="flex flex-col items-center text-center py-12 bg-primary/20 rounded-[2.5rem] border border-primary/30 border-dashed">
            <span class="text-5xl mb-4">👻</span>
            <p class="text-sm font-bold text-black/60">It's pretty quiet here.</p>

            <ion-button
              fill="clear"
              class="mt-4 font-black italic cabin-sketch-regular"
              @click="openNewChatMenu"
            >
              Start a Chat
            </ion-button>
          </div>

          <div v-else class="space-y-3">
            <ConversationItem
              v-for="chat in activeChats"
              :key="chat._id"
              :chat="chat"
              :currentUserId="user?._id || ''"
              :isOnline="isFriendOnline(getChatPartnerId(chat))"
              :isTyping="typingStatuses[getChatPartnerId(chat)] || false"
              @open="openChat"
            />
          </div>
        </section>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="mb-6 mr-4">
        <ion-fab-button color="secondary" @click="openNewChatMenu">
          <ion-icon :icon="svg(mdiChatPlusOutline)" class="text-2xl drop-shadow-sm" />
        </ion-fab-button>
      </ion-fab>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonPage, IonContent, IonFab, IonFabButton, IonButton, useIonRouter } from '@ionic/vue'
import { storeToRefs } from 'pinia'

import TopBar from '@/components/general/TopBar.vue'
import ConversationItem from '@/components/chat/ConversationItem.vue'
import OnlineFriends from '@/components/chat/OnlineFriends.vue' // New Modular Component

import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import { useFriendStore } from '@/store/friend.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation } from '@/helper/animation.helper'
import { svg } from '@/helper/general.helper'
import { mdiChatOutline, mdiChatPlusOutline } from '@mdi/js'

const r = useIonRouter()

const authStore = useAuthStore()
const chatStore = useChatStore()
const friendStore = useFriendStore()

const { user } = storeToRefs(authStore)
const { activeChats, typingStatuses } = storeToRefs(chatStore)
const { friends, pendingRequests, isFriendOnline } = storeToRefs(friendStore)

const onlineMates = computed(() => friends.value.filter(f => isFriendOnline.value(f._id)))
const receivedRequests = computed(() => !user.value ? [] : pendingRequests.value.filter(req => req.initiator_id !== user.value?._id))
const sentRequests = computed(() => !user.value ? [] : pendingRequests.value.filter(req => req.initiator_id === user.value?._id))

const getChatPartnerId = (chat: any): string => {
  const partner = chat.participants?.find((p: any) => p._id !== user.value?._id)
  return partner?._id || ''
}

const openChat = (id: string) => r.push(`${FRONTEND_ROUTES.chat}/${id}`, masterAnimation)
const openNewChatMenu = () => r.push(`${FRONTEND_ROUTES.chat}/new`, masterAnimation)
const startChat = (id: string) => r.push(`${FRONTEND_ROUTES.chat}/${id}`, masterAnimation)
const openRequests = (tab: string) => r.push(`${FRONTEND_ROUTES.chat}/requests?tab=${tab}`, masterAnimation)
</script>

<style scoped>
@reference "@/theme/main.css";

.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}


ion-button {
  --color: black;
  --background: rgba(255, 255, 255, 0.6);
  --border-radius: 1rem;
}
</style>