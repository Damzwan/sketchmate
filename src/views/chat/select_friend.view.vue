<template>
  <ion-page class="slide-page">
    <SubPageBar title="New Chat" />

    <ion-content class="bg-background">
      <div class="px-4 py-6 space-y-8 max-w-2xl mx-auto">

        <!-- 1. ELIGIBLE MATES (Can Chat) -->
        <div v-if="eligibleMates.length > 0">
          <p class="text-sm font-black text-black/40 uppercase px-2 mb-3 tracking-wide flex items-center">
            Ready to Chat <span class="ml-2 text-[10px] bg-secondary/20 text-secondary px-2 py-0.5 rounded-full">New</span>
          </p>
          <div class="space-y-3">
            <button
              v-for="friend in eligibleMates"
              :key="friend._id"
              @click="handleInitiate(friend)"
              class="w-full flex items-center p-4 bg-primary/30 backdrop-blur-md rounded-[1.5rem] border border-primary/20 shadow-sm active:scale-[0.98] transition-all"
            >
              <img :src="friend.img" class="w-12 h-12 rounded-xl object-cover border border-white/40 shadow-sm" />
              <div class="ml-4 flex flex-col items-start">
                <span class="text-lg font-bold text-black leading-tight">{{ friend.name }}</span>
              </div>
              <div class="ml-auto text-xl opacity-30">✨</div>
            </button>
          </div>
        </div>

        <!-- 2. INELIGIBLE MATES (Needs Update) -->
        <div v-if="ineligibleMates.length > 0">
          <p class="text-sm font-black text-black/20 uppercase px-2 mb-3 tracking-wide">
            Need Update
          </p>
          <div class="space-y-3">
            <div
              v-for="friend in ineligibleMates"
              :key="friend._id"
              class="w-full flex items-center p-4 bg-white/5 backdrop-blur-sm rounded-[1.5rem] border border-black/5 opacity-60 grayscale-[0.8]"
            >
              <img :src="friend.img" class="w-10 h-10 rounded-xl object-cover border border-white/20" />
              <div class="ml-4 flex flex-col items-start">
                <span class="text-base font-bold text-black/60 leading-tight">{{ friend.name }}</span>
                <span class="text-[9px] font-black uppercase text-black/30 mt-1">Version {{ friend.last_seen_version || 'Unknown' }}</span>
              </div>
              <div class="ml-auto text-sm">🔒</div>
            </div>
          </div>
        </div>

        <!-- EMPTY STATE -->
        <div v-if="friends.length === 0" class="text-center py-12 flex flex-col items-center">
          <span class="text-5xl mb-4 opacity-20">🎨</span>
          <p class="text-black/40 font-bold">Your mate list is empty.</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store'
import { IonContent, IonPage, useIonRouter } from '@ionic/vue'
import SubPageBar from '@/components/general/SubPageBar.vue'
import { compareVersions } from '@/helper/general.helper'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { Mate } from '@/types/server.types'

const { friends } = storeToRefs(useFriendStore())
const chatStore = useChatStore()
const r = useIonRouter()

const MIN_CHAT_VERSION = '0.4.3'

const canChat = (version?: string) => {
  if (!version) return false
  return compareVersions(version, MIN_CHAT_VERSION) !== -1
}

// --- Computed Split Lists ---

const eligibleMates = computed(() => {
  return friends.value.filter(f => canChat(f.last_seen_version))
})

const ineligibleMates = computed(() => {
  return friends.value.filter(f => !canChat(f.last_seen_version))
})

// --- Logic ---

const handleInitiate = (friend: Mate) => {
  const friendId = friend._id
  const existingChat = chatStore.activeChats.find(c =>
    c.participants.some((p: any) => p._id === friendId)
  )

  if (existingChat) {
    r.replace(`${existingChat._id}`)
  } else {
    r.replace(`${friendId}`)
  }
}
</script>

<style scoped>
@reference "@/theme/main.css";

/* No specific button:disabled styles needed since we
   converted the ineligible ones to div tags */
</style>