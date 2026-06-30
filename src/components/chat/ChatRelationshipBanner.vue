<template>
  <div class="flex justify-center w-full mt-2 px-1 pb-1">
    <div
      class="w-full bg-white border border-primary/10 rounded-[2rem] shadow-md animate-fade-in relative overflow-hidden transition-all duration-300"
      :class="cardAccentClass"
    >
      <div class="absolute -right-5 -top-6 w-20 h-20 rounded-full blur-2xl pointer-events-none opacity-40"
           :class="accent.glow"></div>

      <div v-if="showJourney" class="px-5 pt-4 pb-3 border-b border-black/5">
        <RelationshipJourney :step="rel.step" :accent="effectiveAccent" />
        <p v-if="showExplainer" class="mt-2.5 text-center text-[9px] font-bold uppercase tracking-widest text-black/30">
          Invite → 24h Trial → Forever Mates 🤝
        </p>
      </div>

      <div class="relative p-5 flex flex-col items-center text-center">

        <template v-if="isIncomingInvite">
          <div class="relative mb-3">
            <img :src="partner?.img" class="w-14 h-14 rounded-2xl border-2 border-white shadow-sm object-cover"
                 alt="" />
            <div
              class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1.5 border border-white shadow-sm flex items-center justify-center">
              <ion-icon :icon="svg(mdiPalette)" class="text-[10px] text-white" />
            </div>
          </div>
          <h3 class="cabin-sketch-regular text-lg font-black text-black leading-tight">
            Sketch with {{ partner?.name }}?
          </h3>
          <p class="mt-1 text-[10px] font-bold text-black/40 uppercase tracking-wider">
            Starts a 24-hour trial to see if you vibe.
          </p>
          <div class="grid grid-cols-2 gap-3 mt-4 w-full max-w-[260px]">
            <ion-button fill="clear" shape="round" @click="$emit('decline-invite')">
              Ignore
            </ion-button>
            <ion-button color="secondary" shape="round" @click="$emit('accept-invite')">
              Accept
            </ion-button>
          </div>
        </template>

        <template v-else-if="isOutgoingInvite">
          <div class="px-4 py-2 bg-black/5 rounded-full flex items-center gap-2">
            <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
            <span class="text-[9px] font-black text-black/40 uppercase tracking-widest">
              Waiting for {{ firstName }}
            </span>
          </div>
        </template>

        <template v-else-if="isMateProposalReceived">
          <div v-if="showUpgradePrompt" class="flex flex-col items-center w-full">
            <div
              class="w-10 h-10 bg-amber-400/10 text-amber-500 rounded-full flex items-center justify-center mb-2 text-base">
              ⭐
            </div>
            <h3 class="cabin-sketch-regular text-base font-black text-black">{{ partner?.name }} wants to be Mates!</h3>
            <p class="text-[9px] font-bold text-amber-700 uppercase tracking-wider mt-1 mb-3">
              Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
            </p>
            <div class="grid grid-cols-2 gap-2.5 w-full max-w-[240px]">
              <ion-button fill="clear" shape="round" @click="$emit('decline')">Decline</ion-button>
              <ion-button color="warning" shape="round" @click="$emit('upgrade')">⭐ Upgrade</ion-button>
            </div>
          </div>

          <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeart)" class="text-xl text-black/20 mb-2" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">{{ partner?.name }} wants to be Mates!</h3>
            <p class="text-[9px] font-bold text-black/40 uppercase tracking-widest mt-1 mb-3">Max limit reached</p>
            <ion-button fill="clear" shape="round" @click="$emit('decline')">Decline</ion-button>
          </div>

          <div v-else class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeart)" class="text-2xl text-secondary mb-2 animate-bounce" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">{{ partner?.name }} wants to be Mates!</h3>
            <div class="grid grid-cols-2 gap-2.5 w-full max-w-[240px]">
              <ion-button fill="clear" color="dark" shape="round" @click="$emit('decline')">Decline</ion-button>
              <ion-button color="secondary" shape="round" @click="$emit('accept')">Accept</ion-button>
            </div>
          </div>
        </template>

        <template v-else-if="isMateProposalSent">
          <div class="px-4 py-2 bg-black/5 rounded-full flex items-center gap-2 mb-2.5">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-xs text-black/30" />
            <span class="text-[9px] font-black text-black/40 uppercase tracking-widest">Waiting for {{ firstName }}</span>
          </div>
          <ion-button fill="clear" shape="round" color="danger" @click="$emit('cancel-mate')">
            Cancel
          </ion-button>
        </template>

        <template v-else-if="isTrialExpired">
          <div v-if="showUpgradePrompt" class="flex flex-col items-center w-full">
            <div
              class="w-10 h-10 bg-amber-400/10 text-amber-500 rounded-full flex items-center justify-center mb-2 text-base">
              ⭐
            </div>
            <h3 class="cabin-sketch-regular text-base font-black text-black">Trial with {{ firstName }} ended</h3>
            <p class="text-[9px] font-bold text-amber-700 uppercase tracking-wider mt-1 mb-3">
              Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
            </p>
            <ion-button color="warning" shape="round" @click="$emit('upgrade')">
              ⭐ Upgrade to Add
            </ion-button>
          </div>

          <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiLockOutline)" class="text-xl text-black/30 mb-2" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Trial with {{ firstName }} ended</h3>
            <p class="text-[9px] font-bold text-black/40 uppercase tracking-widest mt-1">Maximum limits reached</p>
          </div>

          <div v-else class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeartPlusOutline)" class="text-2xl text-secondary mb-2" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Trial with {{ firstName }} ended</h3>
            <p class="text-[9px] font-bold text-black/40 uppercase tracking-wider mt-1 mb-4">Become Mates to stay connected.</p>
            <ion-button color="secondary" shape="round" @click="$emit('request')">
              Become Mates
            </ion-button>
          </div>
        </template>

        <template v-else-if="isTemporaryChat">
          <ion-icon :icon="svg(mdiClockOutline)" class="text-2xl text-secondary mb-2" />
          <p class="text-[11px] font-black text-black/60 uppercase tracking-wider max-w-[220px]">
            You're in a 24-hour Trial.
          </p>

          <ion-button
            v-if="showUpgradePrompt"
            fill="clear"
            shape="round"
            color="warning"
            @click="$emit('upgrade')"
          >
            ⭐ Upgrade to Add ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
          </ion-button>
          <span v-else-if="showProLimitReached"
                class="mt-2 text-[9px] font-black uppercase tracking-widest text-black/30">
            Mate limit reached
          </span>
          <ion-button
            v-else
            color="secondary"
            shape="round"
            @click="$emit('request')"
          >
            <ion-icon :icon="svg(mdiHeart)" slot="start" class="text-xs mr-1" />
            Become Mates
          </ion-button>
        </template>

        <template v-else-if="isExpired">
          <div v-if="isUnderCooldown" class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-xl text-black/20 mb-1.5" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Cooling down…</h3>
            <p class="text-[8px] font-black text-secondary uppercase tracking-widest mt-1">Available {{ formattedCooldown }}</p>
          </div>

          <div v-else-if="showUpgradePrompt" class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl text-black/30 mb-2" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Connection ended</h3>
            <p class="text-[9px] font-bold text-amber-700 uppercase tracking-wider mt-1 mb-3">
              Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
            </p>
            <ion-button color="warning" shape="round" @click="$emit('upgrade')">
              ⭐ Upgrade
            </ion-button>
          </div>

          <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl text-black/30 mb-1.5" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Connection ended</h3>
            <p class="text-[9px] font-bold text-black/40 uppercase tracking-widest mt-1">Maximum limit reached</p>
          </div>

          <div v-else class="flex flex-col items-center w-full">
            <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl text-black/30 mb-2" />
            <h3 class="cabin-sketch-regular text-base font-black text-black">Connection ended</h3>
            <p class="text-[9px] font-bold text-black/40 uppercase tracking-wider mt-1 mb-4">Start fresh with a new invite?</p>
            <ion-button color="secondary" shape="round" @click="$emit('request')">
              Send New Invite
            </ion-button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { IonButton, IonIcon } from '@ionic/vue'
