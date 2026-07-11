<template>
  <section ref="rootEl" class="min-h-[300px] pb-10 max-w-2xl mx-auto overflow-visible">
    <!-- Header Subhead Segment -->
    <div class="flex items-center justify-between px-1 mb-4 pt-2">
      <h2 class="uppercase tracking-widest font-black text-black/80">
        Community Vibes
      </h2>
    </div>

    <!-- Feed turned off in Settings — keep home clean, just a gentle pointer. -->
    <div
      v-if="feedOff"
      class="mt-1 p-6 rounded-[2rem] border border-dashed border-primary/60 bg-tertiary text-center"
    >
      <p class="cabin-sketch-regular text-xl font-black text-black leading-none mb-1.5">Your feed is off</p>
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

      <!-- Main Activity Stream List -->
      <div v-else key="data" class="space-y-6 overflow-visible">
        <FeedPostCard
          v-for="post in posts"
          :key="post._id"
          :ref="(el: any) => registerPostRef(el, post._id)"
          :post="post"
          :is-mine="post.author_id === user?._id"
          @open-comments="openComments"
          @open-reaction-popover="handleOpenReactionPopover"
          @delete-post="handleDelete"
        />

        <!-- Infinite Scrolling Trigger Zone -->
        <div
          ref="loadMoreTrigger"
          class="h-8 w-full flex justify-center items-center"
        >
          <ion-spinner
            v-if="!loading && hasMore"
            name="dots"
            class="text-secondary w-6 h-6"
          />
        </div>

        <!-- End of Feed Tactile Caught-Up Graphics Block -->
        <div
          v-if="!loading && posts.length > 0 && !hasMore"
          class="pb-2 text-center"
        >
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
      :user-reaction="activePopoverPost?.user_reaction"
      @close="closeReactionPopover"
      @select="selectReaction"
    />

    <!-- Comments Drawer Slide Controller -->
    <PostCommentDrawer
      :is-open="isCommentsOpen"
      :post="activePost"
      @close="isCommentsOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { IonSpinner, IonPopover } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useIntersectionObserver } from "@vueuse/core";

import { useAuthStore } from "@/store/auth.store";
import { usePostStore } from "@/store/post.store";
import { useToast } from "@/service/toast.service";
import { logPostViews, deletePost } from "@/service/api/post.api";
import { FeedPost } from "@/types/server.types";
import { reactionImages } from "@/config/post.config";

import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import PostCommentDrawer from "@/components/home/posts/PostCommentDrawer.vue";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import ReactionPopover from "@/components/general/ReactionPopover.vue";

const authStore = useAuthStore();
const postStore = usePostStore();
const { toast } = useToast();

const { user } = storeToRefs(authStore);
const { feedPosts: posts, isFeedDirty } = storeToRefs(postStore);

const loading = ref(true);
const hasMore = ref(false);

const isCommentsOpen = ref(false);
const activePost = ref<FeedPost | null>(null);

const popoverOpen = ref(false);
const popoverEvent = ref<Event | null>(null);
const activePopoverPost = ref<FeedPost | null>(null);
const REACTION_POPOVER_SPACING = 10;

// Opening the reaction ion-popover makes Ionic yank the surrounding ion-content
// scroll (focus/positioning side-effect), sometimes all the way to the top. We
// snapshot the scroll offset when the picker opens and pin it back for a few
// frames across present + dismiss so the feed stays exactly where the user was.
const rootEl = ref<HTMLElement | null>(null);
let scrollEl: HTMLElement | null = null;
let savedScrollTop = 0;

async function resolveScrollEl(): Promise<HTMLElement | null> {
	if (scrollEl?.isConnected) return scrollEl;
	const content = rootEl.value?.closest("ion-content") as any;
	scrollEl = content?.getScrollElement
		? await content.getScrollElement()
		: null;
	return scrollEl;
}

function pinScroll() {
	if (
		scrollEl?.isConnected &&
		Math.abs(scrollEl.scrollTop - savedScrollTop) > 2
	)
		scrollEl.scrollTop = savedScrollTop;
}

