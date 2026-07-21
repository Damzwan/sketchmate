<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="close"
    @did-present="onDidPresent"
    :keep-contents-mounted="true"
    class="liquid-photoswiper"
  >
    <!-- Chrome overlays the art rather than sitting beside it in a column. That
         is what makes tap-to-hide worth having: hiding the bars reveals more of
         the DRAWING instead of just resizing the box it lives in, and nothing
         reflows on toggle. -->
    <div class="w-full h-full bg-black relative overflow-hidden">
      <div class="absolute inset-0 flex" ref="artSurface">
        <swiper-container
          class="w-full grow"
          :initial-slide="slide"
          :zoom="{ maxRatio: 3 }"
          @swiperslidechange="handleSlideChange"
          @swipertap="onSwiperTap"
          @swiperdoubletap="onSwiperDoubleTap"
          ref="swiper"
        >
          <swiper-slide v-for="(item, i) in collection" :key="item._id || i">
            <div class="swiper-zoom-container" v-if="Math.abs(slide - i) < 3">
              <PhotoSwiperItem
                :thumbnail="resolveThumbnail(item)"
                :image="resolveImage(item)"
                :switch-to-image="Math.abs(slide - i) < 3"
              />
            </div>
          </swiper-slide>
        </swiper-container>

        <ReactionBurst ref="reactionBurst" />
      </div>

      <!-- `:css` is false until a tap actually toggles the chrome, so opening the
           viewer paints the bars in place instead of sliding them in. The v-if
           here flips on OPEN too (currItem goes null → set), which is what was
           animating every time — the transition is meant for the tap-to-hide
           gesture only, not for mount. -->
      <Transition name="chrome-top" :css="chromeAnimated">
        <div v-if="user && currItem && chromeVisible" class="absolute top-0 inset-x-0 z-20 top-pad-safe bg-black/85">
          <PhotoSwiperHeader
            :curr-item="currItem"
            :type="config.type ?? 'inbox'"
            @close="close"
            @open-followers="isFollowerDrawerOpen = true"
            :user-lookup="config.userLookup"
          />
        </div>
      </Transition>

      <Transition name="chrome-bottom" :css="chromeAnimated">
        <!-- Background lives on the wrapper, not on the bar, so it extends under
             the gesture/home inset instead of leaving a see-through strip. -->
        <div v-if="user && currItem && chromeVisible" class="absolute bottom-0 inset-x-0 z-20 bot-pad-safe bg-black/60 backdrop-blur-xl">
          <PhotoSwiperFooter
            :curr-item="currItem"
            :type="config.type ?? 'inbox'"
            :show-comments="showComments"
            :can-reply="canReply"
            :can-delete="canDelete"
            :user-lookup="config.userLookup"
            @open-comments="isCommentDrawerOpen = true"
            @update:show-comments="showComments = $event"
            @reply="handleReply"
            @delete="handleDelete"
            @react="handleReact"
          />
        </div>
      </Transition>

      <!-- Long-press the artwork to react, the same gesture FeedPostCard offers.
           Lives here rather than in the footer because it has to be reachable
           with the chrome hidden — that's the state people are in when they're
           actually looking at the drawing. -->
      <ReactionPopover
        :is-open="longPressPopoverOpen"
        :event="longPressEvent"
        :user-reaction="currItem?.user_reaction"
        @close="closeLongPressPopover"
        @select="onLongPressReaction"
      />

      <SwiperCommentDrawer
        v-model:open="isCommentDrawerOpen"
        :curr-item="currItem"
        :type="config.type ?? 'inbox'"
        :user="user"
        :user-lookup="config.userLookup"
        :on-comment="config.onComment"
      />

      <SwiperFollowersDrawer
        v-if="config.type === 'inbox' && currItem"
        v-model:open="isFollowerDrawerOpen"
        :followers="currItem.followers || []"
        :user="user"
        :user-lookup="config.userLookup"
      />
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IonModal } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { onLongPress, useEventListener } from "@vueuse/core";
import { register } from "swiper/element/bundle";
import { playSelectionTick } from "@/config/post.config";

import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { fetchPostComments } from "@/service/api/post.api";
import { EventBus } from "@/main";
import router from "@/router";

