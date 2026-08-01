<template>
  <ion-modal
    :is-open="sharePostMenuOpen"
    @did-dismiss="handleDismiss"
    @ionWillPresent="onWillPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-title-modal"
  >
    <div
      @touchmove.stop
      class="max-h-[60vh] flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden relative"
    >
      <div class="flex items-center justify-between mb-4 pt-2 shrink-0">
        <span class="text-2xl font-black text-secondary tracking-tighter italic leading-none">
          {{ headerTitle }}
        </span>
      </div>

      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="handleDismiss" fill="clear" color="dark" class="m-0">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
      </div>

      <div v-if="activeShareItem"
           class="flex items-center justify-between mb-4 bg-white/40 border border-white p-2 pr-3 rounded-2xl shrink-0 shadow-sm">
        <div class="flex items-center overflow-hidden flex-1">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-black/5 shrink-0">
            <img :src="previewThumbnail" class="w-full h-full object-cover" />
          </div>
          <div class="ml-3 flex flex-col min-w-0 pr-2">
            <p class="text-sm text-black/80 italic truncate">
              {{ previewLabel }}
            </p>
            <p class="text-xs font-black text-black/80 uppercase tracking-widest mt-0.5">
              Share Externally
            </p>
          </div>
        </div>

        <ion-button
          fill="clear"
          color="secondary"
          class="m-0 shrink-0"
          @click="handleSystemShare"
        >
          <ion-icon :icon="svg(mdiShareVariant)" slot="icon-only" class="text-xl" />
        </ion-button>
      </div>

      <div
        ref="scrollContainer"
        @touchmove.stop
        class="flex-1 overflow-y-auto overscroll-contain px-1 space-y-3 hide-scrollbar pb-4 scroll-mask"
      >
        <div v-if="loading && friends.length === 0" class="flex justify-center py-12">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <div
          v-else-if="friends.length === 0"
          class="text-center py-12 bg-white/20 rounded-[2.5rem] border-2 border-dashed border-black/5"
        >
          <p class="text-sm text-black/80 italic">No mates yet. Start sketching!</p>
        </div>

        <div v-else class="space-y-3 mt-2">
          <p class="text-xs font-black text-black/80 uppercase px-2 tracking-widest mb-1">
            Send to Mates
          </p>

          <ShareMateRow
            v-for="friend in sortedFriends"
            :key="friend._id"
            :friend="friend"
            :disabled="isFriendDisabled(friend)"
            :busy="isSending"
            :selected="selectedFriendIds.includes(friend._id)"
            :online="isFriendOnline(friend._id)"
            @toggle="toggleFriend(friend._id)"
          />
        </div>
      </div>

      <ion-fab
        v-if="selectedFriendIds.length > 0"
        vertical="bottom"
        horizontal="end"
        class="mb-4 mr-2 fixed"
      >
        <ion-fab-button
          color="secondary"
          :disabled="isSending"
          @click="sendToAllSelected"
        >
          <ion-spinner v-if="isSending" name="dots" />
          <div v-else class="flex flex-col items-center justify-center leading-none mt-0.5">
            <ion-icon :icon="svg(mdiSendOutline)" class="text-xl transform -rotate-12" />
            <span class="text-xs font-black tracking-tighter">{{ selectedFriendIds.length }}</span>
          </div>
        </ion-fab-button>
      </ion-fab>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  IonModal,
  IonSpinner,
  IonIcon,
  IonButton,
  IonFab,
  IonFabButton
} from '@ionic/vue'
import { mdiSendOutline, mdiShareVariant, mdiClose } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { svg, compareVersions } from '@/helper/general.helper'
import { shareImg } from '@/helper/share.helper'
import { useAuthStore } from '@/store/auth.store'
import { useFriendStore } from '@/store/friend.store'
import { useMenuStore } from '@/store/menu.store'
import { useToast } from '@/service/toast.service'
import { Menu } from "@/types/menu.types";
import { useShareService } from '@/draw/sharing/shareService.store'
import { useChatStore } from '@/store/chat.store'
import { recentActivityForPartner } from '@/helper/chat.helper'
import ShareMateRow from '@/components/general/ShareMateRow.vue'

