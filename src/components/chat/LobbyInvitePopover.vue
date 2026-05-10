<template>
  <ion-popover
    :is-open="isOpen"
    :event="event"
    @didDismiss="$emit('close')"
    class="liquid-popover"
    :show-backdrop="false"
  >
    <div class="glass-panel flex flex-col p-5 max-h-[400px]">
      <h3 class="text-sm font-black text-secondary/70 uppercase tracking-widest text-center mb-4 cabin-sketch-regular">
        Invite Mates
      </h3>

      <div class="flex-1 overflow-y-auto hide-scrollbar space-y-2 pr-0.5">
        <div v-if="!eligibleToInvite.length" class="text-center py-6 text-xs font-bold text-black/30 italic">
          Everyone is already here!
        </div>

        <!-- Sorted List: Online users at the top, but everyone looks enabled -->
        <div v-for="friend in eligibleToInvite" :key="friend._id"
             class="flex items-center justify-between p-2.5 bg-white/40 rounded-[1.2rem] border border-white/60 shadow-sm transition-all active:scale-[0.99]">

          <div class="flex items-center gap-3 min-w-0">
            <div class="relative shrink-0">
              <img :src="friend.img" class="w-10 h-10 rounded-xl object-cover border border-white shadow-sm" />
              <!-- Green dot only for online users -->
              <div v-if="isOnline(friend._id)"
                   class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-sm">
              </div>
            </div>

            <div class="flex flex-col min-w-0">
              <span class="text-sm font-bold text-black truncate">{{ friend.name.split(' ')[0] }}</span>
              <!-- Status text remains for clarity -->
              <span v-if="!isOnline(friend._id)" class="text-[9px] text-black/40 font-black uppercase tracking-tighter">
                Offline
              </span>
              <span v-else class="text-[9px] text-green-600 font-black uppercase tracking-tighter">
                Online
              </span>
            </div>
          </div>

          <!-- The button is only disabled during the 30s local cooldown (preventing spam) -->
          <button
            @click="handleInvite(friend._id)"
            :disabled="!canInvite(friend._id)"
            class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ml-2 shadow-sm"
            :class="canInvite(friend._id) ? 'bg-secondary text-white active:scale-90' : 'bg-black/10 text-black/20'"
          >
            {{ canInvite(friend._id) ? 'Invite' : 'Sent' }}
          </button>
        </div>
      </div>
    </div>
  </ion-popover>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { IonPopover } from '@ionic/vue'
import { useFriendStore } from '@/store/friend.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { inviteFriendToRoom } from '@/service/api/socket/drawSyncing.socket'

const props = defineProps<{
  isOpen: boolean
  event: Event | null
}>()

const emit = defineEmits(['close'])

const friendStore = useFriendStore()
const { allConnectedPartners } = storeToRefs(friendStore)
const { roomMembers, roomId } = storeToRefs(useDrawSyncer())

const inviteTimestamps = ref<Record<string, number>>({})
const INVITE_COOLDOWN_MS = 30000

const isOnline = (id: string) => friendStore.isFriendOnline(id)

/**
 * Filter out people already in the room.
 * Sort by online status so available people appear first.
 */
const eligibleToInvite = computed(() => {
  return allConnectedPartners.value
    .filter(f => !roomMembers.value.some(rm => rm._id === f._id))
    .sort((a, b) => {
      const aOnline = isOnline(a._id) ? 1 : 0
      const bOnline = isOnline(b._id) ? 1 : 0
      return bOnline - aOnline
    })
})

const canInvite = (friendId: string) => {
  const last = inviteTimestamps.value[friendId] || 0
  return (Date.now() - last) > INVITE_COOLDOWN_MS
}

const handleInvite = (friendId: string) => {
  if (!roomId.value || !canInvite(friendId)) return
  inviteTimestamps.value[friendId] = Date.now()
  inviteFriendToRoom(friendId, roomId.value)
}
</script>