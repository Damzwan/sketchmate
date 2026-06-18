<template>
  <section class="min-h-[300px] pb-10 max-w-2xl mx-auto overflow-visible">
    <!-- Header Subhead Segment -->
    <div class="flex items-center justify-between px-1 mb-4 pt-2">
      <h2 class="text-xs uppercase tracking-widest font-black text-black/40">
        Community Vibes
      </h2>
    </div>

    <transition name="fade-slow" mode="out-in">
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
          class="h-12 w-full flex justify-center items-center"
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
          class="pt-6 pb-10 text-center"
        >
          <div class="inline-block p-8 bg-tertiary border border-dashed border-primary/80 rounded-[2.5rem] shadow-sm max-w-xs mx-auto">
            <div class="text-3xl mb-3">🎨</div>
            <h3 class="cabin-sketch-regular text-xl font-black text-black tracking-tight leading-none mb-1.5">
              You're all caught up!
            </h3>
            <p class="text-[11px] font-bold text-black/40 uppercase tracking-wider leading-relaxed">
              No more scrolling :)
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Unified Floating Dynamic Reaction Picker Popover -->
    <ion-popover
      :is-open="popoverOpen"
      :event="popoverEvent"
      @didDismiss="popoverOpen = false"
      :show-backdrop="false"
      class="liquid-popover"
      side="top"
      alignment="center"
    >
      <div class="flex items-center px-2 py-1.5 space-x-1 animate-pop-in overflow-visible">
        <button
          v-for="(imgSrc, type) in reactionImages"
          :key="type"
          @click="selectReaction(type)"
          class="group relative w-11 h-11 p-1 transition-all duration-300 hover:scale-125 active:scale-90"
        >
          <img
            :src="imgSrc"
            class="h-full w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:-translate-y-1.5"
            alt="reaction"
          />

          <!-- Current Selection Dot Indicator -->
          <div
            v-if="activePopoverPost?.user_reaction === type"
            class="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-secondary animate-pulse"
          />
        </button>
      </div>
    </ion-popover>

    <!-- Comments Drawer Slide Controller -->
    <PostCommentDrawer
      :is-open="isCommentsOpen"
      :post="activePost"
      @close="isCommentsOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
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
	const x =
		event.clientX || (event.touches && event.touches[0].clientX) || event.pageX;
	const y =
		event.clientY || (event.touches && event.touches[0].clientY) || event.pageY;

	popoverEvent.value = {
		target: {
			getBoundingClientRect: () => ({
				left: x,
				top: y,
				right: x,
				bottom: y,
				width: 0,
				height: 0,
			}),
		},
	} as any;
	popoverOpen.value = true;
};

const selectReaction = async (type: string) => {
	popoverOpen.value = false;
	if (!activePopoverPost.value) return;
	try {
		await postStore.toggleReactionLocally(activePopoverPost.value._id, type);
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

watch(
	user,
	(newVal) => {
		if (!newVal) return;
		if (posts.value.length === 0 || isFeedDirty.value) {
			postStore.getFeed().finally(() => {
				loading.value = false;
			});
		} else {
			loading.value = false;
		}
	},
	{ immediate: true },
);

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
  0% { opacity: 0; transform: scale(0.85) translateY(6px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-pop-in {
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.fade-slow-enter-active, .fade-slow-leave-active { transition: opacity 0.3s ease; }
.fade-slow-enter-from, .fade-slow-leave-to { opacity: 0; }
</style>