import {
  mdiHeart,
  mdiHeartBroken,
  mdiHeartPlusOutline,
  mdiClockOutline,
  mdiLockOutline,
  mdiPalette
} from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useQuotaStore } from '@/store/quota.store'
import {
  resolveRelationship,
  RELATIONSHIP_ACCENT
} from '@/config/relationship.config'
import RelationshipJourney from './RelationshipJourney.vue'

dayjs.extend(relativeTime)

const props = defineProps<{ chat: any; partner: any; currentUserId: string }>()
defineEmits([
  'accept',
  'decline',
  'request',
  'cancel-mate',
  'accept-invite',
  'decline-invite',
  'upgrade'
])

const quotaStore = useQuotaStore()

const rel = computed(() =>
  resolveRelationship({
    status: props.chat?.status,
    initiatorId: props.chat?.initiator_id,
    currentUserId: props.currentUserId,
    trialExpiresAt: props.chat?.trial_expires_at
  })
)

const firstName = computed(() => props.partner?.name?.split(' ')[0] || 'them')

/* --- Original state flags (Preserved 1:1) --- */
const isPendingInvite = computed(() => props.chat?.status === 'pending_invite')
const isIncomingInvite = computed(
  () => isPendingInvite.value && props.chat?.initiator_id !== props.currentUserId
)
const isOutgoingInvite = computed(
  () => isPendingInvite.value && props.chat?.initiator_id === props.currentUserId
)

