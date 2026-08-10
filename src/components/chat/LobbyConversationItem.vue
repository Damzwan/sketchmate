<!-- components/chat/LobbyConversationItem.vue -->
<template>
  <div
    @click="$emit('open')"
    class="group w-full flex items-center gap-3 p-3 rounded-[1.6rem] border border-cyan-400/40 bg-cyan-400/10 shadow-sm active:scale-[0.97] md:hover:border-cyan-400 transition-all cursor-pointer"
  >
    <div class="relative shrink-0">
      <div class="w-11 h-11 bg-cyan-500 rounded-full flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
        <ion-icon :icon="svg(mdiEarth)" class="text-white text-xl" />
      </div>
      <div
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center"
      >
        <span class="text-[8px] font-black text-white leading-none">{{ unreadCount }}</span>
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="text-[15px] leading-none font-black truncate tracking-tight text-cyan-800">
          Lobby chat
        </span>
        <span class="ml-auto shrink-0 text-[10px] font-black uppercase tracking-wider text-cyan-600/70 whitespace-nowrap">
          {{ memberCount }} here
        </span>
      </div>
      <p class="text-[13px] truncate tracking-wide leading-none mt-1.5 text-cyan-800/70">
        {{ lastMessage || 'Jump in and say hi' }}
      </p>
    </div>

    <ion-icon :icon="svg(mdiChevronRight)" class="shrink-0 text-cyan-500/50 text-base transition-transform group-hover:translate-x-0.5" />
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiChevronRight, mdiEarth } from "@mdi/js";
import { svg } from "@/helper/general.helper";

defineProps<{
	unreadCount: number;
	memberCount: number;
	lastMessage?: string;
}>();
</script>