import PhotoSwiperItem from "@/components/photoswiper/PhotoSwiperItem.vue";
import PhotoSwiperHeader from "@/components/photoswiper/PhotoSwiperHeader.vue";
import PhotoSwiperFooter from "@/components/photoswiper/PhotoSwiperFooter.vue";
import SwiperCommentDrawer from "@/components/photoswiper/SwiperCommentDrawer.vue";
import SwiperFollowersDrawer from "@/components/photoswiper/SwiperFollowersDrawer.vue";
import ReactionBurst from "@/components/general/ReactionBurst.vue";
import ReactionPopover from "@/components/general/ReactionPopover.vue";

register();

// How many comments to pull for the on-image preview. The overlay shows the
// most recent few; the full thread lives in the comment drawer.
const COMMENT_PREVIEW_LIMIT = 6;

const swiperStore = usePhotoSwiper();
const { open, slide, collection, config, isCommentDrawerOpen } =
	storeToRefs(swiperStore);
const { user } = storeToRefs(useAuthStore());
const { updateSlide } = storeToRefs(useSessionStore());

const currItem = computed(() => collection.value[slide.value] || null);

const showComments = ref(true);
// Tap the art to get the bars out of the way, tap again to bring them back —
// the gallery-app convention.
const chromeVisible = ref(true);
// Gates the chrome Transitions' CSS. Only a tap turns this on, so the bars are
// painted in place when the viewer opens and only ever slide in response to the
// gesture that's supposed to move them.
const chromeAnimated = ref(false);
let tapTimer: ReturnType<typeof setTimeout> | null = null;
const isFollowerDrawerOpen = ref(false);
const swiper = ref<any>();
const reactionBurst = ref<{ play: (r: string) => void } | null>(null);

const canDelete = computed(() => {
	if (!user.value || !currItem.value) return false;
	if (config.value.canDelete)
		return config.value.canDelete(currItem.value, user.value);
	return (
		currItem.value.sender === user.value._id ||
		currItem.value.author_id === user.value._id
	);
});

// Resolved per SLIDE, not per collection. The footer's remix button used to be
// driven by a static `canReply: true`, so a post whose author disabled remixing
// still offered it in fullscreen even though the feed card hides it.
const canReply = computed(() => {
	const c = config.value.canReply;
	if (!c || !currItem.value) return false;
	if (typeof c === "function") return c(currItem.value, user.value);
	return true;
});

function handleSlideChange(event: any) {
	const s = event.target?.swiper;
	// `!s.activeIndex` also rejected index 0, so swiping back to the first item
	// never updated `slide` — the header/footer/comments kept showing item 1.
	if (!open.value || !s || typeof s.activeIndex !== "number") return;
	slide.value = s.activeIndex;
}

watch(
	collection,
	(first, second) => {
		if (first?.length == second?.length || !updateSlide.value) return;
		nextTick(() => swiper.value?.swiper?.update());
		updateSlide.value = false;
	},
	{ deep: true },
);

// Swiper fires `tap` for the first tap of a double-tap too, so hold the toggle
// for one double-tap interval and let `doubleTap` (zoom) cancel it — otherwise
// zooming in also flashes the chrome off.
function onSwiperTap() {
	if (isCommentDrawerOpen.value || isFollowerDrawerOpen.value) return;
	// Releasing a long press still produces swiper's `tap`, so without this the
	// gesture that opened the reaction tray ALSO toggled the chrome away
	// underneath it. Consume exactly one tap, then go back to normal.
	if (suppressNextTap) {
		suppressNextTap = false;
		return;
	}
	if (longPressPopoverOpen.value) return;
	if (tapTimer) clearTimeout(tapTimer);
	tapTimer = setTimeout(() => {
		// Arm the transition only now — this is the one path that should animate.
		chromeAnimated.value = true;
		chromeVisible.value = !chromeVisible.value;
		tapTimer = null;
	}, 260);
}

function onSwiperDoubleTap() {
	if (tapTimer) {
		clearTimeout(tapTimer);
		tapTimer = null;
	}
}

const keyboardListener = (event: KeyboardEvent) => {
	event.stopPropagation();
	if (isCommentDrawerOpen.value || isFollowerDrawerOpen.value) return;
	if (event.key === "Escape") close();
	else if (event.key === "ArrowRight") swiper.value?.swiper?.slideNext();
	else if (event.key === "ArrowLeft") swiper.value?.swiper?.slidePrev();
};

