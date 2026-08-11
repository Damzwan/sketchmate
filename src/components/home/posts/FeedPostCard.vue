<template>
  <!-- The drop shadow lives on THIS element, not the card below it. `.post-container`
       carries `content-visibility`, which brings paint containment — that clips
       descendants to this box, so a shadow drawn by the inner card would lose its
       outer couple of pixels. An element's own box-shadow is exempt from its own
       containment, so hoisting it here (with a matching radius) keeps it intact. -->
  <div
    class="post-container relative w-full rounded-[2.25rem] shadow-sm"
    :data-post-id="post._id"
  >
    <div
      class="relative rounded-[2.25rem] border border-primary/40 overflow-hidden flex flex-col h-full bg-tertiary"
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
            :dark="theme.isDark"
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
                  :style="{
                    color: headerPalette.name,
                    fontFamily: resolvedFontFamily,
                    textShadow: fontEffectClass ? undefined : headerTextShadow,
                  }"
                >
                  {{ post.author.name }}
                </p>
                <span
                  v-if="displayTitle"
                  class="font-black uppercase tracking-widest shrink-0 truncate ml-0.5"
                  :class="isTexturedEffect ? 'text-[13px] opacity-90' : 'text-xs opacity-70'"
                  :style="{ color: headerPalette.desc, textShadow: headerTextShadow }"
                >
                  · {{ displayTitle }}
                </span>
              </div>
              <p
                class="uppercase mt-1 tracking-wider"
                :class="isTexturedEffect ? 'text-[13px] opacity-95' : 'text-xs opacity-80'"
                :style="{ color: headerPalette.desc, textShadow: headerTextShadow }"
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
                    :style="{ color: headerPalette.name, textShadow: headerTextShadow }">
              <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl" />
            </button>
          </div>
        </div>

        <!-- The artist's own words, so this is prose the reader has to get
             through, not a label to glance at. It stays in the UI face: the
             display faces measure 40-76% single-pixel stems at this size, and
             a caption is the worst place to spend that. -->
        <div v-if="post.description" class="mt-2 px-0.5">
          <p
            ref="descriptionEl"
            class="font-bold leading-snug whitespace-pre-line"
            :class="[isTexturedEffect ? 'text-[17px]' : 'text-base', descriptionExpanded ? '' : 'line-clamp-2']"
            :style="{ color: headerPalette.desc, textShadow: headerTextShadow }"
          >
            {{ post.description }}
          </p>
          <button
            v-if="descriptionOverflows"
            type="button"
            class="mt-0.5 text-xs font-black uppercase tracking-wider opacity-70 hover:opacity-100 active:scale-95 transition-all cursor-pointer"
            :style="{ color: headerPalette.desc, textShadow: headerTextShadow }"
            @click.stop="toggleDescription"
          >
            {{ descriptionExpanded ? 'Show less' : 'See more' }}
          </button>
        </div>
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
        <!-- Same URL as the artwork below, deliberately. This layer is blurred
             past recognition, so a second, distinct object bought nothing and
             doubled the CDN requests for the feed; pointing both at one URL
             makes the browser serve the second from the first's response. -->
        <img
          :src="feedImageUrl"
          class="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? blurredBackdropOpacity : 'opacity-0'"
          :loading="priority ? 'eager' : 'lazy'"
          decoding="async"
          alt=""
        />

        <!-- Only possible now the strip reserves its own box from
             `aspect_ratio`: before, the card had no height until the bytes
             landed, so there was nothing to put a skeleton inside. -->
        <div
          v-if="!imageLoaded && artworkAspect"
          class="absolute inset-0 z-[1] artwork-skeleton pointer-events-none"
          aria-hidden="true"
        />

        <div class="absolute inset-0 z-[5] pointer-events-none dynamic-edge-vignette" />

        <!-- Competition win. Denormalised onto the post at announce time, so
             this costs no lookup. The badge follows the artwork wherever it
             goes — that visibility is half the reward. -->
        <div
          v-if="post.competition_win"
          class="absolute top-2 left-2 z-20 px-2.5 py-1 rounded-full bg-amber-300/95 text-amber-950 text-[11px] font-black shadow-sm pointer-events-none"
        >
          🏆 {{ post.competition_win.category_label }}
        </div>

        <!-- The THUMBNAIL, not the full-res export. This strip is at most one
             phone width by 50vh; the full image is the raw canvas blob and only
             the fullscreen swiper can actually show that detail. -->
        <img
          :src="feedImageUrl"
          class="relative z-10 w-full object-contain transition-opacity duration-500"
          :class="[imageLoaded ? 'opacity-100' : 'opacity-0', artworkAspect ? 'h-full' : 'max-h-[50vh]']"
          :loading="priority ? 'eager' : 'lazy'"
          :fetchpriority="priority ? 'high' : 'auto'"
          decoding="async"
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

      <FeedPostFooter
        :post="post"
        :active-reactions="activeReactions"
        :total-reaction-count="totalReactionCount"
        :preview-comments="previewComments"
        :has-more-comments="hasMoreComments"
        :is-textured-effect="isTexturedEffect"
        :strong-text="strongText"
        :muted-text="mutedText"
        :texture-halo="textureHalo"
        :open-comments="openComments"
        :open-share="openShare"
        :remix-post="remixPost"
		@open-reaction-breakdown="(value) => $emit('open-reaction-breakdown', value)"
		@open-reaction-popover="(value) => $emit('open-reaction-popover', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiArrowExpand, mdiDotsHorizontal } from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import ReactionBurst from "@/components/general/ReactionBurst.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { svg } from "@/helper/general.helper";
