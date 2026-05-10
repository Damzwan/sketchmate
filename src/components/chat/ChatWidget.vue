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

const router = useIonRouter()

// --- Computed ---
const currentMessages = computed(() => {
  return activeTab.value === 'lobby'
    ? lobbyChatMessages.value
    : (messagesByChat.value[activeTab.value] || [])
})

watch(activeTab, async (newTab) => {
  if (messageContainer.value) messageContainer.value.scrollTop = 0
  if (newTab !== 'overview' && newTab !== 'lobby') {
    await useChatStore().loadMessages(newTab, true)
  }
  await nextTick()
  scrollToBottom(true)
})

watch(currentMessages, async () => {
  if (isVisible && isExpanded) {
    scrollToBottom(false)
  }
}, { deep: true })


// --- Methods ---
const openLobbyInvitePopover = (ev: Event) => {
  inviteEvent.value = ev
  invitePopoverOpen.value = true
}


const scrollToBottom = (instant = false) => {
  const el = messageContainer.value
  if (!el) return
  if (instant) {
    el.scrollTop = el.scrollHeight
    return
  }
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
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