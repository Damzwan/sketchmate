<!-- components/chat/ConversationItem.vue -->
<template>
  <div
    @click="$emit('open', chat._id)"
    class="group relative w-full flex items-center p-3.5 rounded-[1.75rem] border transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer overflow-hidden active:scale-[0.97]"
    :class="[
      isUserBlocked
        ? 'bg-primary/5 border-primary/20 opacity-60'
        : isLiveInvite
        ? 'bg-secondary/10 border-secondary shadow-sm ring-2 ring-secondary/20 animate-pulse-subtle'
        : (isIncomingRequest || isMateProposalReceived)
        ? 'bg-secondary/5 border-secondary/40 shadow-sm'
        : (isTemporary || isMateProposalSent || isOutgoingPending)
        ? 'bg-white/80 border-primary/40 shadow-sm'
        : isExpired
        ? 'bg-black/5 border-black/5 opacity-50 hover:opacity-80'
        : 'bg-white border-primary/30 shadow-sm hover:border-primary'
    ]"
  >
    <!-- Avatar Section -->
    <div class="relative flex-shrink-0 flex items-center justify-center">
      <UserAvatar
        v-if="partner"
        :user="partner"
        static
        :customization="partner.customization"
        size="sm"
        class=" transition-transform duration-300 group-hover:scale-105"
        :class="{
          'grayscale opacity-40': isUserBlocked,
          'grayscale-[0.3] opacity-75': !isUserBlocked && isPending,
          'grayscale-[0.5] contrast-[0.9]': !isUserBlocked && isExpired
        }"
      />

      <span v-else class="flex items-center justify-center w-11 h-11 bg-secondary/10 text-base font-black text-secondary rounded-full border border-primary/40">
        {{ partner?.name?.charAt(0) || '?' }}
      </span>

      <!-- Active Online Status Indicator Pip -->
      <div
        v-if="isOnline && !isRelationshipInactive && !isUserBlocked && !isLiveInvite"
        class="absolute -bottom-0.5 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-20 shadow-sm"
      ></div>

      <!-- Live Drawing Pulse Badge -->
      <div
        v-if="isLiveInvite"
        class="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-secondary border-2 border-white rounded-full z-20 flex items-center justify-center shadow-sm animate-bounce"
      >
        <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
      </div>

      <!-- User Blocked Badge Bubble -->
      <div
        v-else-if="isUserBlocked"
        class="absolute -bottom-0.5 right-0 w-4.5 h-4.5 bg-zinc-600 border border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiAccountOff)" class="text-[8px] text-white" />
      </div>

      <!-- Archive / Trash Badge indicator -->
      <div
        v-else-if="isExpired"
        class="absolute -bottom-0.5 right-0 w-4.5 h-4.5 bg-zinc-400 border border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiTrashCanOutline)" class="text-[8px] text-white" />
      </div>

      <!-- Relationship Mate Proposal Badge -->
      <div
        v-else-if="isMatePending"
        class="absolute -bottom-0.5 right-0 w-4.5 h-4.5 bg-secondary border border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiHeart)" class="text-[8px] text-white" />
      </div>
    </div>

    <!-- Info Details Text Column Block -->
    <div class="flex-1 min-w-0 ml-3 text-left">
      <div class="flex justify-between items-center mb-0.5">
        <div class="flex items-center gap-1.5 min-w-0 leading-none">
          <span
            class="text-[14px] leading-none font-black truncate tracking-tight"
            :class="[
              (unreadCount > 0 || isIncomingRequest || isMateProposalReceived || isLiveInvite) ? 'text-black' : 'text-black/80',
              { 'text-black/40 font-bold': isExpired || isUserBlocked }
            ]"
          >
            {{ partner?.name || 'Unknown User' }}
          </span>

          <!-- Explicit Text Relationship Badges -->
          <span v-if="isLiveInvite" class="px-1.5 py-0.5 rounded-md bg-secondary text-[7px] font-black text-white uppercase tracking-wider shadow-sm animate-pulse">
            LIVE
          </span>
          <span v-else-if="isUserBlocked" class="px-1.5 py-0.5 rounded-md bg-zinc-500 text-[6px] font-black text-white uppercase tracking-wider">
            Blocked
          </span>
          <span v-else-if="isMatePending" class="px-1.5 py-0.5 rounded-md bg-secondary text-[6px] font-black text-white uppercase tracking-wider">
            Proposal
          </span>
          <span v-else-if="isTemporary" class="px-1.5 py-0.5 rounded-md bg-secondary/10 text-[7px] font-black text-secondary uppercase tracking-wider">
            Trial
          </span>
          <span v-else-if="isExpired" class="px-1.5 py-0.5 rounded-md bg-black/10 text-[6px] font-black text-black/40 uppercase tracking-wider">
            Archive
          </span>
        </div>

        <span class="text-[8px] font-black uppercase tracking-wider whitespace-nowrap opacity-30 mt-0.5">
          {{ isLiveInvite ? 'NOW' : formattedTime }}
        </span>
      </div>

      <div class="flex items-center justify-between leading-none mt-1">
        <p
          class="text-[12px] truncate cabin-sketch-regular tracking-wide pr-2 leading-none"
          :class="(unreadCount > 0 || isIncomingRequest || isMateProposalReceived || isLiveInvite) ? 'font-black text-black' : 'font-bold text-black/50'"
        >
          <!-- Context Message Switch Hierarchy -->
          <span v-if="isLiveInvite" class="text-secondary italic font-black">Live drawing invite! Tap to join 🎨</span>
          <span v-else-if="isUserBlocked" class="text-black/30 italic">User is blocked</span>
          <span v-else-if="isTyping" class="text-secondary animate-pulse italic">typing...</span>
          <template v-else>
            <span v-if="isExpired" class="text-black/40 italic">{{ deleteCountdown }}</span>
            <span v-else-if="isMateProposalReceived" class="text-secondary italic">Sent you a Mate proposal!</span>
            <span v-else-if="isMateProposalSent" class="opacity-40">Mate proposal pending...</span>
            <span v-else-if="isIncomingRequest" class="text-secondary italic">Wants to sketch with you!</span>
            <span v-else-if="isOutgoingPending" class="opacity-40">Invitation sent...</span>
            <span v-else-if="isTrialExpired" class="text-red-500 font-bold italic">Trial ended. Become Mates?</span>
            <span v-else>{{ lastMessage }}</span>
          </template>
        </p>

        <!-- Unread Badge Layout Trigger Dock -->
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-1.5">
          <div
            v-if="unreadCount > 0 && !isUserBlocked && !isLiveInvite"
            class="min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center shadow-sm animate-bounce-in"
          >
            <span class="text-[8px] font-black text-white leading-none mb-[0.5px]">{{ unreadCount }}</span>
          </div>

          <ion-icon v-if="isExpired || isUserBlocked" :icon="svg(mdiChevronRight)" class="text-black/20 text-base transition-transform duration-200 group-hover:translate-x-0.5" />
          <ion-icon v-if="isTrialExpired && !isMatePending && !isExpired && !isUserBlocked" :icon="svg(mdiLockOutline)" class="text-black/30 text-xs" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
	mdiAccountOff,
	mdiChevronRight,
	mdiHeart,
	mdiLockOutline,
	mdiTrashCanOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { PopulatedConversation } from "@/types/server.types";
