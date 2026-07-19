<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="close"
    @did-present="onDidPresent"
    :keep-contents-mounted="true"
    class="liquid-photoswiper"
  >
    <div class="w-full h-full bg-black flex flex-col safe-area">
      <PhotoSwiperHeader
        v-if="user && currItem"
        :curr-item="currItem"
        :type="config.type ?? 'inbox'"
        @close="close"
        @open-followers="isFollowerDrawerOpen = true"
        :user-lookup="config.userLookup"
      />

      <div class="relative w-full grow overflow-hidden flex">
        <swiper-container
          class="w-full grow"
          :initial-slide="slide"
          :zoom="{ maxRatio: 3 }"
          @swiperslidechange="handleSlideChange"
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

      <PhotoSwiperFooter
        v-if="user && currItem"
        :curr-item="currItem"
        :type="config.type ?? 'inbox'"
        :show-comments="showComments"
        :can-reply="config.canReply"
        :can-delete="canDelete"
        :user-lookup="config.userLookup"
        @open-comments="isCommentDrawerOpen = true"
        @update:show-comments="showComments = $event"
        @reply="handleReply"
        @delete="handleDelete"
        @react="handleReact"
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
import { register } from "swiper/element/bundle";

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

register();

// How many comments to pull for the on-image preview. The overlay shows the
// most recent few; the full thread lives in the comment drawer.
const COMMENT_PREVIEW_LIMIT = 6;

const swiperStore = usePhotoSwiper();
const { open, slide, collection, config } = storeToRefs(swiperStore);
const { user } = storeToRefs(useAuthStore());
const { updateSlide } = storeToRefs(useSessionStore());

const currItem = computed(() => collection.value[slide.value] || null);

const showComments = ref(true);
const isCommentDrawerOpen = ref(false);
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

function handleSlideChange(event: any) {
	if (!open.value || !event.target.swiper || !event.target.swiper.activeIndex)
		return;
	slide.value = event.target.swiper.activeIndex;
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
</style>