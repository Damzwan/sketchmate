<template>
  <div class="w-full">
    <button
      v-if="isMinimized"
      @click="toggleMinimized"
      class="w-full flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-white border border-primary/15 shadow-sm animate-fade-in active:scale-[0.99] md:hover:border-primary/40 md:hover:shadow transition-all cursor-pointer"
    >
      <ion-icon :icon="svg(mdiClockOutline)" class="text-base text-secondary shrink-0" />
      <span class="text-xs font-black uppercase tracking-widest text-black/70 truncate">{{ miniLabel }}</span>
      <span class="ml-auto text-xs font-black uppercase tracking-widest text-secondary shrink-0">Show</span>
    </button>

    <div
      v-else
      class="w-full rounded-2xl border bg-white shadow-sm overflow-hidden animate-fade-in transition-all duration-300"
      :class="containerClass"
    >
      <div class="flex items-center justify-end gap-1.5 px-2 pt-2">
        <button
          @click="showInfo = !showInfo"
          aria-label="Why invites?"
          class="w-10 h-10 rounded-full flex items-center justify-center text-black/40 cursor-pointer md:hover:text-black/70 md:hover:bg-black/5 active:scale-90 transition"
        >
          <ion-icon :icon="svg(showInfo ? mdiClose : mdiInformationOutline)" class="text-2xl" />
        </button>
        <button
          v-if="isMinimizable && !showInfo"
          @click="toggleMinimized"
          aria-label="Minimize"
          class="w-10 h-10 rounded-full flex items-center justify-center text-black/40 cursor-pointer md:hover:text-black/70 md:hover:bg-black/5 active:scale-90 transition"
        >
          <ion-icon :icon="svg(mdiMinus)" class="text-2xl" />
        </button>
      </div>

      <div
        v-if="showInfo"
        class="px-5 pb-6 pt-1 flex flex-col items-center text-center animate-fade-in"
      >
        <div class="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center mb-3">
          <ion-icon :icon="svg(mdiHandshake)" class="text-2xl" />
        </div>

        <h3 class="cabin-sketch-regular text-2xl font-black text-black">
          Why invites?
        </h3>

        <div class="mt-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-secondary">
          <span>Invite</span>
          <span>→</span>
          <span>24h Trial</span>
          <span>→</span>
          <span>Mates</span>
        </div>

        <p class="mt-4 text-xl text-black/80 cabin-sketch-regular">
          The goal is to make real friendships on SketchMate. It's not a race, we can only have so many important people
          in our lives. The 24-hour trial lets both people see if it's a good fit before becoming Mates.
        </p>
      </div>

      <template v-else>
        <div v-if="showJourney" class="px-4 pt-1 pb-3 mb-1 border-b border-black/5">
          <RelationshipJourney :step="rel.step" :accent="effectiveAccent" />
        </div>

        <div class="relative px-4 pt-1 pb-5 flex flex-col items-center text-center">

          <template v-if="isIncomingInvite">
            <div class="relative mb-3.5">
              <img :src="partner?.img" class="w-16 h-16 rounded-2xl border-2 border-white shadow-sm object-cover"
                   alt="" />
              <div
                class="absolute -bottom-1.5 -right-1.5 bg-secondary rounded-full p-2 border border-white shadow-sm flex items-center justify-center">
                <ion-icon :icon="svg(mdiPalette)" class="text-xs text-white" />
              </div>
            </div>
            <h3 class="cabin-sketch-regular text-xl font-black text-black leading-tight">
              Sketch with {{ partner?.name }}?
            </h3>
            <p class="mt-1.5 text-xs text-black/70 uppercase tracking-wider">
              Starts a 24-hour trial to see if you vibe.
            </p>
            <div class="grid grid-cols-2 gap-3 mt-4 w-full max-w-[280px]">
              <ion-button fill="clear" class="text-black cursor-pointer" shape="round" @click="$emit('decline-invite')">
                Ignore
              </ion-button>
              <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('accept-invite')">
                Accept
              </ion-button>
            </div>
          </template>

          <template v-else-if="isOutgoingInvite">
            <div class="px-5 py-2.5 bg-black/5 rounded-full flex items-center gap-2.5">
              <div class="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
              <span class="text-xs text-black/70 uppercase tracking-widest">
              Waiting for {{ firstName }}
            </span>
            </div>
          </template>

          <template v-else-if="isMateProposalReceived">
            <div v-if="showUpgradePrompt" class="flex flex-col items-center w-full">
              <div
                class="w-12 h-12 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mb-3 text-2xl">
                <ion-icon :icon="svg(mdiStar)" />
              </div>
              <h3 class="cabin-sketch-regular text-lg font-black text-black">{{ partner?.name }} wants to be
                Mates!</h3>
              <p class="text-xs font-bold text-secondary uppercase tracking-wider mt-1.5 mb-4">
                Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
              </p>
              <div class="grid grid-cols-2 gap-3 w-full max-w-[260px]">
                <ion-button fill="clear" shape="round" class="cursor-pointer" @click="$emit('decline')">Decline</ion-button>
                <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('upgrade')">
                  <ion-icon :icon="svg(mdiStar)" slot="start" class="text-sm mr-1" />
                  Upgrade
                </ion-button>
              </div>
            </div>

            <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeart)" class="text-3xl text-black/20 mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">{{ partner?.name }} wants to be
                Mates!</h3>
              <p class="text-xs text-black/70 uppercase tracking-widest mt-1.5 mb-4">Max limit reached</p>
              <ion-button fill="clear" shape="round" class="cursor-pointer" @click="$emit('decline')">Decline</ion-button>
            </div>

            <div v-else class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeart)" class="text-4xl text-secondary mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">{{ partner?.name }} wants to be
                Mates!</h3>
              <div class="grid grid-cols-2 gap-3 w-full max-w-[260px] mt-2">
                <ion-button fill="clear" color="dark" shape="round" class="cursor-pointer" @click="$emit('decline')">Decline</ion-button>
                <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('accept')">Accept</ion-button>
              </div>
            </div>
          </template>

          <template v-else-if="isMateProposalSent">
            <div class="px-5 py-2.5 bg-black/5 rounded-full flex items-center gap-2.5 mb-3">
              <ion-icon :icon="svg(mdiClockOutline)" class="text-sm text-black/30" />
              <span class="text-xs text-black/70 uppercase tracking-widest">Waiting for {{ firstName }}</span>
            </div>
            <ion-button fill="clear" shape="round" color="danger" class="cursor-pointer" @click="$emit('cancel-mate')">
              Cancel
            </ion-button>
          </template>

          <template v-else-if="isTrialExpired">
            <div v-if="showUpgradePrompt" class="flex flex-col items-center w-full">
              <div
                class="w-12 h-12 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mb-3 text-2xl">
                <ion-icon :icon="svg(mdiStar)" />
              </div>
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Trial with {{ firstName }} ended</h3>
              <p class="text-xs font-bold text-secondary uppercase tracking-wider mt-1.5 mb-4">
                Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
              </p>
              <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('upgrade')">
                <ion-icon :icon="svg(mdiStar)" slot="start" class="text-sm mr-1" />
                Upgrade to Add
              </ion-button>
            </div>

            <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiLockOutline)" class="text-3xl text-black/30 mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Trial with {{ firstName }} ended</h3>
              <p class="text-xs text-black/70 uppercase tracking-widest mt-1.5">Maximum limits reached</p>
            </div>

            <div v-else class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeartPlusOutline)" class="text-4xl text-secondary mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Trial with {{ firstName }} ended</h3>
              <p class="text-xs text-black/70 uppercase tracking-wider mt-1.5 mb-5">Become Mates to stay connected.</p>
              <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('request')">
                Become Mates
              </ion-button>
            </div>
          </template>

          <template v-else-if="isTemporaryChat">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-4xl text-secondary mb-3" />
            <p class="text-sm mb-3 font-black text-black/80 uppercase tracking-wider max-w-[240px]">
              You're in a 24-hour Trial.
            </p>

            <ion-button
              v-if="showUpgradePrompt"
              fill="clear"
              shape="round"
              color="secondary"
              class="cursor-pointer"
              @click="$emit('upgrade')"
            >
              <ion-icon :icon="svg(mdiStar)" slot="start" class="text-sm mr-1" />
              Upgrade to Add ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
            </ion-button>
            <span v-else-if="showProLimitReached"
                  class="mt-2 text-xs uppercase tracking-widest text-black/70">
            Mate limit reached
          </span>
            <ion-button
              v-else
              color="secondary"
              shape="round"
              class="cursor-pointer"
              @click="$emit('request')"
            >
              <ion-icon :icon="svg(mdiHeart)" slot="start" class="text-sm mr-1" />
              Become Mates
            </ion-button>
          </template>

          <template v-else-if="isExpired">
            <div v-if="isUnderCooldown" class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiClockOutline)" class="text-3xl text-black/20 mb-2" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Cooling down…</h3>
              <p class="text-xs font-black text-secondary uppercase tracking-widest mt-1.5">Available
                {{ formattedCooldown }}</p>
            </div>

            <div v-else-if="showUpgradePrompt" class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeartBroken)" class="text-3xl text-black/30 mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Connection ended</h3>
              <p class="text-xs font-bold text-secondary uppercase tracking-wider mt-1.5 mb-4">
                Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
              </p>
              <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('upgrade')">
                <ion-icon :icon="svg(mdiStar)" slot="start" class="text-sm mr-1" />
                Upgrade
              </ion-button>
            </div>

            <div v-else-if="showProLimitReached" class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeartBroken)" class="text-3xl text-black/30 mb-2" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Connection ended</h3>
              <p class="text-xs text-black/70 uppercase tracking-widest mt-1.5">Maximum limit reached</p>
            </div>

            <div v-else class="flex flex-col items-center w-full">
              <ion-icon :icon="svg(mdiHeartBroken)" class="text-3xl text-black/30 mb-3" />
              <h3 class="cabin-sketch-regular text-lg font-black text-black">Connection ended</h3>
              <p class="text-xs text-black/70 uppercase tracking-wider mt-1.5 mb-5">Start fresh with a new invite?</p>
              <ion-button color="secondary" shape="round" class="cursor-pointer" @click="$emit('request')">
                Send New Invite
              </ion-button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiHeart,
	mdiHeartBroken,
	mdiHeartPlusOutline,
	mdiClockOutline,
	mdiLockOutline,
	mdiPalette,
	mdiStar,
	mdiHandshake,
	mdiInformationOutline,
	mdiMinus,
	mdiClose,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useQuotaStore } from "@/store/quota.store";