import { useFriendStore } from "@/store/friend.store";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";

dayjs.extend(relativeTime);

const props = defineProps<{
	chat: PopulatedConversation;
	currentUserId: string;
	isOnline: boolean;
	isTyping: boolean;
}>();

defineEmits(["open"]);

const friendStore = useFriendStore();

const partner = computed(() =>
	props.chat.participants?.find((p: any) => p._id !== props.currentUserId),
);

const lastMessage = computed(() => {
	const msg = props.chat.last_message;
	if (!msg) return "Started a conversation";

	if (msg.type === "system") {
		if (msg.system_kind === "balloon_match") {
			return `${partner.value?.name || "Someone"} caught a balloon 🎈`;
		}
		return "New activity";
	}

	if (msg.content) return msg.content;
	if (msg.shared_post_id) return "Shared a post";
	return "Sent a sketch";
});

const isUserBlocked = computed(() => {
	if (!partner.value) return false;
	return friendStore.isBlocked(partner.value._id);
});

const isLiveInvite = computed(
	() => (props.chat.status as string) === "live_invite",
);

const isPending = computed(() =>
	["pending", "pending_invite"].includes(props.chat.status),
);
const isTemporary = computed(() => props.chat.status === "temporary");
const isMatePending = computed(() => props.chat.status === "pending_mate");
const isExpired = computed(() => props.chat.status === "expired");

const isIncomingRequest = computed(
	() => isPending.value && props.chat.initiator_id !== props.currentUserId,
);
const isOutgoingPending = computed(
	() => isPending.value && props.chat.initiator_id === props.currentUserId,
);
const isMateProposalReceived = computed(
	() => isMatePending.value && props.chat.initiator_id !== props.currentUserId,
);
const isMateProposalSent = computed(
	() => isMatePending.value && props.chat.initiator_id === props.currentUserId,
);

const isTrialExpired = computed(() => {
	if (!isTemporary.value || !props.chat.trial_expires_at) return false;
	return dayjs().isAfter(dayjs(props.chat.trial_expires_at));
});

const isRelationshipInactive = computed(
	() => isTrialExpired.value || isExpired.value,
);

const deleteCountdown = computed(() => {
	if (!props.chat.deleted_at) return "History saved";
	return `Deletes in ${dayjs(props.chat.deleted_at).fromNow(true)}`;
});

const unreadCount = computed(
	() => props.chat.unread_counts?.[props.currentUserId] || 0,
);
const formattedTime = computed(() =>
	props.chat.updatedAt ? dayjs(props.chat.updatedAt).fromNow(true) : "",
);
</script>

<style scoped>
.animate-bounce-in {
  animation: bounceIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes bounceIn {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes subtlePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.995); }
}
.animate-pulse-subtle {
  animation: subtlePulse 2s ease-in-out infinite;
}
</style>