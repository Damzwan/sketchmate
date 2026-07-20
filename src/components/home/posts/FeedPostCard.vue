<template>
  <div class="post-container relative w-full overflow-visible" :data-post-id="post._id">
    <div
      class="relative rounded-[2.25rem] border border-primary/40 shadow-sm overflow-hidden flex flex-col h-full bg-tertiary"
      :style="cardStyle"
    >
      <!-- ONE card-wide effect layer behind everything, so the effect on the
           header and the footer are the same continuous sheet (they read as
           synced). The opaque artwork strip covers it through the middle. One
           instance keeps it cheap. Gated on the effect itself, not the theme. -->
      <div v-if="showEffect" class="absolute inset-0 z-0 pointer-events-none">
        <ProfileEffect :effect-id="authorCustomization.effectId" radius-class="rounded-none" contained />
      </div>

      <!-- Artist intro banner: transparent so the card surface + effect show
           through; the world vignette lives here, up by the author. When a world
           is present the header gets a floor so the scene has room to resolve
           instead of being clipped by whatever the text happens to occupy. -->
      <div
        class="relative shrink-0 overflow-hidden"
        :class="showWorld ? 'min-h-[7.5rem]' : ''"
      >
        <div v-if="showWorld" class="absolute inset-0 z-0 pointer-events-none">
          <ProfileWorld
            :world-id="authorCustomization.worldId"
            :accent="theme.accentColor"
            static-mode
            banner
            contained
            radius-class="rounded-none"
          />
        </div>

        <div class="relative z-10 px-4 pt-3.5 pb-3">
        <div class="flex items-start justify-between gap-2">
          <button
            @click="openUser(post.author._id)"
            class="flex cursor-pointer items-center active:scale-98 transition-all text-left min-w-0"
          >
            <div class="flex items-center justify-center shrink-0">
              <UserAvatar
                :user="post.author"
                :customization="authorCustomization"
                size="sm"
                static
              />
            </div>

            <div class="ml-3 flex flex-col justify-center min-w-0">
              <div class="flex items-baseline gap-1 truncate">
                <!-- Sizes step up on a textured card: at text-sm/text-xs the
                     type was thin enough that the crease detail cut through the
                     strokes. Bigger glyphs carry more of their own colour. -->
                <p
                  class="p-2 leading-none font-black drop-shadow-sm truncate"
                  :class="[fontEffectClass, isTexturedEffect ? 'text-base' : 'text-sm']"
                  :style="{ color: theme.nameColor, fontFamily: resolvedFontFamily, textShadow: textureHalo }"
                >
                  {{ post.author.name }}
                </p>
                <span
                  v-if="displayTitle"
                  class="font-black uppercase tracking-widest shrink-0 truncate ml-0.5"
                  :class="isTexturedEffect ? 'text-[13px] opacity-90' : 'text-xs opacity-70'"
                  :style="{ color: theme.descColor, textShadow: textureHalo }"
                >
                  · {{ displayTitle }}
                </span>
              </div>
              <p
                class="uppercase mt-1 tracking-wider"
                :class="isTexturedEffect ? 'text-[13px] opacity-95' : 'text-xs opacity-80'"
                :style="{ color: theme.descColor, textShadow: textureHalo }"
              >
                {{ dayjs(post.createdAt).fromNow() }}
              </p>
            </div>
          </button>

          <!-- Signature moved out of here onto the artwork itself: it was
               fighting the world layer for the same top-right corner. -->
          <div class="flex flex-col items-end shrink-0 -mr-1">
            <button @click="presentActionSheet"
                    class="p-2 active:scale-90 transition-transform cursor-pointer opacity-70 hover:opacity-100"
                    :style="{ color: theme.nameColor }">
              <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl" />
            </button>
          </div>
        </div>

        <p v-if="post.description"
           class="cabin-sketch-regular font-bold line-clamp-2 mt-2 px-0.5 leading-snug"
           :class="isTexturedEffect ? 'text-[17px]' : 'text-base'"
           :style="{ color: theme.descColor, textShadow: textureHalo }">
          {{ post.description }}
        </p>
        </div>
      </div>

      <div
        ref="reactionSurface"
        class="tap-guard relative z-10 w-full flex items-center justify-center overflow-hidden border-y select-none"
        :class="showCardTheme ? '' : 'bg-[#FAF8F5] border-primary/10'"
        :style="artworkStyle"
        @dblclick="handleDoubleTap"
        @contextmenu.prevent
      >
        <img
          :src="post.image_url"
          class="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? blurredBackdropOpacity : 'opacity-0'"
          alt=""
        />

        <div class="absolute inset-0 z-[5] pointer-events-none dynamic-edge-vignette" />

        <img
          :src="post.image_url"
          class="relative z-10 w-full object-contain transition-opacity duration-500 max-h-[50vh]"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          @load="imageLoaded = true"
          alt="Main illustration content"
        />

        <!-- Signature, signed onto the artwork like a real canvas. Pinned
             bottom-right with its own soft scrim so it stays readable over busy
             drawings.

             Stacked caption-above-mark, matching ProfileCard's signature block
             — that's the signature-line convention (label, then the mark under
             it). Side by side, the label read as a tag pinned next to a
             scribble instead of as part of one signature. -->
        <div
          v-if="authorCustomization.signaturePath"
          class="absolute bottom-1.5 right-2 z-20 pointer-events-none flex flex-col items-center signature-plate"
        >
          <span class="signature-caption">— Signed —</span>
          <!-- Both sizes are exactly 2:1, matching the default 300×150 viewBox,
               so `meet` fills the box rather than letterboxing (an off-ratio box
               silently shrinks the mark and leaves dead space around it).
               Smaller on phones, where it otherwise crowds the artwork. -->
          <svg
            class="w-20 h-10 sm:w-28 sm:h-14 drop-shadow-sm -mt-0.5"
            :viewBox="authorCustomization.signatureViewBox || '0 0 300 150'"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Artist signature"
          >
            <path
              :d="authorCustomization.signaturePath"
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              :stroke-width="signatureStrokeWidth"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <!-- Fullscreen. An explicit control rather than a tap handler: this
             surface already owns double-tap (react) and long-press (reaction
             picker), and a single-tap would need a disambiguation timer that
             makes opening feel laggy. -->
        <!-- Not in `preview` mode: the customization preview renders this card as
             a display-only mock of a post that doesn't exist, so a fullscreen
             control there opens a viewer onto nothing. -->
        <button
          v-if="!preview"
          @click.stop="openFullscreen"
          class="absolute top-2 right-2 z-20 h-9 w-9 rounded-full flex items-center justify-center
                 bg-black/40 text-white backdrop-blur-sm border border-white/20
                 active:scale-90 hover:bg-black/55 transition-all cursor-pointer"
          aria-label="View drawing fullscreen"
        >
          <ion-icon :icon="svg(mdiArrowExpand)" class="text-lg" />
        </button>

        <ReactionBurst ref="reactionBurst" />
      </div>

      <!-- Footer: reaction proof · action bar · comment previews -->
      <div class="relative z-10 px-4 pt-3 pb-4 shrink-0 flex flex-col gap-3">
        <!-- Reaction social proof: tappable pill opening a full breakdown -->
        <button
          v-if="totalReactionCount > 0"
          @click="showReactionSheet = true"
          class="flex items-center gap-2 self-start cursor-pointer active:scale-95 hover:scale-[1.02] transition-all"
          aria-label="See who reacted"
        >
          <div class="flex items-center">
            <div
              v-for="(key, i) in activeReactions.slice(0, 3)"
              :key="key"
              class="w-8 h-8 rounded-full bg-white shadow-sm border border-black/5 flex items-center justify-center"
              :class="i !== 0 ? '-ml-2.5' : ''"
              :style="{ zIndex: 3 - i }"
            >
              <img :src="reactionImages[key]" class="w-5 h-5 object-contain" alt="" />
            </div>
          </div>
          <span class="text-sm font-black text-black/80 tracking-tight" :style="{ color: strongText, textShadow: textureHalo }">
            {{ totalReactionCount }}
            <span class="text-black/50" :style="{ color: mutedText }">{{ totalReactionCount === 1 ? 'reaction' : 'reactions' }}</span>
          </span>
          <ion-icon :icon="svg(mdiChevronRight)" class="text-base text-black/30 -ml-0.5 opacity-60" :style="{ color: mutedText }" />
        </button>

        <!-- Action bar: one cohesive, clear button style -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <!-- React -->
            <button
              @click="(e) => $emit('open-reaction-popover', { event: e, post })"
              class="flex items-center cursor-pointer hover:scale-105 justify-center h-9 px-3 rounded-full border active:scale-95 transition-all"
              :class="post.user_reaction
                ? 'bg-secondary/10 border-secondary/30 text-secondary'
                : 'bg-white border-black/10 text-black/80'"
              aria-label="React"
            >
              <img
                v-if="post.user_reaction"
                :src="reactionImages[post.user_reaction]"
                class="w-5 h-5 object-contain"
                alt=""
              />
              <ion-icon v-else :icon="svg(mdiHeartOutline)" class="text-lg" />
            </button>

            <!-- Comment (count lives here, Instagram-style) -->
            <button
              v-if="post.enable_comments"
              @click="openComments"
              class="flex items-center gap-1.5 h-9 cursor-pointer hover:scale-105 px-3.5 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all"
            >
              <ion-icon :icon="svg(mdiChatOutline)" class="text-lg" />
              <span v-if="post.comment_count" class="text-sm font-black tracking-tight">
                {{ post.comment_count }}
              </span>
            </button>

            <!-- Share -->
            <button
              @click="openShare"
              class="flex items-center justify-center cursor-pointer hover:scale-105 h-9 w-9 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all"
              aria-label="Share"
            >
              <ion-icon :icon="svg(mdiSendOutline)" class="text-base -rotate-12" />
            </button>
          </div>

          <!-- Remix: demoted to a neutral pill, matching the rest -->
          <button
            v-if="post.enable_remix"
            @click="remixPost"
            class="flex items-center gap-1.5 h-9 px-3 cursor-pointer hover:scale-105 rounded-full bg-white border border-black/10 text-black/70 hover:text-black active:scale-95 transition-all"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" class="text-sm" />
            <span class="text-[11px] font-black uppercase tracking-wider">Remix</span>
          </button>
        </div>

        <!-- Comment previews.
             On a textured card these are the smallest, most muted type on the
             card, so the crease detail eats them first. No plate/backdrop — a
             box here read as a card-on-a-card. Instead the textured variant is
             a step larger, the message half drops its mute (it renders in the
             full-strength name colour with a bolder weight), and the halo does
             the separating from the paper grain. -->
        <div
          v-if="previewComments.length"
          @click="openComments"
          class="cursor-pointer active:opacity-70 transition-opacity flex flex-col gap-1"
        >
          <div
            v-for="comment in previewComments"
            :key="comment._id"
            class="flex items-start gap-1.5 leading-snug"
            :class="isTexturedEffect ? 'text-[13px]' : 'text-xs'"
          >
            <span class="text-black font-black shrink-0 tracking-tight" :style="{ color: strongText, textShadow: textureHalo }">{{ comment.author.name }}</span>
            <span
              class="truncate tracking-tight"
              :class="isTexturedEffect ? 'font-bold' : 'text-black/80'"
              :style="{ color: isTexturedEffect ? strongText : mutedText, textShadow: textureHalo }"
            >{{ comment.message }}</span>
          </div>

          <!-- Only when there are genuinely more comments than we're previewing -->
          <p
            v-if="hasMoreComments"
            class="text-xs font-black text-black/70 mt-0.5 tracking-wide"
            :style="{ color: isTexturedEffect ? strongText : mutedText, textShadow: textureHalo }"
          >
            View all {{ post.comment_count }} comments
          </p>
        </div>

        <!-- Empty-state nudge, only when there is nothing to preview -->
        <p
          v-else-if="post.enable_comments"
          @click="openComments"
          class="text-xs font-black text-black/70 uppercase tracking-widest cursor-pointer active:opacity-60"
          :style="{ color: mutedText, textShadow: textureHalo }"
        >
          Start the conversation
        </p>
      </div>
    </div>

    <ReactionBreakdownSheet
      :is-open="showReactionSheet"
      :post="post"
      @close="showReactionSheet = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLongPress } from "@vueuse/core";
