<template>
  <section class="min-h-[300px] pb-10 max-w-2xl mx-auto">
    <div class="flex items-center justify-between px-4 mb-6 pt-4">
      <h2 class="text-2xl font-black text-black tracking-tight italic drop-shadow-sm cabin-sketch-regular">Community Vibes</h2>
    </div>

    <transition name="fade-slow" mode="out-in">
      <div v-if="loading" key="loading" class="space-y-10 px-4">
        <div v-for="i in 3" :key="i" class="w-full bg-primary/20 rounded-[2.5rem] animate-pulse border border-primary/30 h-[450px]" />
      </div>

      <div v-else key="data" class="px-4 space-y-2">
        <FeedPostCard
          v-for="post in posts"
          :key="post._id"
          :post="post"
          :is-mine="post.author_id === user?._id"
          @open-comments="openComments"
          @open-reaction-popover="handleOpenReactionPopover"
          @delete-post="handleDelete"
        />

        <div ref="loadMoreTrigger" class="h-10 w-full flex justify-center items-center">
          <ion-spinner v-if="!loading && hasMore" name="bubbles" color="secondary" />
        </div>
      </div>
    </transition>

    <!-- Global Reaction Popover (Exactly at touch coordinates) -->
    <ion-popover
      :is-open="popoverOpen"
      :event="popoverEvent"
      @didDismiss="popoverOpen = false"
      :show-backdrop="false"
      class="liquid-popover"
      side="top"
      alignment="center"
    >
      <div class="liquid-glass-inner flex items-center px-3 py-2 space-x-2 animate-pop-in isolate">
        <button
          v-for="(imgSrc, type) in reactionImages"
          :key="type"
          @click="selectReaction(type)"
          class="group relative w-12 h-12 p-1 transition-all duration-300 hover:scale-125 active:scale-95"
        >
          <img :src="imgSrc" class="h-full w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:-translate-y-2" />
          <div v-if="activePopoverPost?.user_reaction === type" class="absolute -bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-black/40 shadow-sm" />
        </button>
      </div>
    </ion-popover>

    <!-- Post Local Modals -->
    <PostCommentDrawer
      :is-open="isCommentsOpen"
      :post="activePost"
      @close="isCommentsOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { IonSpinner, IonPopover } from "@ionic/vue";
import { useAuthStore } from "@/store/auth.store";
import { usePostStore } from "@/store/post.store";
import { useToast } from "@/service/toast.service";
import { storeToRefs } from "pinia";
import { logPostViews, deletePost } from "@/service/api/post.api";
import { FeedPost } from "@/types/server.types";
import { reactionImages } from "@/config/post.config";
import PostCommentDrawer from "@/components/home/posts/PostCommentDrawer.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";

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

	// Extract exact touch/click coordinates
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
	if (activePopoverPost.value) {
		try {
			await postStore.toggleReactionLocally(activePopoverPost.value._id, type);
		} catch (e) {
			console.error("Reaction sync failed", e);
		}
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

// --- BATCHED VIEW TRACKING ---
const viewedPosts = new Set<string>();
const pendingViewSync = new Set<string>();
let viewObserver: IntersectionObserver | null = null;
let syncTimeout: any = null;

const initViewTracking = () => {
	viewObserver = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				const postId = entry.target.getAttribute("data-post-id");
				if (!postId) return;
				if (entry.isIntersecting) {
					(entry.target as any)._viewTimer = setTimeout(() => {
						if (!viewedPosts.has(postId)) {
							viewedPosts.add(postId);
							pendingViewSync.add(postId);
							scheduleViewSync();
						}
					}, 1500);
				} else {
					if ((entry.target as any)._viewTimer)
						clearTimeout((entry.target as any)._viewTimer);
				}
			});
		},
		{ threshold: 0.6 },
	);
};

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
			console.error("Sync error", e);
		}
	}, 3000);
};

const attachObserver = () => {
	nextTick(() => {
		if (!viewObserver) return;
		document
			.querySelectorAll(".post-container")
			.forEach((el) => viewObserver!.observe(el));
	});
};

watch(
	user,
	(newVal) => {
		if (newVal) {
			if (posts.value.length === 0 || isFeedDirty.value) {
				postStore.getFeed().finally(() => {
					loading.value = false;
					attachObserver();
				});
			} else {
				loading.value = false;
				attachObserver();
			}
		}
	},
	{ immediate: true },
);

onMounted(() => initViewTracking());
onUnmounted(() => {
	if (viewObserver) viewObserver.disconnect();
	if (syncTimeout) {
		clearTimeout(syncTimeout);
		scheduleViewSync();
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
  0% { opacity: 0; transform: scale(0.6) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-pop-in {
  animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
</style>