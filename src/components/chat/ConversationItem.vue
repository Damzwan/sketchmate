<!-- components/chat/ConversationItem.vue -->
<template>
  <div
    @click="$emit('open', chat._id)"
    class="group relative w-full flex items-center gap-3 p-3 rounded-[1.6rem] border cursor-pointer overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97]"
    :class="cardClass"
  >
    <!-- Soft accent glow, only when this card wants attention -->
    <div
      v-if="rel.actionable && !isBlocked"
      class="absolute -left-6 -bottom-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
      :class="accent.glow"
    ></div>

    <!-- Avatar + single contextual badge -->
    <div class="relative shrink-0">
      <UserAvatar
        v-if="partner"
        :user="partner"
        static
        :customization="partner.customization"
        size="sm"
        class="transition-transform duration-300 group-hover:scale-105"
        :class="avatarFilter"
      />
      <span
        v-else
        class="flex items-center justify-center w-11 h-11 bg-secondary/10 text-base font-black text-secondary rounded-full border border-primary/40"
      >
        {{ partner?.name?.charAt(0) || '?' }}
      </span>

      <!-- One badge to rule them all: the most important state wins -->
      <div
        v-if="avatarBadge"
        class="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full border-2 border-white flex items-center justify-center shadow-sm z-20"
        :class="avatarBadge.bg"
      >
        <ion-icon v-if="avatarBadge.icon" :icon="avatarBadge.icon" class="text-[8px] text-white" />
        <div v-else class="w-1.5 h-1.5 bg-white rounded-full"></div>
      </div>
      <div
        v-else-if="showOnlinePip"
        class="absolute -bottom-0.5 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-20 shadow-sm"
      ></div>
    </div>

    <!-- Body -->
    <div class="flex-1 min-w-0">
      <!-- Row 1 — name · status chip · time -->
      <div class="flex items-center gap-1.5 min-w-0">
        <span
          class="text-[14px] leading-none font-black truncate tracking-tight"
          :class="nameClass"
        >
          {{ partner?.name || 'Unknown User' }}
        </span>

        <span
          v-if="showChip"
          class="shrink-0 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider whitespace-nowrap"
          :class="chipClass"
        >
          {{ chipText }}
        </span>

        <span class="ml-auto shrink-0 text-[8px] uppercase tracking-wider opacity-50 whitespace-nowrap mt-0.5">
          {{ rel.kind === 'live_invite' ? 'NOW' : formattedTime }}
        </span>
      </div>

      <!-- Row 2 — status line · unread -->
      <div class="flex items-center gap-1.5 mt-1.5">
        <p
          class="flex-1 min-w-0 text-[12px] truncate cabin-sketch-regular tracking-wide leading-none"
          :class="statusClass"
        >
          {{ statusLine }}
        </p>

        <div
          v-if="unreadCount > 0 && !isBlocked && rel.kind !== 'live_invite'"
          class="shrink-0 min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center shadow-sm animate-bounce-in"
        >
          <span class="text-[8px] font-black text-white leading-none mb-[0.5px]">{{ unreadCount }}</span>
        </div>
        <ion-icon
          v-else-if="isBlocked || isExpired"
          :icon="svg(mdiChevronRight)"
          class="shrink-0 text-black/20 text-base transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>

      <!-- Row 3 — the journey rail, only while a relationship is in flight -->
      <div v-if="showJourney" class="flex items-center gap-1.5 mt-2.5 pr-1">
        <template v-for="(stepDef, i) in JOURNEY_STEPS" :key="stepDef.label">
          <div class="flex items-center gap-1 shrink-0">
            <div class="rounded-full transition-all duration-300" :class="dotClass(i)"></div>
            <span class="text-[7px] font-black uppercase tracking-wider transition-colors" :class="stepLabelClass(i)">
              {{ stepDef.label }}
            </span>
          </div>
          <div
            v-if="i < JOURNEY_STEPS.length - 1"
            class="flex-1 h-px rounded-full transition-colors"
            :class="i < activeIdx ? 'bg-black/20' : 'bg-black/10'"
          ></div>
        </template>
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
  mdiPalette,
  mdiTrashCanOutline,
} from "@mdi/js";
import { IonIcon } from "@ionic/vue";
import { svg } from "@/helper/general.helper";
import { PopulatedConversation } from "@/types/server.types";
import { useFriendStore } from "@/store/friend.store";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import {
  resolveRelationship,
  JOURNEY_STEPS,
  RELATIONSHIP_ACCENT,
} from "@/config/relationship.config";

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

const isBlocked = computed(() =>
  partner.value ? friendStore.isBlocked(partner.value._id) : false,
);
const isExpired = computed(() => props.chat.status === "expired");

/* --- the single resolved relationship state everything keys off --- */
const rel = computed(() =>
  resolveRelationship({
    status: props.chat.status as string,
    initiatorId: props.chat.initiator_id,
    currentUserId: props.currentUserId,
    trialExpiresAt: props.chat.trial_expires_at,
  }),
);
const accent = computed(() => RELATIONSHIP_ACCENT[rel.value.accent]);
const activeIdx = computed(() => rel.value.step - 1);

