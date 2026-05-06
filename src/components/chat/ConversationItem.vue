<template>
  <div
    @click="$emit('open', chat._id)"
    class="group relative w-full flex items-center p-3 bg-primary/40 backdrop-blur-xl rounded-[2rem] border border-primary/60 shadow-md active:scale-[0.98] transition-all cursor-pointer overflow-hidden"
  >
    <!-- Avatar -->
    <div class="relative w-14 h-14 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm flex items-center justify-center flex-shrink-0 z-10 p-0.5">
      <img
        v-if="partner?.img"
        :src="partner.img"
        class="w-full h-full rounded-[1.1rem] object-cover"
      />
      <span v-else class="text-lg font-bold text-black">{{ partner?.name.charAt(0) || '?' }}</span>

      <!-- Online Indicator -->
      <div
        v-if="isOnline"
        class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 border-2 border-primary/40 rounded-full z-10"
      ></div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0 ml-4 z-10 text-left">
      <div class="flex justify-between items-end mb-1">
        <p class="text-base leading-none font-black text-black truncate pr-2">
          {{ partner?.name || 'Unknown User' }}
        </p>
        <p class="text-[10px] text-black/50 font-bold uppercase whitespace-nowrap">
          {{ formattedTime }}
        </p>
      </div>

      <p
        class="text-sm truncate font-bold"
        :class="unreadCount > 0 ? 'text-black' : 'text-black/50'"
      >
        <span v-if="isTyping" class="text-tertiary italic">typing...</span>
        <span v-else>{{ chat.last_message?.content || 'Started a conversation' }}</span>
      </p>
    </div>

    <!-- Unread Badge -->
    <div
      v-if="unreadCount > 0"
      class="ml-3 z-10 bg-tertiary border border-white/40 shadow-sm min-w-[1.5rem] h-6 px-1.5 rounded-full flex items-center justify-center text-xs font-black text-white"
    >
      {{ unreadCount }}
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

const partner = computed(() => {
  return props.chat.participants?.find((p: any) => p._id !== props.currentUserId)
})

const unreadCount = computed(() => {
  return props.chat.unread_counts?.[props.currentUserId] || 0
})

const formattedTime = computed(() => {
  return dayjs(props.chat.updatedAt).fromNow(true)
})
</script>