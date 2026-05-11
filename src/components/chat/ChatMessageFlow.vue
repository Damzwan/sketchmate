<template>
  <div
    @touchmove.stop
    class="space-y-2 pb-4 flex flex-col justify-end min-h-full animate-tab-in"
  >
    <!-- 0. BLOCKED STATE (High Priority Firewall) -->
    <div v-if="isBlocked" class="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      <div
        class="bg-white/40 border border-white/60 p-8 rounded-[3rem] backdrop-blur-md shadow-xl text-center w-full max-w-xs">
        <div class="relative inline-block mb-4">
          <img
            :src="partner?.img"
            class="w-20 h-20 rounded-[2rem] border-4 border-white shadow-md object-cover grayscale opacity-60"
          />
          <div class="absolute -bottom-1 -right-1 bg-zinc-500 rounded-full p-2 border-2 border-white shadow-sm">
            <ion-icon :icon="svg(mdiAccountOff)" class="text-xs text-white" />
          </div>
        </div>

        <h3 class="text-xl font-black text-black leading-tight cabin-sketch-regular">
          {{ partner?.name }} <br />
          <span class="text-[10px] opacity-40 uppercase tracking-widest font-sans font-bold">is blocked</span>
        </h3>

        <p class="mt-4 text-[11px] font-sans font-bold text-black/40 leading-relaxed uppercase tracking-tighter">
          You won't see messages from this artist <br /> while they are blocked.
        </p>

        <ion-button
          color="dark"
          fill="outline"
          class="mt-8 font-black text-[10px] tracking-widest custom-rounded-button w-full"
          @click="openUserActions(partner)"
        >
          Manage Artist
        </ion-button>
      </div>
    </div>

    <!-- ACTIVE CONTENT (Only shows if NOT blocked) -->
    <template v-else>
      <!-- 1. PENDING: Incoming Chat Request -->
      <div v-if="isIncomingRequest && currentChat" class="px-1">
        <div
          class="my-4 p-6 bg-white/60 border-2 border-secondary/30 rounded-[2.5rem] backdrop-blur-xl shadow-xl animate-fade-in text-center cabin-sketch-regular">
          <div class="relative inline-block mb-3">
            <img :src="partner?.img" class="w-16 h-16 rounded-[1.5rem] border-4 border-white shadow-md object-cover" />
            <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1.5 border-2 border-white shadow-sm">
              <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
            </div>
          </div>

          <h3 class="text-xl font-black text-black leading-tight">
            {{ partner?.name }} <br />
            <span class="text-xs opacity-50 uppercase tracking-widest font-sans font-bold">Sent a sketch request</span>
          </h3>

          <p class="mt-3 text-[10px] font-sans font-bold text-black/50 leading-relaxed uppercase tracking-tighter">
            Accepting starts a 24-hour trial.<br />
            Plenty of time to see if you vibe!
          </p>

          <div class="grid grid-cols-2 gap-3 mt-6">
            <ion-button
              fill="clear"
              class="capitalize font-black text-[10px] tracking-widest text-black/40"
              @click="chatStore.respondToRequest(currentChat._id, 'decline')"
            >
              Ignore
            </ion-button>
            <ion-button
              color="secondary"
              class="font-black text-[10px] tracking-widest shadow-lg custom-rounded-button"
              @click="chatStore.respondToRequest(currentChat._id, 'accept')"
            >
              Accept
            </ion-button>
          </div>
        </div>
      </div>

      <!-- 2. PENDING: Outgoing Chat Request -->
      <div v-else-if="isOutgoingPending" class="flex justify-center my-4">
        <div class="px-4 py-2 bg-black/5 rounded-full flex items-center gap-2">
          <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
          <span class="text-[10px] font-black text-black/30 uppercase tracking-widest italic">
            Waiting for artist to reply...
          </span>
        </div>
      </div>

      <!-- 3. MESSAGE FLOW with TransitionGroup -->
      <!-- 3. MESSAGE FLOW with TransitionGroup -->
      <TransitionGroup
        name="msg-bubble"
        tag="div"
        class="flex flex-col gap-2 w-full"
      >
        <div
          v-for="(msg, index) in messages"
          :key="msg.localKey || msg._id || index"
          class="w-full"
          :class="{ 'skip-anim': msg.isOptimistic !== true }"
        >
          <!-- System Messages -->
          <div v-if="msg.type && msg.type !== 'message'" class="flex justify-center w-full my-2">
            <!-- ... existing system message code ... -->
          </div>

          <!-- User Messages -->
          <div
            v-else
            class="flex items-start gap-2.5 px-1 py-0.5"
            :class="{'flex-row-reverse': isMe(msg), 'mt-[-6px]': isCompact(msg, index)}"
          >
            <div class="w-8 h-8 shrink-0 flex items-end" v-if="!isMe(msg) && !isCompact(msg, index)">
              <!-- ... existing avatar code ... -->
            </div>
            <div v-else-if="!isMe(msg)" class="w-8 shrink-0"></div>

            <div class="flex flex-col max-w-[75%]" :class="{ 'items-end': isMe(msg) }">
              <div
                class="py-2 px-3.5 text-[15px] shadow-sm cabin-sketch-regular tracking-wide"
                :class="isMe(msg)
            ? 'bg-secondary text-white rounded-2xl rounded-tr-sm'
            : 'bg-white/80 text-black rounded-2xl rounded-tl-sm border border-white/60'"
              >
                <div v-if="!isCompact(msg, index) && !isMe(msg) && activeTab === 'lobby'"
                     class="text-[8px] font-black mb-1 opacity-50 uppercase font-sans">
                  {{ msg.member?.name || partner?.name }}
                </div>

                <div class="font-bold">{{ msg.content || msg.message }}</div>

                <!-- UPDATED: Timestamp & Checkmarks -->
                <div class="text-[8px] mt-1 font-sans opacity-80 flex justify-end items-center gap-1">
                  <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>

                  <!-- Checkmarks only for normal private messages sent by the user -->
                  <span v-if="isMe(msg) && activeTab !== 'lobby'" class="text-[11px] flex items-center">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-60" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-300" />
              <ion-icon v-else :icon="checkmarkDoneOutline" class="text-white" />
            </span>
                </div>

              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <!-- 4. RELATIONSHIP STATUS BANNER -->
      <div v-if="showStatusBanner && partner" class="flex justify-center w-full mt-4 px-1">
        <div
          class="w-full flex flex-col items-center p-5 bg-white/50 border border-secondary/20 rounded-[2rem] backdrop-blur-md shadow-sm text-center animate-fade-in">

          <template v-if="isMateProposalReceived">
            <ion-icon :icon="svg(mdiHeart)" class="text-2xl text-secondary mb-1 animate-bounce" />
            <p class="text-sm font-black italic cabin-sketch-regular text-black leading-tight">
              {{ partner.name }} wants to become Mates!
            </p>
            <p class="text-[10px] font-bold text-black/40 uppercase tracking-tighter mb-3">
              Unlock your sketchbooks forever.
            </p>
            <div class="grid grid-cols-2 gap-2 w-full">
              <ion-button
                fill="clear"
                class="capitalize font-black text-[10px] text-black/40"
                @click="handleMateDecline"
              >
                Decline
              </ion-button>
              <ion-button
                color="secondary"
                class="font-black text-[10px] shadow-lg custom-rounded-button"
                @click="handleMateAccept"
              >
                Accept
              </ion-button>
            </div>
          </template>

          <template v-else-if="isMateProposalSent">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-xl text-black/30 mb-1" />
            <p class="text-[10px] font-bold text-black/40 uppercase tracking-widest italic">
              Waiting for {{ partner.name }} to accept...
            </p>
          </template>

          <template v-else-if="isTrialExpired">
            <ion-icon :icon="svg(mdiLockOutline)" class="text-xl text-black/40 mb-1" />
            <p class="text-[11px] font-bold text-black/60 mb-3 leading-tight cabin-sketch-regular">
              Ink Dried! The 24h trial has ended.<br />
              Become Mates to keep sketching.
            </p>
            <ion-button
              color="secondary"
              class="px-4 font-black text-[10px] tracking-widest custom-rounded-button"
              @click="handleMateRequest"
            >
              Send Mate Request
            </ion-button>
          </template>

          <template v-else-if="isTemporaryChat">
            <p class="text-[10px] font-bold text-black/40 leading-tight italic max-w-[200px]">
              Vibe check! You have a 24-hour trial to get to know each other.
            </p>
            <ion-button
              fill="clear"
              size="small"
              class="mt-2 font-black text-secondary uppercase tracking-[0.1em] opacity-60"
              @click="handleMateRequest"
            >
              + Add to Mates
            </ion-button>
          </template>

          <template v-else-if="currentChat?.status === 'expired'">
            <ion-icon :icon="svg(mdiLockOutline)" class="text-xl text-black/20 mb-1" />

            <template v-if="isUnderCooldown">
              <p class="text-[11px] font-bold text-black/40 mb-1 leading-tight cabin-sketch-regular">
                Relationship cooling down...
              </p>
              <p class="text-[9px] font-sans font-bold text-secondary uppercase tracking-widest">
                Available again {{ formattedCooldown }}
              </p>
            </template>

            <template v-else>
              <p class="text-[11px] font-bold text-black/60 mb-3 leading-tight cabin-sketch-regular">
                You are no longer Mates.<br />
                Want to try sketching again?
              </p>
              <ion-button
                color="secondary"
                class="px-6 font-black text-[10px] tracking-widest custom-rounded-button"
                @click="handleMateRequest"
              >
                Send New Request
              </ion-button>
            </template>
          </template>
        </div>
      </div>

      <!-- 5. DRAWING INVITATION BANNER -->
      <div v-if="activeInvite" class="flex justify-center w-full my-6 animate-bounce-in">
        <div
          class="flex flex-col items-center gap-3 p-4 bg-secondary/10 border border-secondary/30 rounded-[2.5rem] backdrop-blur-md w-full max-w-[250px] shadow-2xl relative">
          <button @click="dismissInvite" class="absolute top-3 right-3 text-secondary/40 hover:text-secondary">
            <ion-icon :icon="closeCircle" class="text-xl" />
          </button>

          <div class="relative">
            <img :src="activeInvite.friend?.img"
                 class="w-14 h-14 rounded-2xl border-2 border-white shadow-md object-cover" />
            <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1.5 border-2 border-white shadow-sm">
              <ion-icon :icon="svg(mdiDraw)" class="text-xs text-white" />
            </div>
          </div>

          <div class="text-center">
            <p class="text-[13px] font-bold text-black italic cabin-sketch-regular leading-tight">
              <span class="text-secondary font-black not-italic uppercase text-sm">{{ activeInvite.friend?.name
                }}</span>
              <br />invited you to draw!
            </p>
          </div>

          <ion-button
            color="secondary"
            expand="block"
            class="w-full font-black text-[11px] tracking-widest custom-rounded-button"
            @click="$emit('join-session', activeInvite.roomId)"
          >
            Join Session
          </ion-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { storeToRefs } from 'pinia'
