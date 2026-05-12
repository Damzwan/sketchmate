<!-- components/chat/ChatFriendPicker.vue -->
<template>
  <div class="animate-fade-in space-y-6 pb-20 px-2">
    <div class="flex items-center justify-between p-2">
      <span class="text-2xl font-normal cabin-sketch-regular text-black">Select Mate</span>
      <button
        @click="$emit('cancel')"
        class="text-xs font-black text-secondary uppercase tracking-widest active:opacity-50"
      >
        Cancel
      </button>
    </div>

    <div v-if="friends.length > 0" class="space-y-2">
      <p class="text-[10px] font-black text-black/30 uppercase px-2 tracking-widest">
        Your Mates
      </p>

      <button
        v-for="friend in sortedFriends"
        :key="friend._id"
        @click="!isDisabled(friend) && $emit('select-friend', friend)"
        :disabled="isDisabled(friend)"
        :class="[
          'w-full flex items-center p-3 rounded-3xl border transition-all shadow-sm relative text-left',
          isDisabled(friend)
            ? 'bg-white/10 border-black/5 opacity-40 cursor-not-allowed grayscale'
            : 'bg-white/40 border-white/60 active:scale-[0.98] cursor-pointer'
        ]"
      >
        <div class="relative shrink-0">
          <img
            :src="friend.img"
            class="w-12 h-12 rounded-xl object-cover border border-white/40 shadow-sm"
          />
          <!-- Online indicator badge inside the button -->
          <div
            v-if="isFriendOnline(friend._id) && !isDisabled(friend)"
            class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"
          ></div>
        </div>

        <div class="flex flex-col ml-4 flex-1">
          <span class="text-lg font-bold text-black leading-tight">{{ friend.name }}</span>
          <span
            v-if="isDisabled(friend)"
            class="text-[9px] font-black text-red-500 uppercase tracking-tighter mt-0.5"
          >
            Needs update to chat
          </span>
          <span
            v-else-if="isFriendOnline(friend._id)"
            class="text-[9px] font-black text-green-600 uppercase tracking-tighter mt-0.5"
          >
            Online now
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { compareVersions } from '@/helper/general.helper'

const props = defineProps<{
  friends: any[]
  minChatVersion: string
  isFriendOnline: (id: string) => boolean
}>()

defineEmits(['cancel', 'select-friend'])

const isDisabled = (friend: any) => {
  return !friend.last_seen_version || compareVersions(friend.last_seen_version, props.minChatVersion) === -1
}

const sortedFriends = computed(() => {
  return [...props.friends].sort((a, b) => {
    const aDisabled = isDisabled(a)
    const bDisabled = isDisabled(b)

    if (aDisabled !== bDisabled) {
      return aDisabled ? 1 : -1
    }

    const aOnline = props.isFriendOnline(a._id)
    const bOnline = props.isFriendOnline(b._id)
    if (aOnline !== bOnline) {
      return aOnline ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })
})
</script>

<style scoped>

</style>