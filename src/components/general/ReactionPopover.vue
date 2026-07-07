<template>
  <ion-popover
    :is-open="isOpen"
    :event="event"
    @didDismiss="$emit('close')"
    :show-backdrop="false"
    class="liquid-popover"
    side="top"
    alignment="center"
  >
    <div class="flex items-center px-2 py-1.5 space-x-1 animate-pop-in overflow-visible">
      <button
        v-for="(imgSrc, type) in reactionImages"
        :key="type"
        @click="$emit('select', type)"
        class="group relative w-18 h-18 p-1 cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90"
      >
        <img
          :src="imgSrc"
          class="h-full w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:-translate-y-1.5"
          alt="reaction"
        />

        <div
          v-if="userReaction === type"
          class="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-secondary animate-pulse"
        />
      </button>
    </div>
  </ion-popover>
</template>

<script setup lang="ts">
import { IonPopover } from '@ionic/vue';
import { reactionImages } from '@/config/post.config';

defineProps<{
  isOpen: boolean;
  event: Event | null;
  userReaction?: string;
}>();

defineEmits(['close', 'select']);
</script>

<style scoped>
ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
  --width: auto;
  overflow: visible;
}

@keyframes popIn {
  0% { opacity: 0; transform: scale(0.85) translateY(6px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.animate-pop-in {
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
</style>