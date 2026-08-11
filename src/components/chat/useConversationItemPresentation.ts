import {
	mdiAccountOff,
	mdiHeart,
	mdiPalette,
	mdiTrashCanOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { type ComputedRef, computed } from "vue";
import {
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
} from "@/config/profile_options.config";
import {
	RELATIONSHIP_ACCENT,
	resolveRelationship,
} from "@/config/relationship.config";
import { conversationActivityAt } from "@/helper/chat.helper";
import { svg } from "@/helper/general.helper";
import { safeText } from "@/helper/profanity.helper";
import { useFriendStore } from "@/store/friend.store";
import type { PopulatedConversation } from "@/types/server.types";

dayjs.extend(relativeTime);

interface ConversationItemProps {
	chat: PopulatedConversation;
	currentUserId: string;
	isOnline: boolean;
	isTyping: boolean;
}

export function useConversationItemPresentation(props: ConversationItemProps) {
	const friendStore = useFriendStore();
	const partner = computed(() =>
		props.chat.participants?.find(
			(user: any) => user._id !== props.currentUserId,
		),
	);
	const isBlocked = computed(() =>
		partner.value ? friendStore.isBlocked(partner.value._id) : false,
	);
	const isExpired = computed(() => props.chat.status === "expired");
	const rel = computed(() =>
		resolveRelationship({
			status: props.chat.status as string,
			initiatorId: props.chat.initiator_id,
			currentUserId: props.currentUserId,
			trialExpiresAt: props.chat.trial_expires_at,
		}),
	);
	const accent = computed(() => RELATIONSHIP_ACCENT[rel.value.accent]);
	const partnerCustomization = computed(() =>
		hydrateCustomization(partner.value?.customization),
	);
	const theme = computed(() =>
		resolveTheme(partnerCustomization.value.themeId),
	);
	const palette = computed(() =>
		resolveReadableCustomizationPalette(theme.value),
	);
	const resolvedFontFamily = computed(() =>
		resolveFontFamily(partnerCustomization.value.fontId),
	);
	const fontEffectClass = computed(() =>
		resolveFontEffectClass(partnerCustomization.value.fontEffectId),
	);
	const showTheme = computed(() => !isBlocked.value && !isExpired.value);
	const onDarkSurface = computed(() => showTheme.value && palette.value.isDark);
	const cardStyle = computed(() => ({
		background: theme.value.cardBg,
		borderColor: theme.value.cardBorderColor,
	}));
	const themeTextOnDark = computed(
		() => showTheme.value && palette.value.isDark,
	);
	const themedNameColor = computed(() => palette.value.name);
	const themedDescColor = computed(() => palette.value.desc);
	const timestampStyle = computed(() => ({
		color: showTheme.value ? palette.value.utility : "#18181b",
		opacity: showTheme.value && palette.value.isDark ? 0.9 : 0.68,
		textShadow:
			showTheme.value && palette.value.isDark
				? "0 1px 3px rgba(0, 0, 0, 0.65)"
				: "none",
	}));

	const lastMessage = computed(() => {
		const message = props.chat.last_message;
		if (!message) return "Started a conversation";
		if (message.type === "system") {
			return message.system_kind === "balloon_match"
				? `${partner.value?.name || "Someone"} caught a balloon 🎈`
				: "New activity";
		}
		if (message.content)
			return safeText(message.content, message.content_filtered);
		if (message.shared_post_id) return "Shared a post";
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
	const showsMessage = computed(
		() =>
			!isBlocked.value &&
			!isExpired.value &&
			!["incoming_invite", "outgoing_invite", "live_invite"].includes(
				rel.value.kind,
			) &&
			!!props.chat.last_message,
	);
	const statusLine = computed(() => {
		if (isBlocked.value) return "User is blocked";
		if (props.isTyping && !isExpired.value) return "typing…";
		if (isExpired.value) return deleteCountdown.value;
		return showsMessage.value
			? lastMessage.value
			: rel.value.hint || lastMessage.value;
	});
	const showChip = computed(
		() => isBlocked.value || !["active", "mate"].includes(rel.value.kind),
	);
	const chipText = computed(() =>
		isBlocked.value ? "Blocked" : rel.value.label,
	);
	const avatarBadge = computed<{ bg: string; icon?: string } | null>(() => {
		if (rel.value.kind === "live_invite")
			return { bg: "bg-secondary animate-bounce", icon: svg(mdiPalette) };
		if (isBlocked.value) return { bg: "bg-zinc-600", icon: svg(mdiAccountOff) };
		if (isExpired.value)
			return { bg: "bg-zinc-400", icon: svg(mdiTrashCanOutline) };
		if (["incoming_mate", "outgoing_mate"].includes(rel.value.kind))
			return { bg: "bg-secondary", icon: svg(mdiHeart) };
		return null;
	});

	return {
		partner,
		isBlocked,
		isExpired,
		rel,
		accent,
		partnerCustomization,
		theme,
		resolvedFontFamily,
		fontEffectClass,
		showTheme,
		onDarkSurface,
		cardStyle,
		themeTextOnDark,
		themedNameColor,
		themedDescColor,
		timestampStyle,
		unreadCount,
		formattedTime,
		showOnlinePip,
		showJourney,
		statusLine,
		showChip,
		chipText,
		avatarBadge,
		cardClass: cardClass(isBlocked, isExpired, rel),
		avatarFilter: computed(() => ({
			"grayscale opacity-40": isBlocked.value,
			"grayscale-[0.5] contrast-[0.9]": !isBlocked.value && isExpired.value,
			"grayscale-[0.3] opacity-75":
				!isBlocked.value && rel.value.kind === "outgoing_invite",
		})),
		nameClass: computed(() => {
			if (isBlocked.value || isExpired.value) return "text-black/50";
			return rel.value.actionable ||
				unreadCount.value > 0 ||
				rel.value.kind === "live_invite"
				? "text-black"
				: "text-black/80";
		}),
		chipClass: computed(() => {
			if (isBlocked.value) return "bg-zinc-500 text-white";
			if (rel.value.kind === "trial_expired")
				return "bg-amber-300/35 text-black";
			return accent.value.chip;
		}),
		chipStyle: computed(() =>
			rel.value.kind === "trial_expired" ? { color: "#18181b" } : {},
		),
		statusClass: computed(() => {
			if (isBlocked.value) return "text-black/50 italic";
			if (props.isTyping && !isExpired.value)
				return "text-secondary animate-pulse italic font-bold";
			if (isExpired.value) return "text-black/50 italic";
			if (rel.value.actionable)
				return rel.value.accent === "amber"
					? "text-amber-700 font-black italic"
					: "text-secondary font-black italic";
			if (showsMessage.value)
				return unreadCount.value > 0
					? "font-black text-black"
					: "text-black/60";
			return "text-black/60";
		}),
	};
}

function cardClass(
	isBlocked: ComputedRef<boolean>,
	isExpired: ComputedRef<boolean>,
	rel: ComputedRef<ReturnType<typeof resolveRelationship>>,
) {
	return computed(() => {
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
}