import { actionSheetController, alertController, IonIcon } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiChatOutline,
	mdiChevronRight,
	mdiDeleteOutline,
	mdiDotsHorizontal,
	mdiFlagVariantOutline,
	mdiHeartOutline,
	mdiPencilOutline,
	mdiSendOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { svg } from "@/helper/general.helper";
import { FeedPost } from "@/types/server.types";
import { playSelectionTick, reactionImages } from "@/config/post.config";
import { useMenuStore } from "@/store/menu.store";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { Menu } from "@/draw/types/draw.types";
import { useModerationStore } from "@/store/moderation.store";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import ReactionBurst from "@/components/general/ReactionBurst.vue";
import {
	calculateSignatureStroke,
	DEFAULT_EFFECT_ID,
	DEFAULT_WORLD_ID,
	hydrateCustomization,
	isLightTheme,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
} from "@/config/profile_options.config";
import { useShareService } from "@/draw/store/useShareService.store";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import ReactionBreakdownSheet from "@/components/general/ReactionBreakdownSheet.vue";

dayjs.extend(relativeTime);

const props = defineProps<{
	post: FeedPost;
	isMine: boolean;
	/**
	 * Rendered as a non-interactive mock of a post (customization preview).
	 * Suppresses controls that only make sense against a real, persisted post.
	 */
	preview?: boolean;
}>();
const emit = defineEmits([
	"open-comments",
	"open-reaction-popover",
	"delete-post",
]);

