<template>
  <section class="min-h-[300px] pb-10 max-w-2xl mx-auto">
    <div class="flex items-center justify-between px-4 mb-6 pt-4">
      <h2
        class="text-2xl font-black text-black tracking-tight italic drop-shadow-sm cabin-sketch-regular"
      >
        Community Vibes
      </h2>
    </div>

    <transition name="fade-slow" mode="out-in">
      <div
        v-if="loading"
        key="loading"
        class="space-y-10 px-4"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="w-full bg-primary/20 rounded-[2.5rem] animate-pulse border border-primary/30 h-[450px]"
        />
      </div>

      <div
        v-else
        key="data"
        class="px-4 space-y-2"
      >
        <FeedPostCard
          v-for="post in posts"
          :key="post._id"
          :ref="(el) => registerPostRef(el, post._id)"
          :post="post"
          :is-mine="post.author_id === user?._id"
          @open-comments="openComments"
          @open-reaction-popover="handleOpenReactionPopover"
          @delete-post="handleDelete"
        />

        <div
          ref="loadMoreTrigger"
          class="h-10 w-full flex justify-center items-center"
        >
          <ion-spinner
            v-if="!loading && hasMore"
            name="bubbles"
            color="secondary"
          />
        </div>

        <div
          v-if="!loading && posts.length > 0 && !hasMore"
          class="py-12 px-6 text-center animate-fade-in"
        >
          <div class="inline-block p-6 bg-white/40 border-2 border-dashed border-black/10 rounded-[2.5rem] shadow-inner">
            <div class="text-4xl mb-4 rotate-[-5deg]">🎨</div>
            <h3 class="text-xl font-black text-black italic leading-none mb-2">
              You're all caught up!
            </h3>
            <p class="text-sm font-bold text-black/50 max-w-[200px] mx-auto">
              You've seen all the new art. Maybe it's time to stop ccrolling and draw something yourself?
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Global Reaction Popover -->
    <ion-popover
      :is-open="popoverOpen"
      :event="popoverEvent"
      @didDismiss="popoverOpen = false"
      :show-backdrop="false"
      class="liquid-popover"
      side="top"
      alignment="center"
    >
      <div
        class="liquid-glass-inner flex items-center px-3 py-2 space-x-2 animate-pop-in isolate"
      >
        <button
          v-for="(imgSrc, type) in reactionImages"
          :key="type"
          @click="selectReaction(type)"
          class="group relative w-12 h-12 p-1 transition-all duration-300 hover:scale-125 active:scale-95"
        >
          <img
            :src="imgSrc"
            class="h-full w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:-translate-y-2"
          />

          <div
            v-if="activePopoverPost?.user_reaction === type"
            class="absolute -bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-black/40 shadow-sm"
          />
        </button>
      </div>
    </ion-popover>

    <!-- Comments Drawer -->
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

/* -------------------------------------------------------------------------- */
/*                                   COMMENTS                                 */
/* -------------------------------------------------------------------------- */

const openComments = (post: FeedPost) => {
	activePost.value = post;
	isCommentsOpen.value = true;
};

/* -------------------------------------------------------------------------- */
/*                                  REACTIONS                                 */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                  DELETE                                    */
/* -------------------------------------------------------------------------- */

const handleDelete = async (post: FeedPost) => {
	try {
		await deletePost(post._id);

		postStore.removePostLocally(post._id);

		toast("Post deleted");
	} catch (e) {
		toast("Failed to delete", {
			color: "danger",
		});
	}
};

/* -------------------------------------------------------------------------- */
/*                               VIEW TRACKING                                */
/* -------------------------------------------------------------------------- */

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

	if (!target) return;

	if (postElements.has(postId)) return;

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
			} else {
				if (timer) {
					clearTimeout(timer);
				}
			}
		},
		{
			threshold: 0.6,
		},
	);
};

/* -------------------------------------------------------------------------- */
/*                                   FEED                                     */
/* -------------------------------------------------------------------------- */

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
	{
		immediate: true,
	},
);

/* -------------------------------------------------------------------------- */
/*                                  CLEANUP                                   */
/* -------------------------------------------------------------------------- */

onUnmounted(() => {
	if (syncTimeout) {
		clearTimeout(syncTimeout);
	}
});
</script>

<style scoped>
@reference "@/theme/main.css";

ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
  --width: auto;
  overflow: visible;
}

ion-popover.liquid-popover::part(content) {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  overflow: visible;
  border-radius: 2.5rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(10px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-pop-in {
  animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
</style>
