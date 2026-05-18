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
          :drafts="mergedDrafts"
          :loading="isLoadingDrafts"
          :pending-ids="pendingDraftIds"
          @open="openDraft"
          @delete="handleDeleteDraft"
        />

        <CommunityFeed />

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { IonContent, IonPage, onIonViewDidEnter, useIonRouter } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import TopBar from '../components/general/TopBar.vue'
import ActiveLobbies from '../components/home/ActiveLobbies.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation } from '@/helper/animation.helper'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { startWatchingLobbies } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'
import MyDrafts from '@/components/home/MyDrafts.vue'
import { DrawingDraft, useDrawLoadStore } from '@/draw/store/drawLoad.store'
import CommunityFeed from '@/components/home/CommunityFeed.vue'
import { useMenuStore } from '@/store/menu.store'
import { Menu } from '@/draw/types/draw.types'
import { EventBus } from '@/main'

const r = useIonRouter()

const drawSyncerStore = useDrawSyncer()
const { publicLobbies } = storeToRefs(drawSyncerStore)
const { openMenu } = useMenuStore()

const loadStore = useDrawLoadStore()
const { pendingDraftsList } = storeToRefs(loadStore)

const localDrafts = ref<DrawingDraft[]>([])
const isLoadingDrafts = ref(true)

const quickActions = ref([
  { id: 'draw_alone', label: 'Draw', iconFallback: '✏️' },
  { id: 'draw_together', label: 'Draw together', iconFallback: '👋' },
  { id: 'share', label: 'Add a Mate', iconFallback: '🤝' }
])

/**
 * Merged drafts view. Pending background saves are shown first (newest), then
 * the actual IDB drafts. If a draft id appears in both (which happens during
 * the brief window between IDB write completing and re-fetching), the pending
 * one takes precedence so we don't flicker.
 */
const pendingDraftIds = computed(() => new Set(pendingDraftsList.value.map(p => p.id)))

const mergedDrafts = computed<DrawingDraft[]>(() => {
  const pendingIds = pendingDraftIds.value
  const real = localDrafts.value.filter(d => !pendingIds.has(d.id))
  return [...pendingDraftsList.value, ...real].sort((a, b) => b.updatedAt - a.updatedAt)
})

onMounted(async () => {
  try {
    await import('@/views/draw.view.vue')
  } catch (error) {
  }
})

onIonViewDidEnter(() => {
  fetchDrafts()
  socketLoggedInPromise.then(() => {
    startWatchingLobbies()
  })
})

watch(
  () => pendingDraftsList.value.length,
  (newLength, oldLength) => {
    if (newLength < oldLength) {
      fetchDraftsBackground()
    }
  }
)

const fetchDraftsBackground = async () => {
  try {
    localDrafts.value = await loadStore.getAllDrafts()
  } catch (error) {
    console.error('[home] background fetch failed:', error)
  }
}


const handleQuickAction = (actionId: string) => {
  if (actionId === 'draw_alone') {
    r.push(FRONTEND_ROUTES.draw, masterAnimation)
  } else if (actionId === 'draw_together') {
    r.push({
      path: FRONTEND_ROUTES.draw,
      query: { together: 'true' }
    }, masterAnimation)
  } else if (actionId === 'share') {
    openMenu(Menu.ConnectionMenu)
  }
}

const joinLobby = (lobbyId: string) => {
  r.push(`${FRONTEND_ROUTES.draw}?room_id=${lobbyId}`, masterAnimation)
}

const fetchDrafts = async () => {
  isLoadingDrafts.value = true
  try {
    localDrafts.value = await loadStore.getAllDrafts()
  } finally {
    isLoadingDrafts.value = false
  }
}

const handleDeleteDraft = async (id: string) => {
  // If this is a pending save, the store handles cancellation. Otherwise it
  // deletes from IDB. Either way, removeDraft is the right call.
  try {
    await loadStore.removeDraft(id)
    localDrafts.value = localDrafts.value.filter(d => d.id !== id)
  } catch (error) {
    console.error('[home] delete failed:', error)
  }
}

const openDraft = (id: string) => {
  // Block opening a draft that's still being saved — the JSON isn't in IDB
  // yet, so navigation would land on an empty canvas. We could instead await
  // the pending promise, but that's surprising UX. Better to make it visible
  // (e.g., spinner overlay) and let the user wait.
  if (pendingDraftIds.value.has(id)) return
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