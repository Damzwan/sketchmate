<template>
  <section
    ref="rootEl"
    class="min-h-[300px] pb-10 max-w-2xl mx-auto overflow-visible"
  >
    <!-- Header Subhead Segment -->
    <div class="flex items-center justify-between px-1 mb-3 pt-2">
      <h2 class="uppercase tracking-widest font-black text-black/80">
        Community Vibes
      </h2>
    </div>

    <!-- Feed tabs. Each is its own capped fetch — no infinite scroll anywhere. -->
    <div v-if="!feedOff" class="flex gap-1.5 mb-4 px-0.5">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        @click="selectTab(tab.id)"
        class="flex-1 py-2 px-1 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer border"
        :class="activeTab === tab.id
          ? 'bg-secondary text-white border-secondary shadow-sm'
          : 'bg-tertiary text-black/70 border-primary/40'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Feed turned off in Settings — keep home clean, just a gentle pointer. -->
    <div
      v-if="feedOff"
      class="mt-1 p-6 rounded-[2rem] border border-dashed border-primary/60 bg-tertiary text-center"
    >
      <p class="cabin-sketch-regular text-xl font-black text-black mb-1.5">Your feed is off</p>
      <p class="text-base text-black/80 leading-snug">
        Turn it back on from Settings → Home feed to see posts from your mates.
      </p>
    </div>

    <transition v-else name="fade-slow" mode="out-in">
      <!-- Loading Shimmer State Cards -->
      <div v-if="loading" key="loading" class="space-y-6">
        <div
          v-for="i in 2"
          :key="i"
          class="w-full bg-tertiary rounded-[2.5rem] border border-black/5 animate-pulse h-[420px]"
        />
      </div>

      <!-- Nothing in this tab yet (usually Mates before you've added any) -->
      <div
        v-else-if="posts.length === 0"
        key="empty"
        class="mt-1 p-6 rounded-[2rem] border border-dashed border-primary/60 bg-tertiary text-center"
      >
        <p class="cabin-sketch-regular text-xl font-black text-black mb-1.5">
          {{ emptyState.title }}
        </p>
        <p class="text-base text-black/80 leading-snug">{{ emptyState.body }}</p>
      </div>

      <!-- Main Activity Stream List -->
      <div v-else :key="`data-${activeTab}`" class="space-y-6 overflow-visible">
        <FeedPostCard
          v-for="post in posts"
          :key="post._id"
          :ref="(el: any) => registerPostRef(el, post._id)"
          :post="post"
          :is-mine="post.author_id === user?._id"
          @open-comments="openComments"
          @open-reaction-popover="handleOpenReactionPopover"
          @open-reaction-breakdown="openReactionBreakdown"
          @open-fullscreen="handleOpenFullscreen"
          @delete-post="handleDelete"
        />

        <!-- End of Feed Tactile Caught-Up Graphics Block.
             There is deliberately no load-more trigger here: the feed is one
             capped fetch per tab, and it ends. -->
        <div v-if="!loading" class="pb-2 text-center pt-2">
          <div
            class="inline-block p-8 bg-tertiary border border-dashed border-primary/80 rounded-[2.5rem] shadow-sm max-w-xs mx-auto mb-4">
            <h3 class="cabin-sketch-regular text-xl font-black text-black tracking-tight leading-none mb-1.5">
              You're all caught up!
            </h3>
            <p class="text-[11px] text-black/80 uppercase tracking-wider leading-relaxed">
              No more scrolling :)
            </p>
          </div>
        </div>
      </div>
    </transition>

    <ReactionPopover
      :is-open="popoverOpen"
      :event="popoverEvent"
      :user-reaction="activePopoverPost?.user_reaction || undefined"
      @close="closeReactionPopover"
      @select="selectReaction"
    />

    <!-- Comments Drawer Slide Controller -->
    <PostCommentDrawer
      :is-open="isCommentsOpen"
      :post="activePost"
      @close="isCommentsOpen = false"
    />

    <!-- One sheet for the feed. It used to be instantiated once per post. -->
    <ReactionBreakdownSheet
      v-if="reactionSheetPost"
      :is-open="reactionSheetOpen"
      :post="reactionSheetPost"
      @close="reactionSheetOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, onUnmounted, ref, watch } from "vue";
import ReactionBreakdownSheet from "@/components/general/ReactionBreakdownSheet.vue";
import ReactionPopover from "@/components/general/ReactionPopover.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import PostCommentDrawer from "@/components/home/posts/PostCommentDrawer.vue";
import { useOverlayScrollGuard } from "@/composables/general/useOverlayScrollGuard";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { syncPostQuotaResetReminder } from "@/helper/notification.helper";
import { deletePost, type FeedTab, logPostViews } from "@/service/api/post.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { usePostStore } from "@/store/post.store";
import { useQuotaStore } from "@/store/quota.store";
import { FeedPost } from "@/types/server.types";