import { IonIcon, IonButton } from '@ionic/vue'
import { closeCircle } from 'ionicons/icons'
import { mdiDraw, mdiHeart, mdiClockOutline, mdiLockOutline, mdiAccountOff } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import { useAuthStore } from '@/store/auth.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useChatStore } from '@/store/chat.store'
import { useFriendStore } from '@/store/friend.store'
import { requestMatership, acceptMatership, declineMatership } from '@/service/api/chat.api'
import { PopulatedConversation } from '@/types/server.types'
import { useUserActions } from '@/composables/profile/useUserActions'
import { checkmarkDoneOutline, timeOutline, alertCircleOutline } from 'ionicons/icons'

dayjs.extend(relativeTime)

const props = defineProps<{ messages: any[] }>()
const emit = defineEmits(['inspect-profile', 'join-session'])

const authStore = useAuthStore()
const chatWidgetStore = useChatWidgetStore()
const chatStore = useChatStore()
const friendStore = useFriendStore()
const drawSyncer = useDrawSyncer()
const { openUserActions } = useUserActions()

const { user } = storeToRefs(authStore)
const { activeTab } = storeToRefs(chatWidgetStore)
const { invitations } = storeToRefs(drawSyncer)
const { activeChats } = storeToRefs(chatStore)
const { pendingRequests } = storeToRefs(friendStore)

