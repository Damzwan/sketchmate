<template>
  <ion-page>
    <TopBar title="Home" />

    <ion-content class="bg-background">
      <div class="px-4 pt-2 space-y-6">

        <section>
          <p class="text-base font-black text-black mb-3 px-1">Quick Actions</p>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="action in quickActions"
              :key="action.id"
              class="flex items-center p-3 bg-primary/40 rounded-2xl border border-primary/60 active:scale-95 transition-all"
              @click="handleQuickAction(action.id)"
            >
              <div
                class="flex-shrink-0 w-9 h-9 bg-primary rounded-xl flex items-center justify-center mr-3 shadow-sm border border-primary/20">
                <span class="text-lg">{{ action.iconFallback }}</span>
              </div>
              <span class="text-sm font-bold text-black truncate">{{ action.label }}</span>
            </button>
          </div>
        </section>

        <section>
          <h2 class="text-base font-black text-black mb-3 px-1">Active Lobbies</h2>

          <div class="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
            <div
              v-for="lobby in activeLobbies"
              :key="lobby.id"
              class="min-w-[170px] max-w-[170px] bg-primary/40 rounded-3xl overflow-hidden snap-start flex-shrink-0 border border-primary/60"
            >
              <div class="h-28 bg-background/50 w-full relative border-b border-primary/40">
                <div
                  class="absolute top-2 right-2 px-2 py-1 bg-secondary rounded-full text-[10px] text-white flex items-center font-black">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse"></span>
                  {{ lobby.playerCount }}
                </div>
              </div>
              <div class="p-3">
                <h3 class="text-xs font-bold text-black truncate">{{ lobby.title }}</h3>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-base font-black text-black mb-4 px-1">Community Highlights</h2>
          <div class="space-y-6">
            <div
              v-for="post in communityHighlights"
              :key="post.id"
              class="bg-primary/40 rounded-[2.5rem] overflow-hidden border border-primary/60"
            >
              <div class="flex items-center p-4">
                <div
                  class="w-8 h-8 bg-background rounded-full mr-3 flex items-center justify-center text-xs font-black text-secondary border border-primary/40">
                  {{ post.author.charAt(0) }}
                </div>
                <div class="flex-1">
                  <p class="text-sm font-black text-black">{{ post.author }}</p>
                  <p class="text-[10px] text-black/40 font-bold uppercase tracking-tighter">{{ post.timeAgo }}</p>
                </div>
              </div>

              <div class="aspect-square bg-background w-full border-y border-primary/40">
              </div>

              <div class="flex items-center justify-around p-4">
                <button class="flex items-center space-x-2 active:scale-125 transition-transform group">
                  <span class="text-xl">❤️</span>
                  <span class="text-xs font-black text-black">{{ post.likes }}</span>
                </button>
                <button class="flex items-center space-x-2 active:scale-125 transition-transform group">
                  <span class="text-xl">💬</span>
                  <span class="text-xs font-black text-black">{{ post.comments }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonPage, IonContent, useIonRouter } from '@ionic/vue'
import TopBar from '../components/general/TopBar.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { slideTransition } from '@/helper/animation.helper'

const r = useIonRouter()

const quickActions = ref([
  { id: 'draw_alone', label: 'Draw Alone', iconFallback: '✏️' },
  { id: 'draw_friend', label: 'With Friend', iconFallback: '👋' },
  { id: 'balloon', label: 'Send Balloon', iconFallback: '🎈' },
  { id: 'public_post', label: 'Public Post', iconFallback: '🌍' }
])

const activeLobbies = ref([
  { id: '1', title: 'Late Night Doodles', playerCount: 12 },
  { id: '2', title: 'Anime Sketching', playerCount: 8 },
  { id: '3', title: 'Abstract Chaos', playerCount: 34 },
  { id: '4', title: 'Chill Vibes Only', playerCount: 5 }
])

const communityHighlights = ref([
  { id: '101', author: 'SketchMaster99', timeAgo: '2h ago', likes: 142, comments: 12 },
  { id: '102', author: 'DoodleKid', timeAgo: '4h ago', likes: 89, comments: 4 }
])

const handleQuickAction = (actionId: string) => {
  if (actionId === 'draw_alone') {
    r.push(FRONTEND_ROUTES.draw, slideTransition)
  }
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