const { openUserActions } = useUserContextSheet();
const menuStore = useMenuStore();

const imageLoaded = ref(false);
const reactionSurface = ref<HTMLElement | null>(null);
const reactionBurst = ref<{ play: (r: string) => void } | null>(null);

const authorCustomization = computed(() =>
	hydrateCustomization(props.post.author?.customization),
);
const theme = computed(() => resolveTheme(authorCustomization.value.themeId));
// Theme, effect and world are three INDEPENDENT purchases — gate them
// separately. They used to share one `showArtistTheme` flag keyed off themeId,
// which meant an artist who bought an effect or a world but kept the `classic`
// theme rendered neither of them.
// Classic is the SketchMate house palette (#FAE0C2 primary + #B9463A accent),
// so it's the baseline card look, not an opt-out. The old
// `!== DEFAULT_THEME_ID` clause excluded exactly that theme — which, since
// `hydrateCustomization` defaults themeId to `classic`, made deliberately
// choosing Classic indistinguishable from never choosing a theme at all: the
// post card silently fell back to the hardcoded #FAF8F5.
const showCardTheme = computed(() => !!authorCustomization.value.themeId);
// Both components already self-guard on `def.kind !== 'none'`; this just keeps
// the wrapper element (and its compositing layer) out of the DOM entirely for
// the overwhelmingly common "no effect / no world" author.
const showEffect = computed(
	() => authorCustomization.value.effectId !== DEFAULT_EFFECT_ID,
);