import type { FeedPost } from "@/types/server.types";
import FeedPostFooter from "./FeedPostFooter.vue";
import { useFeedPostCard } from "./useFeedPostCard";

dayjs.extend(relativeTime);
const props = defineProps<{
	post: FeedPost;
	isMine: boolean;
	preview?: boolean;
	priority?: boolean;
}>();
const emit = defineEmits([
	"open-comments",
	"open-reaction-popover",
	"open-reaction-breakdown",
	"open-fullscreen",
	"delete-post",
]);
const {
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
	openUser,
	openShare,
	openComments,
	remixPost,
	handleDoubleTap,
	presentActionSheet,
} = useFeedPostCard(props, emit);
</script>

<style scoped>
@reference "@/theme/main.css";

/* Browser-native virtualisation for the feed, the same technique the message
 * list uses (see the long note in ChatMessageBubble.vue).
 *
 * `content-visibility: auto` lets the engine skip layout, style and paint for
 * any card outside the viewport. A feed card is far heavier than a chat row —
 * a full-bleed artwork image, a blurred backdrop copy of that same image, an
 * optional ProfileWorld scene and a ProfileEffect sheet — so skipping the
 * offscreen ones is worth more here per row than it is in a thread, even
 * though the list is capped at 20. Android System WebView is Chromium, so this
 * is supported on the target and simply does nothing where it isn't.
 *
 * `contain-intrinsic-size: auto 420px` — 420px is not a guess, it's the height
 * CommunityFeed's own loading skeleton reserves for a card. The `auto` keyword
 * is the load-bearing half: without it every skipped card would claim a flat
 * 420px forever, and since real card heights vary with artwork aspect ratio,
 * `scrollHeight` would lurch as cards enter and reveal their true size. `auto`
 * makes the engine remember each card's last real rendered height and keep
 * using it while skipped, which keeps the scroll metrics honest — that matters
 * because the reaction picker pins `scrollTop` across its open/close animation
 * and would otherwise be pinning against a moving target. */
.post-container {
  content-visibility: auto;
  contain-intrinsic-size: auto 420px;
}

/* Sweep, not a pulse — a pulsing block reads as "broken", a sweep reads as
   "loading". Same treatment as CompetitionCard's placeholder. Transform-only,
   so it stays on the compositor while the feed scrolls. */
.artwork-skeleton {
  background: rgb(0 0 0 / 0.04);
  overflow: hidden;
}
.artwork-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.45), transparent);
  animation: artwork-shimmer 1.4s ease-in-out infinite;
}
@keyframes artwork-shimmer {
  to { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .artwork-skeleton::after { animation: none; }
}

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
