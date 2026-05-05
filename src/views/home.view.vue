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

        <ActiveLobbies
          :lobbies="publicLobbies"
          @join="joinLobby"
          :loading="publicLobbies.length === 0"
        />

        <MyDrafts
          :drafts="localDrafts"
          :loading="isLoadingDrafts"
          @open="openDraft"
          @delete="handleDeleteDraft"
        />

        <CommunityFeed />

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { IonContent, IonPage, onIonViewDidEnter, useIonRouter } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import TopBar from '../components/general/TopBar.vue'
import ActiveLobbies from '../components/home/ActiveLobbies.vue' // <-- Import the organ
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation } from '@/helper/animation.helper'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { startWatchingLobbies } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'
import MyDrafts from '@/components/home/MyDrafts.vue'
import { DrawingDraft, useDrawLoadStore } from '@/draw/store/drawLoad.store'
import CommunityFeed from '@/components/home/CommunityFeed.vue'

const r = useIonRouter()

const drawSyncerStore = useDrawSyncer()
const { publicLobbies } = storeToRefs(drawSyncerStore)

const loadStore = useDrawLoadStore()
const localDrafts = ref<DrawingDraft[]>([])
const isLoadingDrafts = ref(true)

const quickActions = ref([
  { id: 'draw_alone', label: 'Draw', iconFallback: '✏️' },
  { id: 'draw_friend', label: 'Draw together', iconFallback: '👋' }
])

const communityHighlights = ref([
  { id: '101', author: 'SketchMaster99', timeAgo: '2h ago', likes: 142, comments: 12 },
  { id: '102', author: 'DoodleKid', timeAgo: '4h ago', likes: 89, comments: 4 }
])

onIonViewDidEnter(() => {
  fetchDrafts()
  socketLoggedInPromise.then(() => {
    startWatchingLobbies()
  })
})

onMounted(async () => {
  try {
    await import('@/views/draw.view.vue')
  } catch (error) {
  }
})

const handleQuickAction = (actionId: string) => {
  if (actionId === 'draw_alone') {
    r.push(FRONTEND_ROUTES.draw, masterAnimation)
  }
}

const joinLobby = (lobbyId: string) => {
  r.push(`${FRONTEND_ROUTES.draw}?room_id=${lobbyId}`, masterAnimation)
}

const fetchDrafts = async () => {
  isLoadingDrafts.value = true
  try {
    // This calls the IndexedDB getAllDrafts we wrote in the load store
    localDrafts.value = await loadStore.getAllDrafts()
  } finally {
    isLoadingDrafts.value = false
  }
}

const handleDeleteDraft = async (id: string) => {
  try {
    await loadStore.removeDraft(id)
    localDrafts.value = localDrafts.value.filter(d => d.id !== id)
  } catch (error) {
  }
}

const openDraft = (id: string) => {
  // Navigate to draw page with the draft ID as a query param
  r.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation)
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