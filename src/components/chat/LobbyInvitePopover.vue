<template>
  <ion-popover
    :is-open="isOpen"
    :event="event"
    @didDismiss="$emit('close')"
    class="invite-popover"
    :show-backdrop="true"
    side="top" alignment="center"
  >
    <div class="flex flex-col p-5 w-[310px] bg-background rounded-[2.5rem] shadow-xl border border-default-light">
      <h3 class="text-xs font-black text-secondary uppercase tracking-widest text-center mb-4">
        Invite Mates
      </h3>

      <div class="flex-1 overflow-y-auto hide-scrollbar space-y-2.5 pr-0.5 max-h-[300px]" @touchmove.stop>
        <div v-if="!eligibleToInvite.length" class="text-center py-8 text-xs text-black/50 italic">
          Everyone is already here!
        </div>

        <div
          v-for="friend in eligibleToInvite"
          :key="friend._id"
          class="flex items-center justify-between p-3 bg-tertiary border border-default-light rounded-[1.5rem] shadow-sm transition-all active:scale-[0.99]"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative shrink-0">
              <img
                :src="friend.img"
                class="w-10 h-10 rounded-xl object-cover border border-default-light shadow-sm"
              />
              <div
                v-if="isOnline(friend._id)"
                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"
              ></div>
            </div>

            <div class="flex flex-col min-w-0 leading-tight">
              <span class="text-sm font-black text-heading truncate">
                {{ friend.name.split(' ')[0] }}
              </span>
              <span
                :class="isOnline(friend._id) ? 'text-green-600 font-black' : 'text-black/50'"
                class="text-[9px] uppercase tracking-wider mt-0.5"
              >
                {{ isOnline(friend._id) ? 'Online' : 'Offline' }}
              </span>
            </div>
          </div>

          <button
            @click="handleInvite(friend)"
            class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ml-3 shadow-sm border"
            :class="canInvite(friend._id)
              ? 'bg-secondary border-secondary text-white active:scale-95'
              : 'bg-default-light border-default-medium text-black/50'"
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
import { useDrawSyncer } from '@/draw/sync/session.store'
import { inviteFriendToRoom } from '@/service/api/socket/drawSyncing.socket'
import { useToast } from '@/service/toast.service'

const props = defineProps<{
  isOpen: boolean;
  event: Event | null;
}>()

defineEmits(['close'])

const friendStore = useFriendStore()
const { allConnectedPartners } = storeToRefs(friendStore)
const { roomMembers, roomId } = storeToRefs(useDrawSyncer())

const { toast } = useToast()

const inviteTimestamps = ref<Record<string, number>>({})
const INVITE_COOLDOWN_MS = 30000

const isOnline = (id: string) => friendStore.isFriendOnline(id)

const eligibleToInvite = computed(() => {
  return allConnectedPartners.value
    .filter((f) => !roomMembers.value.some((rm) => rm._id === f._id))
    .sort((a, b) => {
      const aOnline = isOnline(a._id) ? 1 : 0
      const bOnline = isOnline(b._id) ? 1 : 0
      return bOnline - aOnline
    })
})

const canInvite = (friendId: string) => {
  const last = inviteTimestamps.value[friendId] || 0
  return Date.now() - last > INVITE_COOLDOWN_MS
}

const handleInvite = (friend: any) => {
  if (!roomId.value) return

  const firstName = friend.name.split(' ')[0]

  if (!canInvite(friend._id)) {
    const last = inviteTimestamps.value[friend._id] || 0
    const remainingSecs = Math.ceil((INVITE_COOLDOWN_MS - (Date.now() - last)) / 1000)

    toast(`Wait ${remainingSecs}s before inviting ${firstName} again.`, { color: 'warning' })
    return
  }

  if (!isOnline(friend._id)) {
    toast(`${firstName} is offline, but we'll try sending it!`, { color: 'warning' })
  } else {
    toast(`Invite sent to ${firstName}!`, { color: 'success' })
  }

  // 3. Process Invitation
  inviteTimestamps.value[friend._id] = Date.now()
  inviteFriendToRoom(friend._id, roomId.value)
}
</script>

<style scoped>
ion-popover.invite-popover {
  --background: transparent;
  --box-shadow: none;
  --width: 310px
}
</style>
