<template>
  <ChatToasts />

  <ion-modal
    :is-open="isVisible && isExpanded"
    @did-present="scrollToBottom(true)"
    @did-dismiss="chatWidget.closePanel()"
    :keepContentsMounted="true"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    class="liquid-chat-modal"
  >
    <div class="flex flex-col h-full bg-primary/30 backdrop-blur-3xl relative">

      <ChatTabsHeader />

      <ChatToolbar
        @inspect-profile="(_ ,info) => openUserActions(info)"
        @open-report="openUserActions"
      />

      <div
        @touchmove.stop
        class="flex-1 overflow-y-auto relative hide-scrollbar px-3 py-2"
        ref="messageContainer"
      >

        <ChatOverview
          v-if="activeTab === 'overview'"
          @join-session="joinSession"
        />

        <ChatMessageFlow
          v-else
          :messages="currentMessages"
          @inspect-profile="(_ ,info) => openUserActions(info)"
          @join-session="joinSession"
          @load-more="handleLoadMore"
          :isFetchingHistory="isFetchingHistory"
        />
      </div>

      <ChatInputFooter
        v-if="activeTab !== 'overview'"
        @sent="scrollToBottom"
        @open-invite-popover="openLobbyInvitePopover"
      />

    </div>
  </ion-modal>

  <LobbyInvitePopover
    :is-open="invitePopoverOpen"
    :event="inviteEvent"
    @close="invitePopoverOpen = false"
  />


</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { IonModal, useIonRouter } from '@ionic/vue'
import { storeToRefs } from 'pinia'

// Components
import ChatToasts from './ChatToasts.vue'
import ChatTabsHeader from './ChatTabsHeader.vue'
import ChatToolbar from './ChatToolbar.vue'
import ChatOverview from './ChatOverview.vue'
import ChatMessageFlow from './ChatMessageFlow.vue'
import ChatInputFooter from './ChatInputFooter.vue'
import LobbyInvitePopover from './LobbyInvitePopover.vue'

// Stores
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { masterAnimation } from '@/helper/animation.helper'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useUserActions } from '@/composables/profile/useUserActions'

const chatWidget = useChatWidgetStore()
const { isVisible, isExpanded, activeTab } = storeToRefs(chatWidget)
const { messagesByChat } = storeToRefs(useChatStore())
const { lobbyChatMessages } = storeToRefs(useDrawSyncer())

const { invitations } = storeToRefs(useDrawSyncer())

// --- Local UI State ---
const messageContainer = ref<HTMLElement | null>(null)
const invitePopoverOpen = ref(false)
const inviteEvent = ref<Event | null>(null)
const { openUserActions } = useUserActions()
const chatStore = useChatStore()

const router = useIonRouter()

// --- Computed ---
const currentMessages = computed(() => {
  return activeTab.value === 'lobby'
    ? lobbyChatMessages.value
    : (messagesByChat.value[activeTab.value] || [])
})


// --- Methods ---
const openLobbyInvitePopover = (ev: Event) => {
  inviteEvent.value = ev
  invitePopoverOpen.value = true
}


const scrollToBottom = async (instant = false) => {
  await nextTick()
  const el = messageContainer.value
  if (!el) return

  el.scrollTo({
    top: el.scrollHeight,
    behavior: instant ? 'auto' : 'smooth'
  })
}

function joinSession(roomId: string) {
  invitations.value = invitations.value.filter(inv => inv.roomId !== roomId)

  chatWidget.closePanel()
  router.push(FRONTEND_ROUTES.draw, masterAnimation)

  setTimeout(() => {
    socketJoinRoom({ roomId: roomId, intent: 'join' })
  }, 200)
}

const isFetchingHistory = ref(false)

const handleLoadMore = async () => {
  if (isFetchingHistory.value) return

  const el = messageContainer.value
  if (!el || el.scrollTop > 200) return // Only trigger if near the top

  isFetchingHistory.value = true

  // 1. Snapshot the current scroll position and height
  const oldScrollHeight = el.scrollHeight
  const oldScrollTop = el.scrollTop

  try {
    await chatStore.loadMessages(activeTab.value, false)
    await nextTick()

    // 2. Calculate the new height
    const newScrollHeight = el.scrollHeight

    // 3. Perform the jump instantly
    // We use scrollTo with 'auto' to ensure there is zero "smooth" animation
    el.scrollTo({
      top: oldScrollTop + (newScrollHeight - oldScrollHeight),
      behavior: 'auto'
    })
  } finally {
    // 4. Use a slightly longer timeout to ensure DOM painting is 100% done
    // before allowing the auto-scroller to take over again
    setTimeout(() => {
      isFetchingHistory.value = false
    }, 200)
  }
}

watch(currentMessages, async () => {
  if (isFetchingHistory.value) return

  if (isVisible.value && isExpanded.value) {
    scrollToBottom(false)
  }
}, { deep: true })
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.liquid-chat-modal {
  --height: 85vh;
  --border-radius: 2.5rem 2.5rem 0 0;
}
</style>