const isTemporaryChat = computed(() => props.chat?.status === 'temporary')
const isMatePending = computed(() => props.chat?.status === 'pending_mate')

const isTrialExpired = computed(() => {
  if (!isTemporaryChat.value || !props.chat?.trial_expires_at) return false
  return dayjs().isAfter(dayjs(props.chat.trial_expires_at))
})

const isMateProposalSent = computed(
  () => isMatePending.value && props.chat?.initiator_id === props.currentUserId
)
const isMateProposalReceived = computed(
  () => isMatePending.value && props.chat?.initiator_id !== props.currentUserId
)

const isExpired = computed(() => props.chat?.status === 'expired')

const isUnderCooldown = computed(() => {
  if (!props.chat?.cooldown_until) return false
  return dayjs().isBefore(dayjs(props.chat.cooldown_until))
})
const formattedCooldown = computed(() =>
  dayjs(props.chat?.cooldown_until).fromNow()
)

const showUpgradePrompt = computed(
  () => !quotaStore.canAddMate && !quotaStore.isPro
)
const showProLimitReached = computed(
  () => !quotaStore.canAddMate && quotaStore.isPro
)

/* --- Presentation Contexts --- */
const showJourney = computed(() => rel.value.step >= 1 && !isExpired.value)
const showExplainer = computed(
  () =>
    isIncomingInvite.value || (isTemporaryChat.value && !isTrialExpired.value)
)

const effectiveAccent = computed(() => {
  const isUpsellMoment =
    (isMateProposalReceived.value ||
      isTrialExpired.value ||
      isExpired.value) &&
    showUpgradePrompt.value
  return isUpsellMoment ? 'amber' : rel.value.accent
})
const accent = computed(() => RELATIONSHIP_ACCENT[effectiveAccent.value])

const cardAccentClass = computed(() => {
  if (!rel.value.actionable) return ''
  return effectiveAccent.value === 'amber'
    ? 'ring-2 ring-amber-400/20 border-amber-300'
    : 'ring-2 ring-secondary/10 border-secondary/20'
})
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.25s cubic-bezier(0.21, 1.02, 0.43, 1.01) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98) translateY(2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>