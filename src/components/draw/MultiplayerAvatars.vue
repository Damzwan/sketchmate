<template>
  <div
    class="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-50 transition-opacity duration-200"
    :class="{ 'opacity-0': isCanvasNavigating, 'opacity-100': !isCanvasNavigating }"
  >
    <TransitionGroup name="avatar-fade">
      <div
        v-for="[id, avatar] in activeAvatars"
        :key="id"
        class="absolute top-0 left-0 flex flex-col items-center gap-1 will-change-transform transition-transform duration-75 ease-linear"
        :style="{ transform: `translate(${avatar.x}px, ${avatar.y}px)` }"
      >
        <ion-avatar class="w-8 h-8 border-2 border-white shadow-md ring-2 ring-primary/50">
          <img :src="avatar.img" :alt="avatar.name" />
        </ion-avatar>

        <div
          class="px-2 py-0.5 text-[10px] font-bold text-white bg-black/75 rounded-full shadow-sm whitespace-nowrap backdrop-blur-sm">
          {{ avatar.name }}
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { IonAvatar } from '@ionic/vue'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { storeToRefs } from 'pinia'

const { activeAvatars, isCanvasNavigating } = storeToRefs(useDrawUIStore())
</script>

<style scoped>

.avatar-fade-enter-active,
.avatar-fade-leave-active {
  transition: opacity 0.3s ease;
}

.avatar-fade-enter-from,
.avatar-fade-leave-to {
  opacity: 0;
}
</style>