const authStore = useAuthStore();
const postStore = usePostStore();
const quotaStore = useQuotaStore();
const photoSwiperStore = usePhotoSwiper();
const { openPostSwiper } = usePostSwiper();
const { toast } = useToast();

const { user } = storeToRefs(authStore);
const { feedByTab, fetchedTabs, isFeedDirty } = storeToRefs(postStore);
const { open: photoSwiperOpen } = storeToRefs(photoSwiperStore);

const TABS: { id: FeedTab; label: string }[] = [
	{ id: "for_you", label: "For You" },
	{ id: "mates", label: "Mates" },
	{ id: "latest", label: "Latest" },
];

const activeTab = ref<FeedTab>("for_you");
const posts = computed(() => feedByTab.value[activeTab.value]);

const EMPTY_STATES: Record<FeedTab, { title: string; body: string }> = {
	for_you: {
		title: "Nothing here yet",
		body: "Once people start posting, their drawings will show up here.",
	},
	mates: {
		title: "No posts from mates",
		body: "Add a few mates or follow some artists, and their drawings land here.",
	},
	latest: {
		title: "Nothing new",
		body: "No fresh posts right now. Check back a little later.",
	},
};
const emptyState = computed(() => EMPTY_STATES[activeTab.value]);

const loading = ref(true);

const isCommentsOpen = ref(false);
const activePost = ref<FeedPost | null>(null);
const reactionSheetOpen = ref(false);
const reactionSheetPost = ref<FeedPost | null>(null);

const openReactionBreakdown = (post: FeedPost) => {
	reactionSheetPost.value = post;
	reactionSheetOpen.value = true;
};

const popoverOpen = ref(false);
const popoverEvent = ref<Event | null>(null);
const activePopoverPost = ref<FeedPost | null>(null);
const REACTION_POPOVER_SPACING = 10;

// Ionic restores focus after an overlay closes, while fullscreen comment
// prefetching and first reactions can also change the card's height underneath
// it. Hold both scrollTop and Chromium's scroll anchor for the full overlay
// lifetime, then keep pinning through the dismissal/update frames.
const rootEl = ref<HTMLElement | null>(null);
const { captureOverlayScroll, guardScroll, stopScrollGuard, endOverlay } =
	useOverlayScrollGuard(rootEl);

function closeReactionPopover() {
	popoverOpen.value = false;
	// `close` is emitted on ion-popover's didDismiss. At this point the
	// animation is over, so only cover the final focus-restoration frames.
	endOverlay();
}

const openComments = (post: FeedPost) => {
	activePost.value = post;
	isCommentsOpen.value = true;
};