/**
 * Text legibility over a TEXTURED effect layer.
 *
 * `crumpled` and `grain` paint per-pixel luminance noise across the whole card,
 * including straight through the header and footer copy. The colour contrast is
 * still nominally fine, but the crease/grain detail sits at roughly the stroke
 * width of the type, so glyph edges compete with it — worst on `classic`, whose
 * cream surface leaves the least headroom. A soft halo in the surface's own
 * colour re-separates the glyphs from the texture without touching the text
 * colour or dimming the effect, and it's keyed to surface lightness so a
 * light-on-dark theme gets a dark halo rather than a white one.
 */
const effectDef = computed(() => resolveEffect(authorCustomization.value.effectId));
const isTexturedEffect = computed(
	() => effectDef.value.kind === "crumpled" || effectDef.value.kind === "grain",
);
const onLightSurface = computed(() => isLightTheme(theme.value));
const textureHalo = computed(() =>
	isTexturedEffect.value
		? onLightSurface.value
			? "0 0 5px rgba(255,255,255,0.85), 0 1px 1px rgba(255,255,255,0.7)"
			: "0 0 5px rgba(0,0,0,0.7), 0 1px 1px rgba(0,0,0,0.55)"
		: undefined,
);
const showWorld = computed(
	() => authorCustomization.value.worldId !== DEFAULT_WORLD_ID,
);
// Subtle whole-card theming: paint the artist's surface + border on the whole
// card (header + footer), leaving the artwork strip neutral. Not applied for the
// base theme.
const cardStyle = computed(() =>
	showCardTheme.value
		? {
				background: theme.value.cardBg,
				borderColor: theme.value.cardBorderColor,
				transform: "translateZ(0)",
				isolation: "isolate",
			}
		: {
				transform: "translateZ(0)",
				isolation: "isolate",
			},
);
// The artwork strip is object-contain, so on any image that isn't the strip's
// exact aspect there is letterbox padding around it. That padding was a
// hardcoded cream (#FAF8F5) regardless of theme, which read as a foreign band
// cutting the card in half. Carry the artist's surface through it instead, and
// keep the translateZ/will-change promotion that was previously inline.
const artworkStyle = computed(() => ({
	transform: "translateZ(0)",
	willChange: "transform",
	...(showCardTheme.value
		? {
				background: theme.value.cardBg,
				borderColor: theme.value.cardBorderColor,
			}
		: {}),
}));

// The blurred art backdrop fills the letterbox with the drawing's own colours.
// At the untouched 40% it would smother the theme surface underneath, so on a
// themed card it steps back and lets the artist's colour lead.
const blurredBackdropOpacity = computed(() =>
	showCardTheme.value ? "opacity-20" : "opacity-40",
);

// Footer text colours on a themed card — undefined falls back to the default
// black/x classes for base-theme cards.
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
		(sum, count) => sum + count,
		0,
	),
);

