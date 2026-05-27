<template>
  <div class="flex justify-center w-full mt-2 px-0.5 pb-1">
    <div class="w-full flex flex-col items-center p-5 bg-white border border-primary/50 rounded-[2.25rem] shadow-sm text-center animate-fade-in relative overflow-hidden">
      <div class="absolute -right-4 -bottom-4 w-16 h-16 rounded-full bg-primary/20 blur-xl pointer-events-none"></div>

      <template v-if="isIncomingInvite">
        <div class="relative inline-block mb-3 overflow-visible">
          <img :src="partner?.img" class="w-14 h-14 rounded-[1.35rem] border-2 border-white shadow-md object-cover" alt="" />
          <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1 border border-white shadow-sm flex items-center justify-center">
            <ion-icon :icon="svg(mdiHeart)" class="text-[9px] text-white" />
          </div>
        </div>
        <h3 class="cabin-sketch-regular text-lg font-black text-black leading-tight">
          {{ partner?.name }}<br />
          <span class="text-[10px] opacity-40 uppercase tracking-widest font-sans font-black">Sent a sketch request</span>
        </h3>
        <p class="mt-2 text-[9px] font-bold text-black/40 uppercase tracking-wider leading-snug">
          Accepting starts a 24-hour trial.<br />Plenty of time to see if you vibe!
        </p>
        <div class="grid grid-cols-2 gap-3 mt-4.5 w-full">
          <ion-button fill="clear" class="capitalize font-black text-[10px] tracking-widest text-black/40" @click="$emit('decline-invite')">Ignore</ion-button>
          <ion-button color="secondary" class="font-black text-[10px] tracking-widest shadow-sm custom-rounded-button" @click="$emit('accept-invite')">Accept</ion-button>
        </div>
      </template>

      <template v-else-if="isOutgoingInvite">
        <div class="px-4 py-1.5 bg-black/5 border border-black/5 rounded-full flex items-center gap-2">
          <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
          <span class="text-[9px] font-black text-black/40 uppercase tracking-widest italic">Waiting for artist to reply...</span>
        </div>
      </template>

      <template v-else-if="isMateProposalReceived">
        <template v-if="showUpgradePrompt">
          <div class="w-10 h-10 bg-amber-400/20 rounded-full flex items-center justify-center mb-2 border border-white shadow-sm text-base">⭐</div>
          <p class="text-sm font-black italic cabin-sketch-regular text-black leading-tight">
            {{ partner.name }} wants to be Mates!
          </p>
          <p class="text-[9px] font-black text-amber-700 uppercase tracking-wider mb-3 mt-1 leading-none">
            Slots Full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
          </p>
          <div class="grid grid-cols-2 gap-2.5 w-full">
            <ion-button fill="clear" class="capitalize font-black text-[10px] text-black/40" @click="$emit('decline')">Decline</ion-button>
            <ion-button color="warning" class="font-black text-[10px] shadow-sm custom-rounded-button" @click="$emit('upgrade')">⭐ Upgrade</ion-button>
          </div>
        </template>

        <template v-else-if="showProLimitReached">
          <ion-icon :icon="svg(mdiHeart)" class="text-xl text-black/20 mb-1" />
          <p class="text-sm font-black italic cabin-sketch-regular text-black leading-tight">
            {{ partner.name }} wants to be Mates!
          </p>
          <p class="text-[9px] font-black text-black/40 uppercase tracking-widest mb-3 mt-1">
            Max Mate Limit Reached
          </p>
          <ion-button fill="clear" class="capitalize font-black text-[10px] text-black/40" @click="$emit('decline')">Decline</ion-button>
        </template>

        <template v-else>
          <ion-icon :icon="svg(mdiHeart)" class="text-xl text-secondary mb-1 animate-bounce" />
          <p class="text-sm font-black italic cabin-sketch-regular text-black leading-tight">
            {{ partner.name }} wants to become Mates!
          </p>
          <p class="text-[9px] font-black text-black/40 uppercase tracking-widest mb-3.5 mt-0.5">
            Unlock your sketchbooks forever.
          </p>
          <div class="grid grid-cols-2 gap-2.5 w-full">
            <ion-button fill="clear" class="capitalize font-black text-[10px] text-black/40" @click="$emit('decline')">Decline</ion-button>
            <ion-button color="secondary" class="font-black text-[10px] shadow-sm custom-rounded-button" @click="$emit('accept')">Accept</ion-button>
          </div>
        </template>
      </template>

      <template v-else-if="isMateProposalSent">
        <ion-icon :icon="svg(mdiClockOutline)" class="text-lg text-black/30 mb-1" />
        <p class="text-[9px] font-black text-black/40 uppercase tracking-widest italic mb-2.5">
          Waiting for {{ partner.name }} to accept...
        </p>
        <ion-button fill="clear" size="small" color="danger" class="font-black text-[9px] uppercase tracking-widest m-0 p-0" @click="$emit('cancel-mate')">
          Cancel Request
        </ion-button>
      </template>

      <template v-else-if="isTrialExpired">
        <template v-if="showUpgradePrompt">
          <div class="w-10 h-10 bg-amber-400/20 rounded-full flex items-center justify-center mb-2 border border-white shadow-sm text-base">⭐</div>
          <p class="text-sm font-black leading-tight cabin-sketch-regular text-black">
            Ink Dried! The 24h trial has ended.
          </p>
          <p class="text-[9px] font-black text-amber-700 uppercase tracking-wider mb-3 mt-1 leading-none">
            Slots Full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }}) — Double with Pro
          </p>
          <ion-button color="warning" class="px-4 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('upgrade')">⭐ Upgrade to Add</ion-button>
        </template>

        <template v-else-if="showProLimitReached">
          <ion-icon :icon="svg(mdiLockOutline)" class="text-lg text-black/40 mb-1" />
          <p class="text-sm font-black leading-tight cabin-sketch-regular text-black">
            Ink Dried! The 24h trial has ended.
          </p>
          <p class="text-[9px] font-black text-black/40 uppercase tracking-widest mt-1">
            Maximum mate limit reached
          </p>
        </template>

        <template v-else>
          <ion-icon :icon="svg(mdiLockOutline)" class="text-lg text-black/40 mb-1" />
          <p class="text-sm font-black leading-snug cabin-sketch-regular text-black mb-3">
            Ink Dried! The 24h trial has ended.<br />Become Mates to keep sketching.
          </p>
          <ion-button color="secondary" class="px-4 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('request')">Send Mate Request</ion-button>
        </template>
      </template>

      <template v-else-if="isTemporaryChat">
        <p class="text-[9px] font-black text-black/40 leading-snug uppercase tracking-wider max-w-[200px]">
          Vibe check! You have a 24-hour trial to get to know each other.
        </p>
        <ion-button
          v-if="showUpgradePrompt"
          fill="clear"
          size="small"
          color="warning"
          class="mt-1.5 font-black text-[9px] uppercase tracking-widest"
          @click="$emit('upgrade')"
        >
          ⭐ Upgrade to Add ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
        </ion-button>
        <span
          v-else-if="showProLimitReached"
          class="mt-1.5 text-[9px] font-black uppercase tracking-widest text-black/30"
        >
          Mate Limit Reached
        </span>
        <ion-button
          v-else
          fill="clear"
          size="small"
          class="mt-1.5 font-black text-[9px] uppercase tracking-widest text-secondary opacity-70"
          @click="$emit('request')"
        >
          + Add to Mates
        </ion-button>
      </template>

      <template v-else-if="chat.status === 'expired'">
        <ion-icon :icon="svg(mdiLockOutline)" class="text-lg text-black/20 mb-1" />
        <template v-if="isUnderCooldown">
          <p class="text-sm font-black leading-tight cabin-sketch-regular text-black">Relationship cooling down...</p>
          <p class="text-[8px] font-black text-secondary uppercase tracking-widest mt-1">Available again {{ formattedCooldown }}</p>
        </template>

        <template v-else-if="showUpgradePrompt">
          <p class="text-sm font-black leading-tight cabin-sketch-regular text-black">The connection has ended.</p>
          <p class="text-[9px] font-black text-amber-700 uppercase tracking-wider mb-3 mt-1">
            Slots Full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }}) — Upgrade to reconnect
          </p>
          <ion-button color="warning" class="px-4 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('upgrade')">⭐ Upgrade to Reconnect</ion-button>
        </template>

        <template v-else-if="showProLimitReached">
          <p class="text-sm font-black leading-tight cabin-sketch-regular text-black">The connection has ended.</p>
          <p class="text-[9px] font-black text-black/40 uppercase tracking-widest mt-1">Maximum mate limit reached</p>
        </template>

        <template v-else>
          <p class="text-sm font-black leading-snug cabin-sketch-regular text-black mb-3">
            The connection has ended.<br />Want to try sketching again?
          </p>
          <ion-button color="secondary" class="px-5 font-black text-[10px] tracking-widest custom-rounded-button" @click="$emit('request')">Send New Request</ion-button>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiHeart, mdiClockOutline, mdiLockOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useQuotaStore } from "@/store/quota.store";