const currentChat = computed(() => {
  return [...activeChats.value, ...pendingRequests.value].find(c => c._id === activeTab.value)
})

const partner = computed(() => {
  if (activeTab.value === 'lobby') return null
  return currentChat.value?.participants.find((p: any) => p._id !== user.value?._id)
})

const isBlocked = computed(() => {
  if (!partner.value) return false
  return user.value?.blocked_users?.includes(partner.value._id)
})

const isIncomingRequest = computed(() =>
  currentChat.value?.status === 'pending' &&
  currentChat.value.initiator_id !== user.value?._id
)

const isOutgoingPending = computed(() =>
  currentChat.value?.status === 'pending' &&
  currentChat.value.initiator_id === user.value?._id
)

const isTemporaryChat = computed(() => currentChat.value?.status === 'temporary')
const isMatePending = computed(() => currentChat.value?.status === 'mate_pending')

const showStatusBanner = computed(() =>
  isTemporaryChat.value ||
  isMatePending.value ||
  currentChat.value?.status === 'expired'
)

const isTrialExpired = computed(() => {
  if (!isTemporaryChat.value || !currentChat.value?.trial_expires_at) return false
  return dayjs().isAfter(dayjs(currentChat.value.trial_expires_at))
})

const isMateProposalSent = computed(() =>
  isMatePending.value && currentChat.value?.initiator_id === user.value?._id
)

