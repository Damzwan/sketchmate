<!-- components/chat/LobbyConversationItem.vue -->
<template>
  <div
    @click="$emit('open')"
    class="flex items-center p-3 bg-cyan-400/10 border border-cyan-400/30 rounded-3xl active:scale-[0.98] transition-all cursor-pointer mb-4 shadow-sm"
  >
    <div class="relative w-12 h-12 shrink-0">
      <div class="w-full h-full bg-cyan-400 rounded-2xl flex items-center justify-center shadow-inner">
        <ion-icon :icon="svg(mdiEarth)" class="text-white text-2xl" />
      </div>
      <div v-if="unreadCount > 0" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
        {{ unreadCount }}
      </div>
    </div>
    <div class="ml-3 flex-1 min-w-0">
      <div class="flex justify-between items-center">
        <span class="text-sm font-black italic cabin-sketch-regular text-cyan-700">Current Session Lobby</span>
        <span class="text-[10px] font-bold text-cyan-600/60 uppercase">{{ memberCount }} Vibing</span>
      </div>
      <p class="text-xs text-cyan-800/70 truncate cabin-sketch-regular font-bold mt-0.5">
        {{ lastMessage || 'Jump in and say hi!' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { mdiEarth } from '@mdi/js';
import { svg } from '@/helper/general.helper';

defineProps<{
  unreadCount: number;
  memberCount: number;
  lastMessage?: string;
}>();
</script>