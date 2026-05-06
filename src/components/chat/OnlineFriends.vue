<!-- components/chat/OnlineFriends.vue -->
<template>
  <section v-if="friends.length > 0">
    <div class="flex items-center justify-between px-1 mb-3">
      <p class="text-base font-black text-black tracking-tight italic">Online Now</p>
      <div class="flex items-center space-x-1">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span class="text-xs font-bold text-black/60">{{ friends.length }}</span>
      </div>
    </div>
    <div class="flex space-x-4 overflow-x-auto hide-scrollbar pb-2 pt-1 px-1">
      <button v-for="friend in friends" :key="friend._id"
              @click="$emit('start', friend._id)"
              class="flex flex-col items-center space-y-2 flex-shrink-0 active:scale-95 transition-transform"
      >
        <div class="relative w-16 h-16 rounded-[1.5rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-md flex items-center justify-center p-0.5">
          <img v-if="friend.img" :src="friend.img" class="w-full h-full rounded-[1.25rem] object-cover" />
          <span v-else class="text-xl font-bold text-black">{{ friend.name.charAt(0) }}</span>
          <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 border-2 border-background rounded-full z-10 shadow-sm"></div>
        </div>
        <span class="text-xs font-bold text-black max-w-[64px] truncate">{{ friend.name }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Mate } from '@/types/server.types'
defineProps<{ friends: Mate[] }>()
defineEmits(['start'])
</script>