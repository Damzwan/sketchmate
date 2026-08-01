<!-- components/chat/ConversationItem.vue -->
<template>
  <div
    @click="$emit('open', chat._id)"
    class="conversation-row group relative w-full flex items-center gap-3 p-3 rounded-[1.6rem] border cursor-pointer overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97]"
    :class="cardClass"
    :style="showTheme ? cardStyle : {}"
  >
    <!-- Soft accent glow, only when this card wants attention -->
    <div
      v-if="rel.actionable && !isBlocked"
      class="absolute -left-6 -bottom-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
      :class="accent.glow"
    ></div>

    <!-- Partner's profile surface on resting mate/active rows: their theme cardBg
         is painted on the card root, their effect and world layered over it.
         The world runs in `mini` + `static-mode` — a frozen frame, not a live
         lottie per list row. -->
    <div v-if="showTheme" class="absolute inset-0 z-0 pointer-events-none">
      <ProfileWorld
        :world-id="partnerCustomization.worldId"
        :accent="theme.accentColor"
        static-mode
        mini
        contained
        radius-class="rounded-[1.6rem]"
      />
      <!-- Effects belong above worlds. Rendering Space after crumpled paper
           hid the paper texture and made the selected theme/effect disappear. -->
      <ProfileEffect
        :effect-id="partnerCustomization.effectId"
        radius-class="rounded-[1.6rem]"
        static-effect
        contained
      />
    </div>

    <!-- Avatar + single contextual badge -->
    <div class="relative z-10 shrink-0">
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
        ?
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
    <div class="relative z-10 flex-1 min-w-0">
      <!-- Row 1 — name · status chip · time -->
      <div class="flex items-center gap-1.5 min-w-0">
        <span
          class="text-[15px] leading-none font-black truncate tracking-tight"
          :class="[nameClass, showTheme ? fontEffectClass : '', themeTextOnDark ? 'on-world' : '']"
          :style="showTheme ? { color: themedNameColor, fontFamily: resolvedFontFamily } : {}"
        >
          {{ partner?.name || 'Unknown User' }}
        </span>

        <span
          v-if="showChip"
          class="shrink-0 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider whitespace-nowrap"
          :class="chipClass"
          :style="chipStyle"
        >
          {{ chipText }}
        </span>

        <span
          class="ml-auto shrink-0 text-[11px] leading-none font-black uppercase tracking-wide whitespace-nowrap mt-0.5"
          :style="timestampStyle"
        >
          {{ rel.kind === 'live_invite' ? 'NOW' : formattedTime }}
        </span>
      </div>

      <!-- Row 2 — status line · unread -->
      <div class="flex items-center gap-1.5 mt-1.5">
        <p
          class="flex-1 min-w-0 text-[13px] truncate cabin-sketch-regular tracking-wide leading-none"
          :class="[statusClass, themeTextOnDark ? 'on-world' : '']"
          :style="showTheme && !isTyping ? { color: themedDescColor } : {}"
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

      <!-- Row 3 — the journey rail, only while a relationship is in flight.
           RelationshipJourney's `compact` mode renders exactly this markup;
           it was duplicated here byte for byte, so the two drifted whenever
           only one got touched. -->
      <RelationshipJourney
        v-if="showJourney"
        class="mt-2.5 pr-1"
        :step="rel.step"
        :accent="rel.accent"
        :dark="onDarkSurface"
        :name-color="themedNameColor"
        :desc-color="themedDescColor"
        compact
      />
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
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import {
	resolveRelationship,
	RELATIONSHIP_ACCENT,
} from "@/config/relationship.config";
import RelationshipJourney from "./RelationshipJourney.vue";
import {
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveWorld,
} from "@/config/profile_options.config";
import { conversationActivityAt } from "@/helper/chat.helper";

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

/* --- partner customization (theme colour + ambient effect) --- */
const partnerCustomization = computed(() =>
	hydrateCustomization(partner.value?.customization),
);
const theme = computed(() => resolveTheme(partnerCustomization.value.themeId));
const resolvedFontFamily = computed(() =>
	resolveFontFamily(partnerCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(partnerCustomization.value.fontEffectId),
);
// Every live row uses the same customization surface as the toolbar and toast.
// Relationship urgency is still carried by the chip, border and journey rail;
// dropping the theme on actionable rows made customized paper appear broken.
const showTheme = computed(
	() => !isBlocked.value && !isExpired.value,
);
// Paint the partner's theme surface (cardBg, often a gradient) + themed border,
// overriding the default white resting-card look. The world layer sits on top
// of it — see `onDarkWorld` for why that matters to the text colours.
const cardStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: theme.value.cardBorderColor,
}));

