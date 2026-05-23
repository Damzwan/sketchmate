<!-- components/chat/ConversationItem.vue -->
<template>
  <div
    @click="$emit('open', chat._id)"
    class="group relative w-full flex items-center p-3 backdrop-blur-md rounded-[1.5rem] border transition-all cursor-pointer overflow-hidden active:scale-[0.98]"
    :class="[
      isUserBlocked
        ? 'bg-zinc-200/40 border-zinc-300/40 opacity-75'
        : isLiveInvite
        ? 'bg-secondary/10 border-secondary shadow-md ring-2 ring-secondary/30'
        : (isIncomingRequest || isMateProposalReceived)
        ? 'bg-secondary/5 border-secondary/40 shadow-sm ring-1 ring-secondary/20'
        : (isTemporary || isMateProposalSent || isOutgoingPending)
        ? 'bg-white/60 border-secondary/10 shadow-sm'
        : isExpired
        ? 'bg-zinc-100/50 border-zinc-300/50 hover:bg-zinc-100/80'
        : 'bg-white/40 border-white/60 shadow-sm hover:bg-white/60'
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
        :class="{
          'grayscale opacity-50': isUserBlocked,
          'grayscale-[0.4] opacity-80': !isUserBlocked && isPending,
          'grayscale-[0.6] contrast-[0.9]': !isUserBlocked && isExpired
        }"
      />
      <!-- Fallback also changed to rounded-full and w-12 h-12 to match -->
      <span v-else class="flex items-center justify-center w-12 h-12 bg-secondary/10 text-lg font-bold text-secondary rounded-full border-2 border-white">
        {{ partner?.name?.charAt(0) || '?' }}
      </span>

      <!-- Status Indicators (Position adjusted slightly to sit flush on a circle) -->
      <div
        v-if="isOnline && !isRelationshipInactive && !isUserBlocked && !isLiveInvite"
        class="absolute -bottom-0.5 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full z-20"
      ></div>

      <!-- Live Badge -->
      <div
        v-if="isLiveInvite"
        class="absolute -bottom-1 -right-1 w-5 h-5 bg-secondary border-2 border-white rounded-full z-20 flex items-center justify-center shadow-md animate-pulse"
      >
        <div class="w-2 h-2 bg-white rounded-full"></div>
      </div>

      <!-- Blocked Badge -->
      <div
        v-else-if="isUserBlocked"
        class="absolute -bottom-0.5 right-0 w-5 h-5 bg-zinc-600 border-2 border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiAccountOff)" class="text-[10px] text-white" />
      </div>

      <!-- Trash Badge for Expired -->
      <div
        v-else-if="isExpired"
        class="absolute -bottom-0.5 right-0 w-5 h-5 bg-zinc-400 border-2 border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiTrashCanOutline)" class="text-[10px] text-white" />
      </div>

      <!-- Heart badge for Mate Proposals -->
      <div
        v-else-if="isMatePending"
        class="absolute -bottom-0.5 right-0 w-5 h-5 bg-secondary border-2 border-white rounded-full z-20 flex items-center justify-center shadow-sm"
      >
        <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
      </div>
    </div>

    <!-- Content Section -->
    <div class="flex-1 min-w-0 ml-3.5 text-left">
      <div class="flex justify-between items-end mb-0.5">
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            class="text-base leading-none font-black truncate"
            :class="[
              (unreadCount > 0 || isIncomingRequest || isMateProposalReceived || isLiveInvite) ? 'text-black' : 'text-black/80',
              { 'text-zinc-500': isExpired || isUserBlocked }
            ]"
          >
            {{ partner?.name || 'Unknown User' }}
          </span>

          <!-- Priority Badges -->
          <span v-if="isLiveInvite" class="px-1.5 py-0.5 rounded-md bg-secondary text-[8px] font-black text-white uppercase tracking-tighter shadow-sm animate-pulse">
            LIVE
          </span>
          <span v-else-if="isUserBlocked" class="px-1.5 py-0.5 rounded-md bg-zinc-500 text-[7px] font-black text-white uppercase tracking-tighter">
            Blocked
          </span>
          <span v-else-if="isMatePending" class="px-1.5 py-0.5 rounded-md bg-secondary text-[7px] font-black text-white uppercase tracking-tighter animate-pulse">
            Proposal
          </span>
          <span v-else-if="isTemporary" class="px-1.5 py-0.5 rounded-md bg-secondary/10 text-[8px] font-black text-secondary uppercase tracking-tighter">
            Trial
          </span>
          <span v-else-if="isExpired" class="px-1.5 py-0.5 rounded-md bg-zinc-200 text-[7px] font-black text-zinc-500 uppercase tracking-tighter">
            Archive
          </span>
        </div>
        <span class="text-[9px] font-black uppercase whitespace-nowrap opacity-30">
          {{ isLiveInvite ? 'NOW' : formattedTime }}
        </span>
      </div>

      <div class="flex items-center justify-between">
        <p
          class="text-[13px] truncate cabin-sketch-regular tracking-wide pr-2"
          :class="(unreadCount > 0 || isIncomingRequest || isMateProposalReceived || isLiveInvite) ? 'font-black text-black' : 'font-bold text-black/60'"
        >
          <!-- Priority Message Logic -->
          <span v-if="isLiveInvite" class="text-secondary italic font-black">Live drawing invite! Tap to join 🎨</span>
          <span v-else-if="isUserBlocked" class="text-zinc-500 italic">User is blocked</span>
          <span v-else-if="isTyping" class="text-secondary animate-pulse italic">typing...</span>
          <template v-else>
            <span v-if="isExpired" class="text-zinc-400 italic">{{ deleteCountdown }}</span>
            <span v-else-if="isMateProposalReceived" class="text-secondary italic">Sent you a Mate proposal!</span>
            <span v-else-if="isMateProposalSent" class="opacity-50">Mate proposal pending...</span>
            <span v-else-if="isIncomingRequest" class="text-secondary italic">Wants to sketch with you!</span>
            <span v-else-if="isOutgoingPending" class="opacity-50">Invitation sent...</span>
            <span v-else-if="isTrialExpired" class="text-red-400 italic">Trial ended. Become Mates?</span>
            <span v-else>{{ lastMessage }}</span>
          </template>
        </p>

        <!-- Unread Badge -->
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <div
            v-if="unreadCount > 0 && !isUserBlocked && !isLiveInvite"
            class="min-w-[1.25rem] h-5 px-1.5 bg-red-500 rounded-full flex items-center justify-center shadow-md animate-bounce-in"
          >
            <span class="text-[10px] font-black text-white leading-none">{{ unreadCount }}</span>
          </div>
          <ion-icon v-if="isExpired || isUserBlocked" :icon="svg(mdiChevronRight)" class="text-zinc-300 text-lg transition-transform group-hover:translate-x-0.5" />
          <ion-icon v-if="isTrialExpired && !isMatePending && !isExpired && !isUserBlocked" :icon="svg(mdiLockOutline)" class="text-black/20 text-xs" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
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

	if (msg.content) {
		return msg.content;
	}

	if (msg.shared_post_id) {
		return "Shared a post";
	}

	return "Sent a sketch";
});

// Blocked Logic using the function from friendStore
const isUserBlocked = computed(() => {
	if (!partner.value) return false;
	return friendStore.isBlocked(partner.value._id);
});

// Custom flag for Faux Invitations - cast to string to bypass type restriction
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
	if (!props.chat.deleted_at) return "History saved (will be deleted soon)";
	return `History deletes in ${dayjs(props.chat.deleted_at).fromNow(true)}`;
});

const unreadCount = computed(
	() => props.chat.unread_counts?.[props.currentUserId] || 0,
);
const formattedTime = computed(() =>
	props.chat.updatedAt ? dayjs(props.chat.updatedAt).fromNow(true) : "",
);
</script>