const isMateProposalReceived = computed(() =>
  isMatePending.value && currentChat.value?.initiator_id !== user.value?._id
)

const isUnderCooldown = computed(() => {
  if (!currentChat.value?.cooldown_until) return false
  return dayjs().isBefore(dayjs(currentChat.value.cooldown_until))
})

const formattedCooldown = computed(() => {
  return dayjs(currentChat.value?.cooldown_until).fromNow()
})

async function handleMateRequest() {
  if (!currentChat.value) return
  try {
    await requestMatership(currentChat.value._id)
    currentChat.value.status = 'mate_pending'
    currentChat.value.initiator_id = user.value?._id
  } catch (e) {
    console.error('Failed to propose matership', e)
  }
}

async function handleMateAccept() {
  if (!currentChat.value) return
  try {
    const { conversation } = await acceptMatership(currentChat.value._id) as { conversation: PopulatedConversation }
    chatStore.handleMateMatched({ conversation })
  } catch (e) {
    console.error('Failed to accept matership', e)
  }
}

async function handleMateDecline() {
  if (!currentChat.value) return
  try {
    const { status, conversation } = await declineMatership(currentChat.value._id) as any
    currentChat.value.status = status
    currentChat.value.initiator_id = undefined
    if (conversation) {
      currentChat.value.trial_expires_at = conversation.trial_expires_at
    }
    chatStore.removeNotification(currentChat.value._id)
  } catch (e) {
    console.error('Failed to decline matership', e)
  }
}

const activeInvite = computed(() => {
  if (activeTab.value === 'lobby' || activeTab.value === 'overview') return null
  let friendId = activeTab.value
  if (currentChat.value) {
    const p = currentChat.value.participants.find(p => p._id !== user.value?._id)
    if (p) friendId = p._id
  }
  return invitations.value.find(inv => inv.friend._id === friendId)
})

const dismissInvite = () => {
  if (activeInvite.value) {
    drawSyncer.invitations = invitations.value.filter(inv => inv.roomId !== activeInvite.value.roomId)
  }
}

const isMe = (msg: any) => msg.sender_id === user.value?._id || msg.member?._id === user.value?._id

const isCompact = (msg: any, index: number) => {
  if (index === 0) return false
  const prev = props.messages[index - 1]
  const currentSender = msg.sender_id || msg.member?._id
  const prevSender = prev.sender_id || prev.member?._id
  return currentSender === prevSender && prev.type !== 'join' && prev.type !== 'leave'
}
</script>

<style scoped>
.custom-rounded-button {
  --border-radius: 1rem;
}

/* --- Bubble Animation Logic --- */
.msg-bubble-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.9);
}

.msg-bubble-enter-active {
  transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.msg-bubble-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.animate-tab-in {
  animation: tabIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes tabIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.skip-anim.msg-bubble-enter-active,
.skip-anim.msg-bubble-enter-from,
.skip-anim.msg-bubble-enter-to {
  transition: none !important;
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
}

.msg-bubble-move {
  transition: transform 0.3s ease;
}
</style>
