<template>
  <ion-page>
    <TopBar :title="partnerName" show-back />

    <ion-content class="bg-background">
      <div class="flex flex-col h-full px-4 pt-4 pb-10">
        <!-- Messages Area -->
        <div class="flex-1 space-y-4 overflow-y-auto hide-scrollbar">
          <div v-for="msg in messages" :key="msg._id"
               :class="['flex', msg.sender_id === user._id ? 'justify-end' : 'justify-start']"
          >
            <div :class="[
              'max-w-[80%] px-4 py-3 rounded-[1.8rem] shadow-sm text-sm font-bold',
              msg.sender_id === user._id
                ? 'bg-secondary text-white rounded-tr-none'
                : 'bg-white/60 backdrop-blur-md text-black border border-white/80 rounded-tl-none'
            ]">
              {{ msg.content }}
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div
          class="mt-4 flex items-center space-x-2 bg-white/40 backdrop-blur-xl p-2 rounded-[2rem] border border-white/60">
          <input
            v-model="newMessage"
            placeholder="Type a sketch-message..."
            class="flex-1 bg-transparent border-none px-4 py-2 focus:outline-none font-bold text-black"
            @keyup.enter="send"
          />
          <button @click="send"
                  class="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <span class="text-xl">🚀</span>
          </button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import TopBar from '@/components/general/TopBar.vue'
import { IonPage } from '@ionic/vue'

const route = useRoute()
const { user } = storeToRefs(useAuthStore())
const chatStore = useChatStore()
const { messagesByChat } = storeToRefs(chatStore)

const newMessage = ref('')
const conversationId = computed(() => route.params.id as string)
const messages = computed(() => messagesByChat.value[conversationId.value] || [])

const send = () => {
  if (!newMessage.value.trim()) return
  // chatStore.sendMessage(conversationId.value, newMessage.value)
  newMessage.value = ''
}
</script>