<template>
  <div class="p-3 bg-white/40 border-t border-secondary/20 backdrop-blur-2xl pb-safe shrink-0">
    <div class="flex items-center gap-2">
      <button
        @click="handleInviteClick"
        :disabled="!chatStore.canSendMessage(activeTab)"
        class="w-11 h-11 rounded-2xl border border-secondary/30 bg-secondary/10 flex items-center justify-center active:scale-90 transition-all shadow-sm disabled:opacity-30"
      >
        <ion-icon
          :icon="activeTab === 'lobby' ? svg(mdiAccountMultiplePlusOutline) : svg(mdiAccountPlusOutline)"
          class="text-2xl text-secondary"
        />
      </button>

      <div
        class="flex-1 flex items-center gap-1 bg-white/90 border border-secondary/20 rounded-2xl p-1.5 shadow-inner transition-opacity"
        :class="{ 'opacity-60': !chatStore.canSendMessage(activeTab) }"
      >
        <ion-input
          v-model="inputText"
          @keyup.enter="handleSend"
          :disabled="!chatStore.canSendMessage(activeTab)"
          :placeholder="chatStore.chatInputPlaceholder(activeTab)"
          class="cabin-sketch-regular font-bold px-2"
          color="secondary"
        />

        <button
          v-if="chatStore.canSendMessage(activeTab)"
          @click="handleSend"
          class="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all shadow-md"
        >
          <ion-icon :icon="svg(mdiSend)" class="text-white text-lg ml-0.5" />
        </button>

        <div v-else class="w-10 h-10 flex items-center center opacity-30">
          <ion-icon :icon="svg(mdiClockOutline)" class="text-secondary text-lg" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { actionSheetController, alertController, IonIcon, IonInput, useIonRouter } from '@ionic/vue'
import {
  mdiAccountMultiplePlusOutline,
  mdiAccountPlusOutline,
  mdiClockOutline,
  mdiDraw,
  mdiLoginVariant,
  mdiSend
} from '@mdi/js'
import { generateRandomCode, svg } from '@/helper/general.helper'

import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useFriendStore } from '@/store/friend.store'
import {
  inviteFriendToRoom,
  leaveRoom,
  sendLobbyMessage,
  socketJoinRoom
} from '@/service/api/socket/drawSyncing.socket'

const emit = defineEmits(['sent', 'open-invite-popover'])

const chatWidget = useChatWidgetStore()
const chatStore = useChatStore()
const friendStore = useFriendStore()
const drawSyncer = useDrawSyncer()
const router = useIonRouter()

const { activeTab } = storeToRefs(chatWidget)
const { roomId } = storeToRefs(drawSyncer)

const inputText = ref('')

const handleInviteClick = (ev: Event) => {
  if (activeTab.value === 'lobby') {
    emit('open-invite-popover', ev)
  } else {
    openPrivateInviteSheet()
  }
}

const openPrivateInviteSheet = async () => {
  const partner = friendStore.resolvePartnerInfo(activeTab.value)
  if (!partner) return

  const buttons = [
    {
      text: 'Start drawing together',
      icon: svg(mdiDraw),
      handler: () => {
        // If already in a lobby, warn before starting a new private session
        if (roomId.value) {
          confirmNewSession(partner._id, partner.name)
        } else {
          startDrawingTogether(partner._id)
        }
      }
    }
  ]

  if (roomId.value) {
    buttons.unshift({
      text: 'Invite to current Lobby',
      icon: svg(mdiLoginVariant),
      handler: async () => {
        inviteFriendToRoom(partner._id, roomId.value!)
      }
    })
  }

  const actionSheet = await actionSheetController.create({
    header: `Session with ${partner.name}`,
    cssClass: 'liquid-action-sheet',
    buttons
  })
  await actionSheet.present()
}

/**
 * Shows an alert warning the user that they will leave their current lobby
 */
const confirmNewSession = async (friendId: string, name: string) => {
  const alert = await alertController.create({
    header: 'Start New Session?',
    subHeader: 'This will leave your current lobby.',
    message: `You are about to start a private drawing session with ${name}.`,
    cssClass: 'liquid-unfriend-alert',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel',
        cssClass: 'alert-button-confirm'
      },
      {
        text: 'Confirm',
        cssClass: 'alert-button-confirm',
        handler: () => {
          leaveRoom()
          setTimeout(() => startDrawingTogether(friendId), 100)
        }
      }
    ]
  })

  await alert.present()
}

const startDrawingTogether = async (friendId: string) => {
  const newRoomId = generateRandomCode()
  chatWidget.closePanel()
  router.push('/draw')

  setTimeout(() => {
    socketJoinRoom({ roomId: newRoomId, intent: 'create' })
    inviteFriendToRoom(friendId, newRoomId)
  }, 400)
}

const handleSend = async () => {
  const text = inputText.value.trim()
  if (!text) return

  if (activeTab.value === 'lobby') {
    sendLobbyMessage(text)
    emit('sent')
  } else {
    const partner = friendStore.resolvePartnerInfo(activeTab.value)
    if (partner?._id) {
      await chatStore.sendMessage(partner._id, text)
      emit('sent')
    }
  }
  inputText.value = ''
}
</script>

<style scoped>
/* Added scoped styles if needed, though most classes are global/utility */
</style>