// Breakdown sheet: reactions ordered most-popular first.
const showReactionSheet = ref(false);
const sortedReactions = computed(() =>
	[...activeReactions.value].sort(
		(a, b) => props.post.reaction_counts[b] - props.post.reaction_counts[a],
	),
);
const reactionPercent = (key: string) => {
	const total = totalReactionCount.value;
	if (!total) return 0;
	return Math.round((props.post.reaction_counts[key] / total) * 100);
};

// Up to two embedded comments to preview inline.
const previewComments = computed(() => props.post.comments?.slice(0, 2) ?? []);

// "View all" should only appear when there are comments beyond what's previewed,
// i.e. genuinely hidden comments — never "View all 1 comments".
const hasMoreComments = computed(
	() => (props.post.comment_count ?? 0) > previewComments.value.length,
);

watch(
	() => props.post.user_reaction,
	(newVal, oldVal) => {
		if (newVal && newVal !== oldVal) {
			reactionBurst.value?.play(newVal);
		}
	},
);

// Long-press anywhere on the artwork opens the reaction picker, mirroring
// the existing double-tap gesture. A light haptic confirms it armed.
onLongPress(
	reactionSurface,
	(e) => {
		playSelectionTick();
		emit("open-reaction-popover", { event: e, post: props.post });
	},
	{ delay: 400, modifiers: { prevent: true } },
);

const { openPostSwiper } = usePostSwiper();

// Fullscreen this one post. The swiper takes a collection + index, so a single
// card opens as a one-item collection — same viewer the profile grid and
// notifications already use, so reactions/comments/delete behave identically.
const openFullscreen = () => {
	trackEvent(mixpanelEvents.postFullscreenOpen, {
		post_id: props.post._id,
		author_id: props.post.author._id,
	});
	openPostSwiper([props.post], 0);
};

const openUser = (userId: string) => openUserActions({ _id: userId });
const shareService = useShareService();

const openShare = () => {
	trackEvent(mixpanelEvents.postShareOpen, {
		post_id: props.post._id,
		author_id: props.post.author._id,
		is_mine: props.isMine,
	});
	shareService.setActiveShareItem({ type: "post", data: props.post });
	menuStore.openMenu(Menu.SharePostMenu);
};

const openComments = () => {
	trackEvent(mixpanelEvents.postCommentsOpen, {
		post_id: props.post._id,
		author_id: props.post.author._id,
		comment_count: props.post.comment_count ?? 0,
	});
	emit("open-comments", props.post);
};

const remixPost = async () => {
	const alert = await alertController.create({
		header: "Remix this drawing?",
		message:
			"This will open a copy of this drawing on your canvas so you can edit it.",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{
				text: "Remix Drawing",
				handler: () => {
					trackEvent(mixpanelEvents.postRemix, {
						post_id: props.post._id,
						author_id: props.post.author._id,
					});
					setTimeout(() => {
						router.push({
							path: FRONTEND_ROUTES.draw,
							query: { canvas_url: props.post.drawing_url, mode: "solo" },
						});
					}, 100);
				},
			},
		],
	});
	await alert.present();
};

const handleDoubleTap = (e: MouseEvent | TouchEvent) => {
	e.preventDefault();
	emit("open-reaction-popover", { event: e, post: props.post });
};

const presentActionSheet = async () => {
	const buttons: any[] = [
		{
			text: "Report Artwork",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				useModerationStore().openReport({
					type: "post",
					id: props.post._id,
					label: `${props.post.author.name}'s post`,
				});
			},
		},
	];
	if (props.isMine) {
		buttons.unshift({
			text: "Delete Post",
			role: "destructive",
			icon: svg(mdiDeleteOutline),
			handler: () => emit("delete-post", props.post),
		});
	}
	buttons.push({ text: "Cancel", role: "cancel" });

	const actionSheet = await actionSheetController.create({
		header: "Post Options",
		cssClass: "liquid-action-sheet",
		buttons,
	});
	await actionSheet.present();
};
</script>

<style scoped>
@reference "@/theme/main.css";

/* The signature sits directly on the drawing, so it can't rely on the card
   surface for contrast — it carries its own scrim. Kept soft and small so it
   reads as a signature on the artwork, not a watermark stamped over it. */
/* Stacked block, so a pill no longer fits it — a soft rounded plate does.
   Padding tracks the mark size so the plate doesn't stay phone-oversized. */
.signature-plate {
  @apply px-2.5 pt-0.5 pb-0.5 rounded-xl sm:px-3 sm:pt-1 sm:rounded-2xl
  bg-black/35 backdrop-blur-[2px] border border-white/15;
}

/* No `mb` nudge — optical spacing comes from the -mt-0.5 on the mark, so the
   caption keeps its natural line box. */
.signature-caption {
  @apply text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-white/65 leading-none;
}
</style>
