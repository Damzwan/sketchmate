<!-- components/chat/ChatRelationshipBanner.vue -->
<template>
  <div class="flex justify-center w-full mt-4 px-1 pb-2">
    <div class="w-full flex flex-col items-center p-5 bg-white/50 border border-secondary/20 rounded-[2rem] backdrop-blur-md shadow-sm text-center animate-fade-in">

      <!-- 1. Incoming Chat Invite -->
      <template v-if="isIncomingInvite">
        <div class="relative inline-block mb-3">
          <img :src="partner?.img" class="w-16 h-16 rounded-[1.5rem] border-4 border-white shadow-md object-cover" />
          <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1.5 border-2 border-white shadow-sm">
            <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
          </div>
        </div>
        <h3 class="text-xl font-black text-black leading-tight">{{ partner?.name }} <br /><span class="text-xs opacity-50 uppercase tracking-widest font-sans font-bold">Sent a sketch request</span></h3>
        <p class="mt-3 text-[10px] font-sans font-bold text-black/50 leading-relaxed uppercase tracking-tighter">Accepting starts a 24-hour trial.<br />Plenty of time to see if you vibe!</p>
        <div class="grid grid-cols-2 gap-3 mt-6 w-full">
          <ion-button fill="clear" class="capitalize font-black text-[10px] tracking-widest text-black/40" @click="$emit('decline-invite')">Ignore</ion-button>
          <ion-button color="secondary" class="font-black text-[10px] tracking-widest shadow-lg custom-rounded-button" @click="$emit('accept-invite')">Accept</ion-button>
        </div>
      </template>

      <!-- 2. Outgoing Chat Invite -->
      <template v-else-if="isOutgoingInvite">
        <div class="px-4 py-2 bg-black/5 rounded-full flex items-center gap-2">
          <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
          <span class="text-[10px] font-black text-black/30 uppercase tracking-widest italic">Waiting for artist to reply...</span>
        </div>
      </template>

      <!-- 3. Received Mate Proposal -->
      <template v-else-if="isMateProposalReceived">
        <ion-icon :icon="svg(mdiHeart)" class="text-2xl text-secondary mb-1 animate-bounce" />
        <p class="text-sm font-black italic cabin-sketch-regular text-black leading-tight">
          {{ partner.name }} wants to become Mates!
        </p>
        <p class="text-[10px] font-bold text-black/40 uppercase tracking-tighter mb-3">
          Unlock your sketchbooks forever.
        </p>
        <div class="grid grid-cols-2 gap-2 w-full">
          <ion-button fill="clear" class="capitalize font-black text-[10px] text-black/40" @click="$emit('decline')">Decline</ion-button>
          <ion-button color="secondary" class="font-black text-[10px] shadow-lg custom-rounded-button" @click="$emit('accept')">Accept</ion-button>
        </div>
      </template>

      <!-- 4. Sent Mate Proposal (WITH CANCEL) -->
      <template v-else-if="isMateProposalSent">
        <ion-icon :icon="svg(mdiClockOutline)" class="text-xl text-black/30 mb-1" />
        <p class="text-[10px] font-bold text-black/40 uppercase tracking-widest italic mb-3">
          Waiting for {{ partner.name }} to accept...
        </p>
        <ion-button fill="clear" size="small" color="danger" class="font-black text-[10px] uppercase tracking-widest" @click="$emit('cancel-mate')">
          Cancel Request
        </ion-button>
      </template>

      <!-- 5. Trial Expired -->
      <template v-else-if="isTrialExpired">
        <ion-icon :icon="svg(mdiLockOutline)" class="text-xl text-black/40 mb-1" />
        <p class="text-[11px] font-bold text-black/60 mb-3 leading-tight cabin-sketch-regular">
          Ink Dried! The 24h trial has ended.<br />Become Mates to keep sketching.
        </p>
        <ion-button color="secondary" class="px-4 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('request')">
          Send Mate Request
        </ion-button>
      </template>

      <!-- 6. Active Trial -->
      <template v-else-if="isTemporaryChat">
        <p class="text-[10px] font-bold text-black/40 leading-tight italic max-w-[200px]">
          Vibe check! You have a 24-hour trial to get to know each other.
        </p>
        <ion-button fill="clear" size="small" class="mt-2 font-black text-secondary uppercase tracking-[0.1em] opacity-60" @click="$emit('request')">
          + Add to Mates
        </ion-button>
      </template>

      <!-- 7. Unfriended / Expired -->
      <template v-else-if="chat.status === 'expired'">
        <ion-icon :icon="svg(mdiLockOutline)" class="text-xl text-black/20 mb-1" />
        <template v-if="isUnderCooldown">
          <p class="text-[11px] font-bold text-black/40 mb-1 leading-tight cabin-sketch-regular">Relationship cooling down...</p>
          <p class="text-[9px] font-sans font-bold text-secondary uppercase tracking-widest">Available again {{ formattedCooldown }}</p>
        </template>
        <template v-else>
          <p class="text-[11px] font-bold text-black/60 mb-3 leading-tight cabin-sketch-regular">
            The connection has ended.<br />Want to try sketching again?
          </p>
          <ion-button color="secondary" class="px-6 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('request')">
            Send New Request
          </ion-button>
        </template>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiHeart, mdiClockOutline, mdiLockOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'

dayjs.extend(relativeTime)

const props = defineProps<{ chat: any; partner: any; currentUserId: string }>()
defineEmits(['accept', 'decline', 'request', 'cancel-mate', 'accept-invite', 'decline-invite'])

const isPendingInvite = computed(() => props.chat?.status === "pending_invite");
const isIncomingInvite = computed(() => isPendingInvite.value && props.chat?.initiator_id !== props.currentUserId);
const isOutgoingInvite = computed(() => isPendingInvite.value && props.chat?.initiator_id === props.currentUserId);

const isTemporaryChat = computed(() => props.chat?.status === "temporary");
const isMatePending = computed(() => props.chat?.status === "pending_mate");

const isTrialExpired = computed(() => {
  if (!isTemporaryChat.value || !props.chat?.trial_expires_at) return false;
  return dayjs().isAfter(dayjs(props.chat.trial_expires_at));
});

const isMateProposalSent = computed(() => isMatePending.value && props.chat?.initiator_id === props.currentUserId);
const isMateProposalReceived = computed(() => isMatePending.value && props.chat?.initiator_id !== props.currentUserId);

const isUnderCooldown = computed(() => {
  if (!props.chat?.cooldown_until) return false;
  return dayjs().isBefore(dayjs(props.chat.cooldown_until));
});
const formattedCooldown = computed(() => dayjs(props.chat?.cooldown_until).fromNow());
</script>

<style scoped>
.custom-rounded-button { --border-radius: 1rem; }
</style>