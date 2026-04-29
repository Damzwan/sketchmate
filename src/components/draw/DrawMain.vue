<template>
  <div class="relative w-full h-full overflow-hidden" :style="{ backgroundColor }">

    <div
      class="absolute inset-0 z-0 flex"
      :class="{ 'pointer-events-none opacity-50': disconnectedRoomId || isLoadingCanvas }"
    >
      <GhostLayer
        :is-gesturing="isGesturing"
        :css-transform="cssTransform"
        :ghost-boxes="ghostBoxes"
      />
      <canvas ref="myCanvasRef" class="w-full h-full touch-none" id="mainCanvas" />
      <MultiplayerAvatars v-if="roomId" />
    </div>

    <Toolbars :draw-mode="currentMode" />

    <ResetZoomButton class="absolute bottom-32 right-4 z-20 pointer-events-auto" />

    <ion-progress-bar
      type="indeterminate"
      class="absolute top-0 z-50 h-1.5"
      color="secondary"
      v-if="isSendingDrawing || isLoadingCanvas"
    />

    <DrawMenus />
  </div>
</template>

<script setup lang="ts">
import { IonProgressBar } from '@ionic/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { performRoomExit } from '@/draw/helpers/drawSyncing.helper'

import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import ResetZoomButton from '@/components/draw/ResetZoomButton.vue'
import MultiplayerAvatars from '@/components/draw/MultiplayerAvatars.vue'
import GhostLayer from '@/components/draw/GhostLayer.vue'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import { useSessionStore } from '@/store/session.store'
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'

const route = useRoute()
const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas, resetCanvasID } = useDrawStore()
const { isSendingDrawing, isGesturing, ghostBoxes, cssTransform, backgroundColor } = storeToRefs(useDrawStore())
const { disconnectedRoomId, isLoadingCanvas, roomId } = storeToRefs(useDrawSyncer())

const currentMode = computed(() => (route.query.mode as string) || 'solo')

onMounted(() => {
  requestAnimationFrame(() => {
    initCanvas(myCanvasRef.value!).then(async () => {
      await socketLoggedInPromise
      const roomId2 = route.query.room_id as string

      const { queryParams } = useSessionStore()
      const roomId = queryParams?.get('room_id')
      if (roomId || roomId2) socketJoinRoom({ roomId: roomId ? roomId : roomId2, intent: 'join' }) // TODO fix
    })
  })
})

onUnmounted(() => {
  performRoomExit()
  resetCanvasID()
})
</script>