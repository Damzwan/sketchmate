<template>
  <div class="relative w-full h-full overflow-hidden" :style="{ backgroundColor }">

    <div
      class="absolute inset-0 z-0 flex transition-opacity duration-300"
      :class="{ 'pointer-events-none opacity-50': disconnectedRoomId || isLoadingCanvas }"
    >
      <canvas
        ref="myCanvasRef"
        class="w-full h-full touch-none"
        id="mainCanvas"
      />

      <MultiplayerAvatars v-if="roomId" />
    </div>

    <Toolbars :draw-mode="currentMode" />

    <DrawStatusIndicator />

    <DrawMenus />

    <DrawExitGuard
      v-if="draftId || isLobby"
      :draft-id="draftId"
      :is-lobby="isLobby"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

// Stores
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useSessionStore } from '@/store/session.store'

// Components
import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import MultiplayerAvatars from '@/components/draw/MultiplayerAvatars.vue'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import DrawStatusIndicator from '@/components/draw/DrawStatusIndicator.vue'
import DrawExitGuard from '@/components/draw/DrawExitGuard.vue'

// Services & Sockets
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'

const route = useRoute()
const router = useRouter()

// Element Reference
const myCanvasRef = ref<HTMLCanvasElement>()

// Store State
const drawStore = useDrawStore()
const { initCanvas } = drawStore
const { backgroundColor } = storeToRefs(drawStore)

const drawSyncer = useDrawSyncer()
const { disconnectedRoomId, isLoadingCanvas, roomId } = storeToRefs(drawSyncer)

// Computed Properties
const currentMode = computed(() => (route.query.mode as string) || 'solo')
const isLobby = computed(() => {
  const { queryParams } = useSessionStore()
  return !!route.query.room_id || !!queryParams?.get('room_id')
})

// Draft ID Management
const draftId = ref(route.query.id as string)

onMounted(() => {
  if (!isLobby.value && !draftId.value) {
    draftId.value = uuidv4()
    router.replace({
      query: { ...route.query, id: draftId.value }
    })
  }

  // 2. Canvas Bootstrapping
  const canvasUrl = route.query.canvas_url as string

  requestAnimationFrame(() => {
    if (!myCanvasRef.value) return

    initCanvas(myCanvasRef.value, {
      isLobby: isLobby.value,
      draftId: draftId.value,
      canvasUrl: canvasUrl
    }).then(async () => {
      // 3. Socket / Multiplayer Handshake
      await socketLoggedInPromise

      const { queryParams } = useSessionStore()
      const roomIdFromStore = queryParams?.get('room_id')
      const roomIdFromUrl = route.query.room_id as string

      const targetRoomId = roomIdFromStore || roomIdFromUrl

      if (targetRoomId) {
        socketJoinRoom({ roomId: targetRoomId, intent: 'join' })
      }
    })
  })
})

onUnmounted(() => {
})
</script>

<style scoped>
#mainCanvas {
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
</style>