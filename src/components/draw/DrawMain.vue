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

    <transition name="pop-down">
      <div
        v-if="isSendingDrawing || isLoadingCanvas"
        class="absolute top-18 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center px-4 py-2.5 bg-white/80 backdrop-blur-md border-2 border-primary/40 rounded-full shadow-lg"
      >
        <svg class="w-5 h-5 mr-3 text-secondary animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" class="sketch-circle" />
        </svg>
        <span class="text-sm font-bold text-black tracking-widest uppercase cabin-sketch-regular pt-0.5">
          {{ isSendingDrawing ? 'Sending...' : 'Loading...' }}
        </span>
      </div>
    </transition>

    <DrawMenus />
  </div>
</template>

<script setup lang="ts">
import { IonProgressBar } from '@ionic/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

import Toolbars from '@/components/draw/toolbar/Toolbars.vue'
import MultiplayerAvatars from '@/components/draw/MultiplayerAvatars.vue'
import GhostLayer from '@/components/draw/GhostLayer.vue'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import { useSessionStore } from '@/store/session.store'
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'

const route = useRoute()
const myCanvasRef = ref<HTMLCanvasElement>()
const { initCanvas } = useDrawStore()
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
</script>

<style scoped>
/*
  The Sketching Animation
  Creates an effect where the circle is constantly being drawn and erased
*/
.sketch-circle {
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: draw-erase 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
}

@keyframes draw-erase {
  0% {
    stroke-dashoffset: 60;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Smooth pop-down transition for the pill */
.pop-down-enter-active,
.pop-down-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pop-down-enter-from,
.pop-down-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.9);
}
</style>