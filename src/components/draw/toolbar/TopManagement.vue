<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg space-x-1">

    <ToolButton
      :icon="svg(mdiFullscreen)"
      @click="$emit('toggle-fullscreen')"
      custom-class="hover:bg-primary/20"
    />

    <ToolButton
      :icon="svg(mdiMapOutline)"
      :active="isMiniMapOpen"
      @click="toggleMinimap"
      custom-class="hover:bg-primary/20"
    />

    <ToolButton
      :icon="svg(mdiChatQuestionOutline)"
      @click="openMenu(Menu.HelpMenu, $event)"
      custom-class="hover:bg-primary/20"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <ToolButton
      :icon="svg(mdiAccountGroupOutline)"
      :custom-class="roomMembers.length > 0
        ? 'border-secondary/60 bg-secondary/5'
        : 'hover:bg-primary/20 border-transparent'"
      :icon-class="roomMembers.length > 0 ? 'text-secondary' : 'text-black'"
      :badge="roomMembers.length"
      @click="openMenu(Menu.DrawRoomMenu, $event)"
    />

    <ToolButton
      :disabled="!isLoggedIn"
      :icon="svg(mdiSend)"
      custom-class="bg-secondary shadow-md border-secondary ml-1"
      icon-class="text-white"
      @click="startSendFlow"
    />

  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useMenuStore } from '@/store/menu.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import ToolButton from './ToolButton.vue'
import { mdiAccountGroupOutline, mdiChatQuestionOutline, mdiFullscreen, mdiMapOutline, mdiSend } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { Menu } from '@/draw/types/draw.types'
import SendHub from '../send/SendHub.vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { useAuthStore } from '@/store/auth.store'

defineEmits(['toggle-fullscreen'])

const { roomMembers } = storeToRefs(useDrawSyncer())
const { openMenu } = useMenuStore()
const drawUIStore = useDrawUIStore()
const { isMiniMapOpen } = storeToRefs(drawUIStore)
const {isLoggedIn} = storeToRefs(useAuthStore())

const toggleMinimap = () => {
  drawUIStore.isMiniMapOpen = !drawUIStore.isMiniMapOpen
}

const startSendFlow = async (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.push(SendHub)
}
</script>