import { resolveRelationship } from "@/config/relationship.config";
import RelationshipJourney from "./RelationshipJourney.vue";

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
const chatWidget = useChatWidgetStore();

const showInfo = ref(false);

const rel = computed(() =>
	resolveRelationship({
		status: props.chat?.status,
		initiatorId: props.chat?.initiator_id,
		currentUserId: props.currentUserId,
		trialExpiresAt: props.chat?.trial_expires_at,
	}),
);

const firstName = computed(() => props.partner?.name?.split(" ")[0] || "them");

/* --- Original state flags (Preserved 1:1) --- */
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

const isExpired = computed(() => props.chat?.status === "expired");

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

/* --- Presentation Contexts --- */
const showJourney = computed(() => rel.value.step >= 1 && !isExpired.value);

const effectiveAccent = computed(() => rel.value.accent);

const containerClass = computed(() =>
	rel.value.actionable ? "border-secondary/30" : "border-primary/15",
);

/* --- Minimize --- */
const isMinimizable = computed(
	() =>
		(isTemporaryChat.value && !isTrialExpired.value) ||
		isOutgoingInvite.value ||
		isMateProposalSent.value,
);
const isMinimized = computed(
	() => isMinimizable.value && chatWidget.isBannerMinimized(props.chat?._id),
);
const toggleMinimized = () => {
	if (props.chat?._id) chatWidget.toggleBannerMinimized(props.chat._id);
};
const miniLabel = computed(() => {
	if (isMateProposalSent.value) return `Mate request sent`;
	if (isOutgoingInvite.value) return `Invite sent to ${firstName.value}`;
	return `24-hour trial with ${firstName.value}`;
});
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