<template>
  <ion-page class="slide-page">
    <ChatHeader
      :partner="partner"
      :isOnline="isPartnerOnline"
      :isTyping="isPartnerTyping"
    />

    <ion-content class="bg-background" :scroll-events="true">
      <!-- Infinite Scroll at the TOP to load history -->
      <ion-infinite-scroll
        position="top"
        @ionInfinite="loadMoreMessages"
        :disabled="allLoaded || !isExistingChat"
      >
        <ion-infinite-scroll-content
          loading-spinner="bubbles"
          loading-text="Fetching history..."
        />
      </ion-infinite-scroll>

      <!-- Message Container -->
      <div class="absolute inset-0 flex flex-col px-4 pt-2 pb-24 max-w-2xl mx-auto">

        <div class="flex-1 space-y-4 flex flex-col justify-end">
          <!-- Empty State -->
          <div v-if="messages.length === 0" class="text-center pb-10 text-black/40 font-bold italic">
            Say hi to {{ partner?.name || 'your mate' }}! 👋
          </div>

          <!-- Message Bubbles -->
          <div
            v-for="msg in messages"
            :key="msg._id"
            :class="['flex', msg.sender_id === user?._id ? 'justify-end' : 'justify-start']"
          >
            <div :class="[
              'max-w-[80%] px-4 py-3 rounded-[1.5rem] shadow-sm text-sm font-bold leading-snug',
              msg.sender_id === user?._id
                ? 'bg-secondary text-white rounded-tr-sm'
                : 'bg-white/60 backdrop-blur-md text-black border border-white/80 rounded-tl-sm'
            ]">
              {{ msg.content }}
            </div>
          </div>
        </div>
      </div>

      <!-- Input Bar (Pinned via Footer or absolute positioning) -->
      <div class="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-background via-background/80 to-transparent">
        <div class="max-w-2xl mx-auto flex items-center space-x-2 bg-white/50 backdrop-blur-xl p-2 rounded-[2rem] border border-white/80 shadow-lg">
          <input
            v-model="newMessage"
            placeholder="Type a message..."
            class="flex-1 bg-transparent border-none px-4 py-2 focus:outline-none font-bold text-black placeholder:text-black/40"
            @keyup.enter="send"
            @input="handleTyping"
          />
          <button
            @click="send"
            :disabled="!newMessage.trim() || isSending"
            class="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
          >
            <span v-if="!isSending" class="text-xl -mt-0.5 ml-0.5">🚀</span>
            <ion-spinner v-else name="crescent" color="light" class="w-6 h-6" />
          </button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  IonPage,
  IonContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSpinner,
  onIonViewDidEnter,
  useIonRouter
} from '@ionic/vue'

import ChatHeader from '@/components/chat/ChatHeader.vue'
import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import { useFriendStore } from '@/store/friend.store'

const route = useRoute()
const r = useIonRouter()

// Stores
const authStore = useAuthStore()
const chatStore = useChatStore()
const friendStore = useFriendStore()

const { user } = storeToRefs(authStore)
const { messagesByChat, activeChats, typingStatuses } = storeToRefs(chatStore)
const { isFriendOnline, friends } = storeToRefs(friendStore)

// Local State
const newMessage = ref('')
const isSending = ref(false)
const allLoaded = ref(false)
const routeId = computed(() => route.params.id as string)

// --- Logic to handle Conversation vs. Friend ID in Route ---
const isExistingChat = computed(() => activeChats.value.some(c => c._id === routeId.value))

const partner = computed(() => {
  if (isExistingChat.value) {
    const chat = activeChats.value.find(c => c._id === routeId.value)
    return chat?.participants.find((p: any) => p._id !== user.value?._id)
  }
  // Fallback: the route ID is likely a Friend ID (new chat draft)
  return friends.value.find(f => f._id === routeId.value)
})

const isPartnerOnline = computed(() => partner.value ? isFriendOnline.value(partner.value._id) : false)
const isPartnerTyping = computed(() => partner.value ? !!typingStatuses.value[partner.value._id] : false)
const messages = computed(() => messagesByChat.value[routeId.value] || [])

// --- Lifecycle & Data Loading ---

const syncChat = async (isInitial = true) => {
  if (!isExistingChat.value) return

  const count = await chatStore.loadMessages(routeId.value, isInitial)
  if (count < 50) {
    allLoaded.value = true
  }
}

onIonViewDidEnter(() => {
  allLoaded.value = false
  syncChat(true)
})

// If user navigates between chats, re-sync
watch(routeId, () => {
  allLoaded.value = false
  syncChat(true)
})

const loadMoreMessages = async (ev: any) => {
  await syncChat(false)
  ev.target.complete()
}

// --- Typing & Messaging Actions ---

let typingTimeout: any = null
const handleTyping = () => {
  if (!partner.value) return
  chatStore.sendTypingIndicator(partner.value._id, true)

  if (typingTimeout) clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => {
    if (partner.value) chatStore.sendTypingIndicator(partner.value._id, false)
  }, 1500)
}

const send = async () => {
  if (!newMessage.value.trim() || !partner.value || isSending.value) return

  const content = newMessage.value.trim()
  newMessage.value = ''
  isSending.value = true

  try {
    const response = await chatStore.sendMessage(partner.value._id, content)

    // If this was a new chat draft, swap URL to the real conversation ID
    if (!isExistingChat.value && response?.conversation?._id) {
      r.replace(`/chat/${response.conversation._id}`)
    }
  } catch (error) {
    console.error('Send failed:', error)
    newMessage.value = content // Restore text on error
  } finally {
    isSending.value = false
    chatStore.sendTypingIndicator(partner.value._id, false)
  }
}
</script>

<style scoped>
@reference "@/theme/main.css";

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Ensure content doesn't get hidden behind the input bar */
.flex-1 {
  padding-bottom: 20px;
}
</style>