dayjs.extend(relativeTime);

const props = defineProps<{ chat: any; partner: any; currentUserId: string }>();
defineEmits([
	"accept",
	"decline",
	"request",
	"cancel-mate",
	"accept-invite",
	"decline-invite",
	"upgrade",
]);

const quotaStore = useQuotaStore();

const isPendingInvite = computed(() => props.chat?.status === "pending_invite");
const isIncomingInvite = computed(
	() =>
		isPendingInvite.value && props.chat?.initiator_id !== props.currentUserId,
);
const isOutgoingInvite = computed(
	() =>
		isPendingInvite.value && props.chat?.initiator_id === props.currentUserId,
);

const isTemporaryChat = computed(() => props.chat?.status === "temporary");
const isMatePending = computed(() => props.chat?.status === "pending_mate");

const isTrialExpired = computed(() => {
	if (!isTemporaryChat.value || !props.chat?.trial_expires_at) return false;
	return dayjs().isAfter(dayjs(props.chat.trial_expires_at));
});

const isMateProposalSent = computed(
	() => isMatePending.value && props.chat?.initiator_id === props.currentUserId,
);
const isMateProposalReceived = computed(
	() => isMatePending.value && props.chat?.initiator_id !== props.currentUserId,
);

const isUnderCooldown = computed(() => {
	if (!props.chat?.cooldown_until) return false;
	return dayjs().isBefore(dayjs(props.chat.cooldown_until));
});
const formattedCooldown = computed(() =>
	dayjs(props.chat?.cooldown_until).fromNow(),
);

const showUpgradePrompt = computed(
	() => !quotaStore.canAddMate && !quotaStore.isPro,
);
const showProLimitReached = computed(
	() => !quotaStore.canAddMate && quotaStore.isPro,
);
</script>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97) translateY(4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>