function close() {
	open.value = false;
	swiper.value?.swiper?.zoom?.out();
	window.removeEventListener("keydown", keyboardListener);

	// Reset the chrome so the next open starts with the bars up and unanimated.
	// `keep-contents-mounted` means this component is never torn down, so any
	// state left behind here is state the next open inherits — a viewer closed
	// with the UI hidden would otherwise reopen hidden.
	if (tapTimer) {
		clearTimeout(tapTimer);
		tapTimer = null;
	}
	chromeVisible.value = true;
	chromeAnimated.value = false;
}

/**
 * Load the latest comments for the current POST so the on-image CommentPreview
 * has something to show.
 *
 * The previous call was `fetchPostComments(id, 1, 5)`, but the signature is
 * `(postId, limit, beforeDate)` — so it asked for limit=1 and passed 5 as
 * beforeDate. Server-side that became `createdAt <= new Date("5")` (May 2001),
 * which matched nothing, so posts ALWAYS came back with zero comments and the
 * preview never appeared. Correct call is limit-only.
 */
async function prefetchComments() {
	const item = currItem.value;
	if (!item || config.value.type !== "post" || item.commentsLoaded) return;
	try {
		const res = await fetchPostComments(item._id, COMMENT_PREVIEW_LIMIT);
		item.comments = res.comments || [];
		item.commentsLoaded = true;
	} catch (e) {
		console.error("Failed to pre-fetch comments", e);
	}
}

async function onDidPresent() {
	// Belt and braces alongside the reset in close(): the modal can also be
	// dismissed by swipe or hardware back, which don't all route through close().
	chromeVisible.value = true;
	chromeAnimated.value = false;
	window.addEventListener("keydown", keyboardListener);

	// The `currItem` watcher doesn't fire for the post the swiper OPENS on when
	// that item was already the current one, so prefetch here too — otherwise
	// the first post you open is the one with no comments.
	await prefetchComments();

	const swiperEl = swiper.value?.swiper;
	if (!swiperEl) return;

	swiperEl.update();
	swiperEl.slideTo(slide.value, 0, false);

	if (config.value.onSeen && currItem.value)
		config.value.onSeen(currItem.value);
}

watch(currItem, async () => {
	if (!currItem.value || !open.value) return;
	if (config.value.onSeen) config.value.onSeen(currItem.value);

	await prefetchComments();
});

EventBus.on("goToSlide", () => {
	nextTick(() => swiper.value?.swiper?.slideTo(slide.value, 0));
	if (config.value.onSeen && currItem.value)
		config.value.onSeen(currItem.value);
	const query = router.currentRoute.value.query;
	isCommentDrawerOpen.value = query.comments === "true";
	setTimeout(() => router.replace({ query: undefined }), 100);
});

function handleReply() {
	if (config.value.onReply) {
		config.value.onReply(currItem.value);
	}
}

function handleDelete() {
	if (config.value.onDelete) {
		config.value.onDelete(currItem.value);
		slide.value = Math.max(0, slide.value - 1);
		open.value = false;
	}
}

function handleReact(type: string) {
	reactionBurst.value?.play(type);
	if (config.value.onReact) config.value.onReact(currItem.value, type);
}

// ── Long-press to react ────────────────────────────────────────────────────
const artSurface = ref<HTMLElement | null>(null);
const longPressPopoverOpen = ref(false);
const longPressEvent = ref<Event | null>(null);
// Set the moment the press fires, cleared by the tap it inevitably generates.
// Plain `let`, not a ref — nothing renders from it.
let suppressNextTap = false;

/**
 * Inspecting the drawing and reacting to it are different intents that share
 * one gesture surface, so the press has to know which one is in flight.
 *
 * Two signals, both read at fire time (400ms in) rather than at pointerdown,
 * because that's when the user's intent is actually knowable:
 *
 *  - MULTI-TOUCH. A pinch is two fingers, and the first of them looks exactly
 *    like the start of a long press. `distanceThreshold` doesn't save us: the
 *    anchoring finger of a pinch barely travels, so the press survives the
 *    whole zoom gesture and the tray pops up mid-pinch.
 *  - ALREADY ZOOMED. Past 1× the surface belongs to panning. Holding still for
 *    a beat before dragging is normal panning behaviour, and it was arming the
 *    tray every time. Reacting stays available — pinch back out (or double-tap)
 *    and the press works again.
 */