const authStore = useAuthStore()
const friendStore = useFriendStore()
const menuStore = useMenuStore()
const shareService = useShareService()
const chatStore = useChatStore()
const { toast } = useToast()

const { allConnectedPartners, isFriendOnline } = storeToRefs(friendStore)
const { activeChats } = storeToRefs(chatStore)
const { sharePostMenuOpen } = storeToRefs(menuStore)
const { activeShareItem } = storeToRefs(shareService)

const minChatVersion = '0.4.0'
const loading = ref(false)
const isSending = ref(false)
const selectedFriendIds = ref<string[]>([])
const scrollContainer = ref<HTMLElement | null>(null)
let matesFetchedThisSession = false

// --- Preview adapters (post vs inbox) ---
const headerTitle = computed(() =>
  activeShareItem.value?.type === 'inbox' ? 'Share Drawing' : 'Share Sketch'
)

const previewThumbnail = computed(() => {
  const item = activeShareItem.value
  if (!item) return ''
  return activeShareItem.value?.type === 'inbox'
    ? (item.data as any).thumbnail
    : (item.data as any).thumbnail_url
})

const previewLabel = computed(() => {
  const item = activeShareItem.value
  if (!item) return ''
  if (item.type === 'post') {
    return `Sharing ${item.data.author.name}'s post...`
  }
  // inbox item
  const senderName = (item.data as any).sender_name ?? 'this'
  return `Forwarding ${senderName}'s drawing...`
})

// --- Mate list ---
const onWillPresent = async () => {
  selectedFriendIds.value = []

  if (!matesFetchedThisSession && authStore.user?._id) {
    matesFetchedThisSession = true
    if (allConnectedPartners.value.length === 0) loading.value = true
    try {
      await friendStore.getNetworkList('mates', authStore.user._id, 1)
    } catch (e) {
      console.error('Failed to load mates', e)
    } finally {
      loading.value = false
    }
  }
}

const friends = computed(() => allConnectedPartners.value)

const isFriendDisabled = (friend: any) =>
  !friend.last_seen_version ||
  compareVersions(friend.last_seen_version, minChatVersion) === -1

const sortedFriends = computed(() => {
  return [...friends.value].sort((a, b) => {
    const aDisabled = isFriendDisabled(a)
    const bDisabled = isFriendDisabled(b)
    if (aDisabled !== bDisabled) return aDisabled ? 1 : -1
    const recentDelta =
      recentActivityForPartner(activeChats.value, b._id, b.last_interaction_at) -
      recentActivityForPartner(activeChats.value, a._id, a.last_interaction_at)
    if (recentDelta !== 0) return recentDelta
    const aOnline = isFriendOnline.value(a._id)
    const bOnline = isFriendOnline.value(b._id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

const toggleFriend = (friendId: string) => {
  const index = selectedFriendIds.value.indexOf(friendId)
  if (index > -1) selectedFriendIds.value.splice(index, 1)
  else selectedFriendIds.value.push(friendId)
}

// --- Send ---
const sendToAllSelected = async () => {
  if (
    !activeShareItem.value ||
    selectedFriendIds.value.length === 0 ||
    isSending.value
  )
    return
  isSending.value = true

  try {
    const { successCount } = await shareService.shareItemToMates(
      activeShareItem.value,
      selectedFriendIds.value
    )

    // Success (full or partial) surfaces via the ShareToasts card the service
    // pushes — tapping it opens the chat. Only a total failure needs the bar.
    if (successCount > 0) {
      handleDismiss()
    } else {
      toast('Failed to share with selected mates', { color: 'danger' })
    }
  } finally {
    isSending.value = false
  }
}

// --- Secondary actions ---
const handleSystemShare = () => {
  const item = activeShareItem.value
  if (!item) return
  const imgUrl = (item.data as any).image_url || (item.data as any).image
  if (imgUrl) shareImg(imgUrl)
}

const handleDismiss = () => {
  selectedFriendIds.value = []
  menuStore.closeMenu(Menu.SharePostMenu)
  setTimeout(() => shareService.setActiveShareItem(null), 300)
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

.overscroll-contain {
  overscroll-behavior: contain;
}

.scroll-mask {
  mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
}

.animate-slide-up {
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

ion-modal.liquid-title-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --background: var(--ion-color-tertiary);
  --height: 'auto'
}

ion-modal.liquid-title-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>
