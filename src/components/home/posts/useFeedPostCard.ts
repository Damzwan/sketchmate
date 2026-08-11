import { mdiDeleteOutline, mdiFlagVariantOutline } from "@mdi/js";
import { onLongPress } from "@vueuse/core";
import { type CSSProperties, computed, ref, watch } from "vue";
import { useOverlayScrollGuardContext } from "@/composables/general/useOverlayScrollGuard";
import { useTextClamp } from "@/composables/general/useTextClamp";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useConfirm } from "@/composables/useConfirm";
import { playSelectionTick } from "@/config/post.config";
import {
	calculateSignatureStroke,
	DEFAULT_EFFECT_ID,
	DEFAULT_WORLD_ID,
	hydrateCustomization,
	isLightTheme,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveTitle,
} from "@/config/profile_options.config";
import { useShareService } from "@/draw/sharing/shareService.store";
import { svg } from "@/helper/general.helper";
import router from "@/router";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import type { FeedPost } from "@/types/server.types";

type FeedPostCardProps = { post: FeedPost; isMine: boolean };
type FeedPostCardEmit = (
	event:
		| "open-comments"
		| "open-reaction-popover"
		| "open-fullscreen"
		| "delete-post",
	...args: any[]
) => void;

export function useFeedPostCard(
	props: FeedPostCardProps,
	emit: FeedPostCardEmit,
) {
	const { openUserActions } = useUserContextSheet();
	const { presentActionSheet } = useOverlayScrollGuardContext();
	const { confirm } = useConfirm();
	const menu = useMenuStore();
	const descriptionEl = ref<HTMLElement | null>(null);
	const {
		expanded: descriptionExpanded,
		overflowing: descriptionOverflows,
		toggle: toggleDescription,
	} = useTextClamp(descriptionEl);
	const imageLoaded = ref(false);
	const reactionSurface = ref<HTMLElement | null>(null);
	const reactionBurst = ref<{ play: (reaction: string) => void } | null>(null);

	const authorCustomization = computed(() =>
		hydrateCustomization(props.post.author?.customization),
	);
	const theme = computed(() => resolveTheme(authorCustomization.value.themeId));
	const headerPalette = computed(() =>
		resolveReadableCustomizationPalette(theme.value),
	);
	const showCardTheme = computed(() => !!authorCustomization.value.themeId);
	const showEffect = computed(
		() => authorCustomization.value.effectId !== DEFAULT_EFFECT_ID,
	);
	const showWorld = computed(
		() => authorCustomization.value.worldId !== DEFAULT_WORLD_ID,
	);
	const isTexturedEffect = computed(() => {
		const kind = resolveEffect(authorCustomization.value.effectId).kind;
		return kind === "crumpled" || kind === "grain";
	});
	const textureHalo = computed(() => {
		if (!isTexturedEffect.value) return undefined;
		return isLightTheme(theme.value)
			? "0 0 5px rgba(255,255,255,0.85), 0 1px 1px rgba(255,255,255,0.7)"
			: "0 0 5px rgba(0,0,0,0.7), 0 1px 1px rgba(0,0,0,0.55)";
	});
	const headerTextShadow = computed(
		() => textureHalo.value ?? headerPalette.value.textShadow,
	);
	const baseLayer: CSSProperties = {
		transform: "translateZ(0)",
		isolation: "isolate",
	};
	const cardStyle = computed<CSSProperties>(() => ({
		...baseLayer,
		...(showCardTheme.value && {
			background: theme.value.cardBg,
			borderColor: theme.value.cardBorderColor,
		}),
	}));
	const artworkAspect = computed(() => {
		const ratio = props.post.aspect_ratio;
		return typeof ratio === "number" && ratio > 0 ? ratio : null;
	});
	const feedImageUrl = computed(
		() => props.post.thumbnail_url || props.post.image_url,
	);
	const artworkStyle = computed(() => ({
		transform: "translateZ(0)",
		willChange: "transform",
		...(artworkAspect.value && {
			aspectRatio: String(artworkAspect.value),
			maxHeight: "50vh",
		}),
		...(showCardTheme.value && {
			background: theme.value.cardBg,
			borderColor: theme.value.cardBorderColor,
		}),
	}));
	const blurredBackdropOpacity = computed(() =>
		showCardTheme.value ? "opacity-20" : "opacity-40",
	);
	const strongText = computed(() =>
		showCardTheme.value ? theme.value.nameColor : undefined,
	);
	const mutedText = computed(() =>
		showCardTheme.value ? theme.value.descColor : undefined,
	);
	const resolvedFontFamily = computed(() =>
		resolveFontFamily(authorCustomization.value.fontId),
	);
	const fontEffectClass = computed(() =>
		resolveFontEffectClass(authorCustomization.value.fontEffectId),
	);
	const displayTitle = computed(() =>
		resolveTitle(authorCustomization.value.titleId),
	);
	const signatureStrokeWidth = computed(() =>
		calculateSignatureStroke(authorCustomization.value.signatureViewBox),
	);
	const activeReactions = computed(() =>
		Object.keys(props.post.reaction_counts || {}).filter(
			(key) => props.post.reaction_counts[key] > 0,
		),
	);
	const totalReactionCount = computed(() =>
		Object.values(props.post.reaction_counts || {}).reduce(
			(total, count) => total + count,
			0,
		),
	);
	const previewComments = computed(
		() => props.post.comments?.slice(0, 2) ?? [],
	);
	const hasMoreComments = computed(
		() => (props.post.comment_count ?? 0) > previewComments.value.length,
	);

	watch(
		() => props.post.user_reaction,
		(reaction, previous) => {
			if (reaction && reaction !== previous)
				reactionBurst.value?.play(reaction);
		},
	);
	onLongPress(
		reactionSurface,
		(event) => {
			playSelectionTick();
			emit("open-reaction-popover", { event, post: props.post });
		},
		{ delay: 650, distanceThreshold: 12, modifiers: { prevent: true } },
	);

	function track(name: string, extra: Record<string, unknown> = {}) {
		trackEvent(name, {
			post_id: props.post._id,
			author_id: props.post.author._id,
			...extra,
		});
	}
	function openFullscreen() {
		track(mixpanelEvents.postFullscreenOpen);
		emit("open-fullscreen", props.post);
	}
	function openShare() {
		track(mixpanelEvents.postShareOpen, { is_mine: props.isMine });
		useShareService().setActiveShareItem({ type: "post", data: props.post });
		menu.openMenu(Menu.SharePostMenu);
	}
	function openComments() {
		track(mixpanelEvents.postCommentsOpen, {
			comment_count: props.post.comment_count ?? 0,
		});
		emit("open-comments", props.post);
	}
	async function remixPost() {
		const accepted = await confirm({
			header: "Remix this drawing?",
			message:
				"This will open a copy of this drawing on your canvas so you can edit it.",
			confirmText: "Remix Drawing",
		});
		if (!accepted) return;
		track(mixpanelEvents.postRemix);
		setTimeout(
			() =>
				void router.push({
					path: FRONTEND_ROUTES.draw,
					query: { canvas_url: props.post.drawing_url, mode: "solo" },
				}),
			100,
		);
	}
	function handleDoubleTap(event: MouseEvent | TouchEvent) {
		event.preventDefault();
		emit("open-reaction-popover", { event, post: props.post });
	}
	async function presentPostActions() {
		const buttons: any[] = [
			{
				text: "Report Artwork",
				role: "destructive",
				icon: svg(mdiFlagVariantOutline),
				handler: () =>
					useModerationStore().openReport({
						type: "post",
						id: props.post._id,
						label: `${props.post.author.name}'s post`,
					}),
			},
		];
		if (props.isMine)
			buttons.unshift({
				text: "Delete Post",
				role: "destructive",
				icon: svg(mdiDeleteOutline),
				handler: () => emit("delete-post", props.post),
			});
		buttons.push({ text: "Cancel", role: "cancel" });
		await presentActionSheet({
			header: "Post Options",
			cssClass: "liquid-action-sheet",
			buttons,
		});
	}

	return {
		descriptionEl,
		descriptionExpanded,
		descriptionOverflows,
		toggleDescription,
		imageLoaded,
		reactionSurface,
		reactionBurst,
		authorCustomization,
		theme,
		headerPalette,
		showCardTheme,
		showEffect,
		showWorld,
		isTexturedEffect,
		textureHalo,
		headerTextShadow,
		cardStyle,
		artworkAspect,
		feedImageUrl,
		artworkStyle,
		blurredBackdropOpacity,
		strongText,
		mutedText,
		resolvedFontFamily,
		fontEffectClass,
		displayTitle,
		signatureStrokeWidth,
		activeReactions,
		totalReactionCount,
		previewComments,
		hasMoreComments,
		openFullscreen,
		openUser: (userId: string) => openUserActions({ _id: userId }),
		openShare,
		openComments,
		remixPost,
		handleDoubleTap,
		presentActionSheet: presentPostActions,
	};
}