const activePointers = new Set<number>();
const onArtPointerDown = (e: PointerEvent) => activePointers.add(e.pointerId);
const onArtPointerUp = (e: PointerEvent) => activePointers.delete(e.pointerId);

useEventListener(artSurface, "pointerdown", onArtPointerDown, { passive: true });
useEventListener(artSurface, "pointerup", onArtPointerUp, { passive: true });
useEventListener(artSurface, "pointercancel", onArtPointerUp, { passive: true });

const isZoomedIn = () => (swiper.value?.swiper?.zoom?.scale ?? 1) > 1.01;

// How far above the finger the tray floats, so it isn't under the thumb.
const REACTION_POPOVER_SPACING = 20;

// Dropping the flag here too: if the press ends without swiper ever emitting a
// tap (finger lifted over the tray, popover dismissed by backdrop), a stale
// `true` would silently eat the user's next real tap on the artwork.
function closeLongPressPopover() {
	longPressPopoverOpen.value = false;
	suppressNextTap = false;
}

function onLongPressReaction(type: string) {
	closeLongPressPopover();
	handleReact(type);
}

onLongPress(
	artSurface,
	(e: PointerEvent) => {
		// Reactions are a post concept; inbox drawings have no reaction bar.
		if (config.value.type !== "post" || !currItem.value) return;
		if (isCommentDrawerOpen.value || isFollowerDrawerOpen.value) return;
		// Pinching or panning a zoomed drawing — this press is navigation, not a
		// reaction. Bail BEFORE touching suppressNextTap, or the tap that ends the
		// gesture gets eaten and the chrome toggle stops responding.
		if (activePointers.size > 1 || isZoomedIn()) return;

		// A long press is also the first half of a tap as far as swiper is
		// concerned. Kill the pending toggle AND arm the one-shot suppression, or
		// the tray opens and the chrome disappears behind it in the same gesture.
		if (tapTimer) {
			clearTimeout(tapTimer);
			tapTimer = null;
		}
		suppressNextTap = true;

		playSelectionTick();

		// A SYNTHETIC anchor, not the raw event — the same trick CommunityFeed
		// uses. ion-popover positions itself against `event.target`, and here the
		// target is a swiper slide: it's transformed on every swipe and recycled
		// between slides, so anchoring to it made the tray land in the wrong place
		// or vanish outright as soon as swiper touched the element. A bare rect at
		// the finger has nothing to be invalidated by.
		const x = e.clientX ?? 0;
		const y = e.clientY ?? 0;
		longPressEvent.value = {
			target: {
				getBoundingClientRect: () => ({
					left: x,
					top: y - REACTION_POPOVER_SPACING,
					right: x,
					bottom: y,
					width: 0,
					height: 0,
				}),
			},
		} as any;
		longPressPopoverOpen.value = true;
	},
	{
		delay: 400,
		// No `prevent` here, unlike FeedPostCard: this surface owns swipe and
		// pinch-zoom, and preventing the default on pointerdown kills both.
		// distanceThreshold cancels the press as soon as the finger travels, so a
		// swipe never arms the tray.
		distanceThreshold: 10,
	},
);

function resolveImage(item: any) {
	if (!config.value.imageResolver) return;
	return config.value.imageResolver(item);
}

function resolveThumbnail(item: any) {
	if (!config.value.thumbnailResolver) return;
	return config.value.thumbnailResolver(item);
}
</script>

<style scoped>
ion-modal.liquid-photoswiper {
  --background: black;
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
}

.chrome-top-enter-active,
.chrome-top-leave-active,
.chrome-bottom-enter-active,
.chrome-bottom-leave-active {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;
  will-change: transform, opacity;
}

.chrome-top-enter-from,
.chrome-top-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.chrome-bottom-enter-from,
.chrome-bottom-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chrome-top-enter-active,
  .chrome-top-leave-active,
  .chrome-bottom-enter-active,
  .chrome-bottom-leave-active {
    transition: opacity 120ms linear;
  }

  .chrome-top-enter-from,
  .chrome-top-leave-to,
  .chrome-bottom-enter-from,
  .chrome-bottom-leave-to {
    transform: none;
  }
}
</style>