/* --- derived display bits --- */
const lastMessage = computed(() => {
  const msg = props.chat.last_message;
  if (!msg) return "Started a conversation";
  if (msg.type === "system") {
    if (msg.system_kind === "balloon_match")
      return `${partner.value?.name || "Someone"} caught a balloon 🎈`;
    return "New activity";
  }
  if (msg.content) return msg.content;
  if (msg.shared_post_id) return "Shared a post";
  return "Sent a sketch";
});

const deleteCountdown = computed(() =>
  props.chat.deleted_at
    ? `Deletes ${dayjs(props.chat.deleted_at).fromNow()}`
    : "History saved",
);

const unreadCount = computed(
  () => props.chat.unread_counts?.[props.currentUserId] || 0,
);
const formattedTime = computed(() =>
  props.chat.updatedAt ? dayjs(props.chat.updatedAt).fromNow(true) : "",
);

const showOnlinePip = computed(
  () =>
    props.isOnline &&
    !isBlocked.value &&
    !isExpired.value &&
    ["active", "mate", "trial"].includes(rel.value.kind),
);

const showJourney = computed(
  () =>
    !isBlocked.value &&
    [
      "incoming_invite",
      "outgoing_invite",
      "trial",
      "trial_expired",
      "incoming_mate",
      "outgoing_mate",
    ].includes(rel.value.kind),
);

/* --- text --- */
const statusLine = computed(() => {
  if (isBlocked.value) return "User is blocked";
  if (props.isTyping && !isExpired.value) return "typing…";
  if (isExpired.value) return deleteCountdown.value;
  if (rel.value.kind === "active" || rel.value.kind === "mate")
    return lastMessage.value;
  return rel.value.hint;
});

const showChip = computed(
  () => isBlocked.value || !["active", "mate"].includes(rel.value.kind),
);
const chipText = computed(() => (isBlocked.value ? "Blocked" : rel.value.label));

/* --- single avatar badge: priority order live > blocked > expired > mate-request --- */
const avatarBadge = computed<{ bg: string; icon?: string } | null>(() => {
  if (rel.value.kind === "live_invite")
    return { bg: "bg-secondary animate-bounce", icon: svg(mdiPalette) };
  if (isBlocked.value) return { bg: "bg-zinc-600", icon: svg(mdiAccountOff) };
  if (isExpired.value) return { bg: "bg-zinc-400", icon: svg(mdiTrashCanOutline) };
  if (rel.value.kind === "incoming_mate" || rel.value.kind === "outgoing_mate")
    return { bg: "bg-secondary", icon: svg(mdiHeart) };
  return null;
});

/* --- class bundles --- */
const cardClass = computed(() => {
  if (isBlocked.value) return "bg-primary/5 border-primary/20 opacity-60";
  if (rel.value.kind === "live_invite")
    return "bg-secondary/10 border-secondary shadow-sm ring-2 ring-secondary/20 animate-pulse-subtle";
  if (isExpired.value)
    return "bg-black/5 border-black/5 opacity-50 hover:opacity-80";
  if (rel.value.actionable)
    return rel.value.accent === "amber"
      ? "bg-amber-400/5 border-amber-400/40 shadow-sm"
      : "bg-secondary/5 border-secondary/40 shadow-sm";
  return "bg-white border-primary/30 shadow-sm hover:border-primary";
});

const avatarFilter = computed(() => ({
  "grayscale opacity-40": isBlocked.value,
  "grayscale-[0.5] contrast-[0.9]": !isBlocked.value && isExpired.value,
  "grayscale-[0.3] opacity-75":
    !isBlocked.value && rel.value.kind === "outgoing_invite",
}));

const nameClass = computed(() => {
  if (isBlocked.value || isExpired.value) return "text-black/50";
  if (
    rel.value.actionable ||
    unreadCount.value > 0 ||
    rel.value.kind === "live_invite"
  )
    return "text-black";
  return "text-black/80";
});

const chipClass = computed(() =>
  isBlocked.value ? "bg-zinc-500 text-white" : accent.value.chip,
);

const statusClass = computed(() => {
  if (isBlocked.value) return "text-black/50 italic";
  if (props.isTyping && !isExpired.value)
    return "text-secondary animate-pulse italic font-bold";
  if (isExpired.value) return "text-black/50 italic";
  if (rel.value.actionable)
    return rel.value.accent === "amber"
      ? "text-amber-700 font-black italic"
      : "text-secondary font-black italic";
  if (rel.value.kind === "active" || rel.value.kind === "mate")
    return unreadCount.value > 0
      ? "font-black text-black"
      : "text-black/60";
  return "text-black/60";
});

/* --- journey rail per-step styling --- */
const dotClass = (i: number) => {
  if (i === activeIdx.value) return `w-2 h-2 ${accent.value.dot} shadow-sm`;
  if (i < activeIdx.value) return "w-1.5 h-1.5 bg-black/25";
  return "w-1.5 h-1.5 bg-black/10";
};
const stepLabelClass = (i: number) => {
  if (i === activeIdx.value) return accent.value.text;
  if (i < activeIdx.value) return "text-black/35";
  return "text-black/20";
};
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