const activeWorld = computed(() =>
	resolveWorld(partnerCustomization.value.worldId),
);
const palette = computed(() =>
	resolveReadableCustomizationPalette(theme.value, activeWorld.value),
);
const onDarkSurface = computed(
	() => showTheme.value && palette.value.isDark,
);
const themeTextOnDark = computed(() => showTheme.value && palette.value.isDark);
const themedNameColor = computed(() => palette.value.name);
const themedDescColor = computed(() => palette.value.desc);
// Time is tiny utility text, not part of the user's font/theme treatment.
// Keep it predictably black on light cards and white on every dark surface.
const timestampStyle = computed(() => ({
	color: showTheme.value ? palette.value.utility : "#18181b",
	opacity: onDarkSurface.value ? 0.9 : 0.68,
	textShadow: onDarkSurface.value ? "0 1px 3px rgba(0, 0, 0, 0.65)" : "none",
}));

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
const activityAt = computed(() => conversationActivityAt(props.chat));
const formattedTime = computed(() =>
	activityAt.value ? dayjs(activityAt.value).fromNow(true) : "",
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
// Kinds where there is no thread to preview yet, or where the hint IS the
// point. Everything else shows the actual last message.
//
// This used to be an allow-list of just `active` and `mate`, which meant a
// running trial — a real conversation people are actively using — permanently
// displayed "24-hour trial — see if you vibe" instead of what was said. The
// state is already carried three other ways on this row (the chip, the accent,
// the journey rail), so the message line was spending itself on a fourth copy
// of information the user already had.
const HINT_ONLY_KINDS = ["incoming_invite", "outgoing_invite", "live_invite"];

const showsMessage = computed(
	() =>
		!isBlocked.value &&
		!isExpired.value &&
		!HINT_ONLY_KINDS.includes(rel.value.kind) &&
		!!props.chat.last_message,
);

const statusLine = computed(() => {
	if (isBlocked.value) return "User is blocked";
	if (props.isTyping && !isExpired.value) return "typing…";
	if (isExpired.value) return deleteCountdown.value;
	// No messages exchanged yet → the hint is more useful than "Started a
	// conversation".
	if (!showsMessage.value) return rel.value.hint || lastMessage.value;
	return lastMessage.value;
});

const showChip = computed(
	() => isBlocked.value || !["active", "mate"].includes(rel.value.kind),
);
const chipText = computed(() =>
	isBlocked.value ? "Blocked" : rel.value.label,
);

/* --- single avatar badge: priority order live > blocked > expired > mate-request --- */
const avatarBadge = computed<{ bg: string; icon?: string } | null>(() => {
	if (rel.value.kind === "live_invite")
		return { bg: "bg-secondary animate-bounce", icon: svg(mdiPalette) };
	if (isBlocked.value) return { bg: "bg-zinc-600", icon: svg(mdiAccountOff) };
	if (isExpired.value)
		return { bg: "bg-zinc-400", icon: svg(mdiTrashCanOutline) };
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

const chipClass = computed(() => {
	if (isBlocked.value) return "bg-zinc-500 text-white";
	if (rel.value.kind === "trial_expired") return "bg-amber-300/35 text-black";
	return accent.value.chip;
});

// Do not let an inherited/customized foreground turn the light amber
// "Trial ended" pill white.
const chipStyle = computed(() =>
	rel.value.kind === "trial_expired" ? { color: "#18181b" } : {},
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
	// A real message reads like a message — including the unread bolding —
	// whatever stage the relationship is at. Previously only `active`/`mate`
	// qualified, so an unread message during a trial rendered flat grey.
	if (showsMessage.value)
		return unreadCount.value > 0 ? "font-black text-black" : "text-black/60";
	return "text-black/60";
});
</script>

<style scoped>
.conversation-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 76px;
}

/* Legibility over a dark world, matching ChatRelationshipStrip: the theme's
   *Dark colours carry the contrast, this only holds the glyph edges against a
   busy starfield. No plate behind the text — that would hide the world. */
.on-world {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

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