const handleOpenReactionPopover = async ({
	event,
	post,
}: {
	event: any;
	post: FeedPost;
}) => {
	// Read the coordinates before awaiting: touch lists are short-lived.
	const x =
		event.clientX || (event.touches && event.touches[0].clientX) || event.pageX;
	const y =
		event.clientY || (event.touches && event.touches[0].clientY) || event.pageY;

	await captureOverlayScroll();
	activePopoverPost.value = post;
	popoverEvent.value = {
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
	popoverOpen.value = true;
	guardScroll(300);
};

const selectReaction = async (type: string) => {
	popoverOpen.value = false;
	if (!activePopoverPost.value) return;
	const post = activePopoverPost.value;
	// Fallback while the popover dismisses. Its didDismiss handler above
	// shortens this immediately once Ionic has actually released the overlay.
	guardScroll(450, true);
	const isRemoving = post.user_reaction === type;
	trackEvent(mixpanelEvents.postReact, {
		post_id: post._id,
		author_id: post.author_id,
		reaction_type: type,
		removed: isRemoving,
		is_own_post: post.author_id === user.value?._id,
	});
	try {
		await postStore.toggleReactionLocally(post._id, type);
	} catch (e) {
		console.error("Reaction sync failed", e);
	}
};

let feedFullscreenOpen = false;

const handleOpenFullscreen = async (post: FeedPost) => {
	await captureOverlayScroll();
	feedFullscreenOpen = true;
	openPostSwiper([post], 0);
	guardScroll(350);
};

watch(photoSwiperOpen, (open) => {
	if (open || !feedFullscreenOpen) return;
	feedFullscreenOpen = false;
	// The store closes at will-dismiss. A normal Ionic dismissal is ~300 ms;
	// leave only a small buffer instead of swallowing input for almost a second.
	// Any real pointer/touch/wheel intent cancels this fallback immediately.
	guardScroll(450, true);
});

const handleDelete = async (post: FeedPost) => {
	try {
		const { post_quota } = await deletePost(post._id);
		const currentPostQuota = await quotaStore.syncPostQuota(post_quota);
		void syncPostQuotaResetReminder(currentPostQuota);
		postStore.removePostLocally(post._id);
		toast("Post deleted");
	} catch (e) {
		toast("Failed to delete", { color: "danger" });
	}
};

/* --- LOGICAL INTERSECTION VIEW OBSERVERS --- */
const pendingViewSync = new Set<string>();
const postElements = new Map<string, HTMLElement>();
const postObservers = new Map<
	string,
	{ stop: () => void; timer: ReturnType<typeof setTimeout> | null }
>();
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

const flushViewSync = async () => {
	if (syncTimeout) clearTimeout(syncTimeout);
	syncTimeout = null;
	if (pendingViewSync.size === 0) return;

	const idsToSync = Array.from(pendingViewSync);
	pendingViewSync.clear();
	try {
		await logPostViews(idsToSync);
	} catch (e) {
		console.error("View sync failed", e);
	}
};

const scheduleViewSync = () => {
	if (syncTimeout) return;
	syncTimeout = setTimeout(() => void flushViewSync(), 3000);
};

const stopPostObserver = (postId: string) => {
	const observer = postObservers.get(postId);
	if (observer?.timer) clearTimeout(observer.timer);
	observer?.stop();
	postObservers.delete(postId);
	postElements.delete(postId);
};

const stopAllPostObservers = () => {
	for (const postId of [...postObservers.keys()]) stopPostObserver(postId);
};

const registerPostRef = (el: any, postId: string) => {
	if (!el) {
		stopPostObserver(postId);
		return;
	}
	const target =
		el.$el instanceof HTMLElement
			? el.$el
			: el instanceof HTMLElement
				? el
				: null;
	if (!target || postElements.has(postId)) return;

	postElements.set(postId, target);
	let timer: ReturnType<typeof setTimeout> | null = null;

	const { stop } = useIntersectionObserver(
		target,
		([{ isIntersecting }]) => {
			if (postStore.hasViewedFeedPost(postId)) {
				stopPostObserver(postId);
				return;
			}
			if (isIntersecting && !timer) {
				timer = setTimeout(() => {
					if (postStore.markFeedPostViewed(postId)) {
						pendingViewSync.add(postId);
						scheduleViewSync();
					}
					stopPostObserver(postId);
				}, 1500);
				const observer = postObservers.get(postId);
				if (observer) observer.timer = timer;
			} else if (timer) {
				clearTimeout(timer);
				timer = null;
				const observer = postObservers.get(postId);
				if (observer) observer.timer = null;
			}
		},
		{ threshold: 0.6 },
	);
	postObservers.set(postId, { stop, timer });
};

// 'off' hides the feed entirely — no fetch, a small placeholder instead.
const feedOff = computed(() => user.value?.feed_level === "off");

function loadFeedIfNeeded() {
	if (!user.value) return;
	if (feedOff.value) {
		postStore.resetFeeds();
		loading.value = false;
		return;
	}
	// Already pulled this tab and nothing invalidated it — keep what's on screen.
	// Refetching on every visit would reshuffle the page under someone who just
	// scrolled down it.
	if (fetchedTabs.value[activeTab.value] && !isFeedDirty.value) {
		loading.value = false;
		return;
	}
	loading.value = true;
	postStore.getFeed(activeTab.value).finally(() => {
		loading.value = false;
	});
}

function selectTab(tab: FeedTab) {
	if (tab === activeTab.value) return;
	activeTab.value = tab;
	// Switching tabs detaches every card. Stop observers and visibility timers
	// rather than leaving closures holding the old card elements.
	stopAllPostObservers();
	trackEvent(mixpanelEvents.feedTabSwitched, { tab });
	loadFeedIfNeeded();
}

watch(user, loadFeedIfNeeded, { immediate: true });

// Flipping the level preference (usually done from Settings while Home sits in
// the background) only marks the feed dirty + clears it if turned off. The
// actual re-pull happens when we land back on Home, below.
watch(
	() => user.value?.feed_level,
	() => {
		postStore.markFeedDirty();
		if (feedOff.value) {
			postStore.resetFeeds();
			loading.value = false;
		}
	},
);

// Coming back to Home: if the preference changed (feed dirty) re-fetch so a
// just-enabled feed shows immediately instead of staying blank. Ionic view
// lifecycle hooks don't reliably fire in nested children, so the Home page
// drives this via its own onIonViewDidEnter → exposed below.
function reloadIfDirty() {
	if (!isFeedDirty.value) return;
	loading.value = !feedOff.value;
	loadFeedIfNeeded();
}

defineExpose({ reloadIfDirty });

onUnmounted(() => {
	stopScrollGuard();
	stopAllPostObservers();
	void flushViewSync();
});
</script>

<style scoped>
ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
  --width: auto;
  overflow: visible;
}

@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-pop-in {
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 0.3s ease;
}

.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
}
</style>
