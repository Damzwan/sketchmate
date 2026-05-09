<template>
  <div
    @click="$emit('open', chat._id)"
    class="group relative w-full flex items-center p-3 bg-white/40 hover:bg-white/60 backdrop-blur-md rounded-[1.5rem] border border-white/60 shadow-sm active:scale-[0.98] transition-all cursor-pointer overflow-hidden"
  >
    <!-- Avatar -->
    <div class="relative w-12 h-12 rounded-xl flex-shrink-0">
      <img
        v-if="partner?.img"
        :src="partner.img"
        class="w-full h-full rounded-xl object-cover shadow-sm border border-white/40"
      />
      <span v-else class="flex items-center justify-center w-full h-full bg-primary/20 text-lg font-bold text-black rounded-xl">
        {{ partner?.name.charAt(0) || '?' }}
      </span>

      <!-- Online Indicator -->
      <div
        v-if="isOnline"
        class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-400 border-2 border-[#FFF2E4] rounded-full z-10"
      ></div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0 ml-3.5 text-left">
      <div class="flex justify-between items-end mb-0.5">
    <span class="text-base leading-none font-black truncate pr-2" :class="unreadCount > 0 ? 'text-black' : 'text-black/80'">
      {{ partner?.name || 'Unknown User' }}
    </span>
        <span class="text-[10px] font-bold uppercase whitespace-nowrap" :class="unreadCount > 0 ? 'text-red-600' : 'text-black/40'">
      {{ formattedTime }}
    </span>
      </div>

      <div class="flex items-center justify-between">
        <p class="text-[13px] truncate cabin-sketch-regular tracking-wide pr-2" :class="unreadCount > 0 ? 'font-black text-black' : 'font-bold text-black/60'">
          <span v-if="isTyping" class="text-secondary animate-pulse italic">typing...</span>
          <span v-else>{{ chat.last_message?.content || 'Started a conversation' }}</span>
        </p>

        <div
          v-if="unreadCount > 0"
          class="min-w-[1.25rem] h-5 px-1.5 bg-red-500 rounded-full flex items-center justify-center shadow-md flex-shrink-0 ml-2 animate-bounce-in"
        >
      <span class="text-[10px] font-black text-white leading-none">
        {{ unreadCount }}
      </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { PopulatedConversation } from '@/types/server.types'

dayjs.extend(relativeTime)

const props = defineProps<{
  chat: PopulatedConversation;
  currentUserId: string;
  isOnline: boolean;
  isTyping: boolean;
}>()

defineEmits(['open'])

const partner = computed(() => props.chat.participants?.find((p: any) => p._id !== props.currentUserId))
const unreadCount = computed(() => props.chat.unread_counts?.[props.currentUserId] || 0)
const formattedTime = computed(() => dayjs(props.chat.updatedAt).fromNow(true))
</script>