function guardScrollWhileOpening() {
	// Cover the present animation window; each pin snaps back if Ionic moved it.
	requestAnimationFrame(pinScroll);
	setTimeout(pinScroll, 60);
	setTimeout(pinScroll, 160);
	setTimeout(pinScroll, 300);
}

function closeReactionPopover() {
	popoverOpen.value = false;
	pinScroll();
}

const openComments = (post: FeedPost) => {
	activePost.value = post;
	isCommentsOpen.value = true;
};

const handleOpenReactionPopover = ({
	event,
	post,
}: {
	event: any;
	post: FeedPost;
}) => {
	activePopoverPost.value = post;
	// Snapshot scroll before Ionic can move it, then keep it pinned while opening.
	savedScrollTop = scrollEl?.isConnected ? scrollEl.scrollTop : 0;
	const x =
		event.clientX || (event.touches && event.touches[0].clientX) || event.pageX;
	const y =
		event.clientY || (event.touches && event.touches[0].clientY) || event.pageY;

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
	guardScrollWhileOpening();
};

const selectReaction = async (type: string) => {
	popoverOpen.value = false;
	if (!activePopoverPost.value) return;
	const post = activePopoverPost.value;
	pinScroll();
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

const handleDelete = async (post: FeedPost) => {
	try {
		await deletePost(post._id);
		postStore.removePostLocally(post._id);
		toast("Post deleted");
	} catch (e) {
		toast("Failed to delete", { color: "danger" });
	}
};

/* --- LOGICAL INTERSECTION VIEW OBSERVERS --- */
const viewedPosts = new Set<string>();
const pendingViewSync = new Set<string>();
const postElements = new Map<string, HTMLElement>();
let syncTimeout: any = null;

const scheduleViewSync = () => {
	if (syncTimeout) return;
	syncTimeout = setTimeout(async () => {
		if (pendingViewSync.size === 0) return;
		const idsToSync = Array.from(pendingViewSync);
		pendingViewSync.clear();
		syncTimeout = null;
		try {
			await logPostViews(idsToSync);
		} catch (e) {
			console.error("View sync failed", e);
		}
	}, 3000);
};

const registerPostRef = (el: any, postId: string) => {
	if (!el) return;
	const target =
		el.$el instanceof HTMLElement
			? el.$el
			: el instanceof HTMLElement
				? el
				: null;
	if (!target || postElements.has(postId)) return;

	postElements.set(postId, target);
	let timer: any = null;

	const { stop } = useIntersectionObserver(
		target,
		([{ isIntersecting }]) => {
			if (viewedPosts.has(postId)) {
				stop();
				return;
			}
			if (isIntersecting) {
				timer = setTimeout(() => {
					if (!viewedPosts.has(postId)) {
						viewedPosts.add(postId);
						pendingViewSync.add(postId);
						scheduleViewSync();
						stop();
					}
				}, 1500);
			} else if (timer) {
				clearTimeout(timer);
			}
		},
		{ threshold: 0.6 },
	);
};

// 'off' hides the feed entirely — no fetch, a small placeholder instead.
const feedOff = computed(() => user.value?.feed_level === "off");

function loadFeedIfNeeded() {
	if (!user.value) return;
	if (feedOff.value) {
		posts.value = [];
		loading.value = false;
		return;
	}
	if (posts.value.length === 0 || isFeedDirty.value) {
		postStore.getFeed().finally(() => {
			loading.value = false;
		});
	} else {
		loading.value = false;
	}
}

watch(user, loadFeedIfNeeded, { immediate: true });

// Re-pull (or clear) the feed when the level preference flips.
watch(
	() => user.value?.feed_level,
	() => {
		postStore.markFeedDirty();
		loading.value = !feedOff.value;
		loadFeedIfNeeded();
	},
);

onMounted(() => {
	// Warm the scroll-element handle so the reaction picker can read/pin scroll
	// synchronously on first use.
	void resolveScrollEl();
});

onUnmounted(() => {
	if (syncTimeout) clearTimeout(syncTimeout);
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