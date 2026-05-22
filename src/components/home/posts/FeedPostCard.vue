<template>
  <div class="post-container relative group w-full mb-6 mt-4" :data-post-id="post._id">
    <div class="bg-primary/20 rounded-[2.5rem] border border-primary/30 shadow-sm overflow-hidden pt-2">
      <!-- Post Header -->
      <div class="px-4 pb-3">
        <div class="flex items-center justify-between">
          <button @click="openUser(post.author._id)" class="flex items-center active:scale-95 transition-transform text-left">
            <div class="w-10 h-10 rounded-2xl bg-white/40 backdrop-blur-xl border border-black/10 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="post.author.img" :src="post.author.img" class="w-full h-full object-cover" />
              <span v-else class="text-black font-bold">{{ post.author.name.charAt(0) }}</span>
            </div>
            <div class="ml-3 flex flex-col justify-center">
              <p class="text-[15px] leading-none font-bold text-black drop-shadow-sm">{{ post.author.name }}</p>
              <p class="text-[10px] text-black/50 font-bold uppercase mt-0.5 tracking-wider">{{ dayjs(post.createdAt).fromNow() }}</p>
            </div>
          </button>
          <button @click="presentActionSheet" class="p-2 active:scale-90 transition-transform">
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-2xl text-black/50" />
          </button>
        </div>

        <p v-if="post.description" class="text-[15px] text-black/85 leading-snug mt-2.5 pl-[3.25rem] pr-2">
          {{ post.description }}
        </p>
      </div>

      <!-- Canvas Area -->
      <div
        class="relative w-full flex items-center justify-center bg-black/5 overflow-hidden"
        :style="{ aspectRatio: post.aspect_ratio || 1 }"
        @dblclick="handleDoubleTap"
      >
        <img :src="post.image_url" class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30 scale-110 pointer-events-none" />
        <img
          :src="post.image_url"
          class="w-full h-full object-contain relative z-10 transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          @load="imageLoaded = true"
        />

        <div v-if="activeAnim" class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <img :src="reactionImages[activeAnim]" class="w-32 h-32 drop-shadow-2xl anim-float-up object-contain" />
        </div>
      </div>

      <!-- Action Bar -->
      <div class="px-4 pt-3 pb-2 flex items-center justify-between bg-white/40">
        <div class="flex items-center gap-3">
          <button
            @click="(e) => $emit('open-reaction-popover', { event: e, post })"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform"
          >
            <img
              :src="post.user_reaction ? reactionImages[post.user_reaction] : reactionImages.heart"
              class="w-7 h-7 drop-shadow-sm object-contain"
              :class="{ 'grayscale opacity-50': !post.user_reaction }"
            />
          </button>
          <button
            @click="$emit('open-comments', post)"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black"
          >
            <ion-icon :icon="svg(mdiChatOutline)" class="text-[28px]" />
          </button>
          <button
            @click="openShare"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black"
          >
            <ion-icon :icon="svg(mdiSendOutline)" class="text-[26px] -rotate-12" />
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="toggleBookmark"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black"
          >
            <ion-icon :icon="svg(isBookmarked ? mdiBookmark : mdiBookmarkOutline)" class="text-[28px]" :class="{ 'text-secondary': isBookmarked }" />
          </button>
          <button
            @click="remixPost"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" class="text-[26px] }" />
          </button>
        </div>
      </div>

      <!-- Comments -->
      <div class="px-4 pb-4 bg-white/40 rounded-b-[2.5rem]">
        <div
          v-if="post.comments?.length || post.comment_count"
          @click="$emit('open-comments', post)"
          class="cursor-pointer active:opacity-60 transition-opacity"
        >
          <div v-for="comment in post.comments?.slice(0, 2)" :key="comment._id" class="flex items-start gap-1.5 mb-0.5">
            <span class="text-black font-black text-sm shrink-0">{{ comment.author.name }}</span>
            <span class="text-black/80 text-sm truncate">{{ comment.message }}</span>
          </div>
          <p class="text-xs font-bold text-black/40 mt-1 uppercase tracking-widest">
            View all comments
          </p>
        </div>
        <p
          v-else
          @click="$emit('open-comments', post)"
          class="text-xs font-bold text-black/40 uppercase tracking-widest cursor-pointer active:opacity-60"
        >
          Start the conversation...
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IonIcon, actionSheetController, alertController } from "@ionic/vue";
import {
	mdiDotsHorizontal,
	mdiChatOutline,
	mdiSendOutline,
	mdiPencilOutline,
	mdiFlagVariantOutline,
	mdiDeleteOutline,
	mdiBookmarkOutline,
	mdiBookmark,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { svg } from "@/helper/general.helper";
import { FeedPost } from "@/types/server.types";
import { reactionImages } from "@/config/post.config";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { usePostStore } from "@/store/post.store";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { Menu } from "@/draw/types/draw.types";
import { useModerationStore } from "@/store/moderation.store";

dayjs.extend(relativeTime);

const props = defineProps<{ post: FeedPost; isMine: boolean }>();
const emit = defineEmits([
	"open-comments",
	"open-reaction-popover",
	"delete-post",
]);

const { openUserActions } = useUserContextSheet();
const menuStore = useMenuStore();
const postStore = usePostStore();
const { toast } = useToast();

const imageLoaded = ref(false);
const isBookmarked = ref(false);
const activeAnim = ref<string | null>(null);

const totalReactions = computed(() =>
	Object.values(props.post.reaction_counts || {}).reduce((a, b) => a + b, 0),
);
const activeReactions = computed(() =>
	Object.keys(props.post.reaction_counts || {})
		.filter((k) => props.post.reaction_counts[k] > 0)
		.slice(0, 3),
);

watch(
	() => props.post.user_reaction,
	(newVal, oldVal) => {
		if (newVal && newVal !== oldVal) {
			activeAnim.value = newVal;
			setTimeout(() => {
				activeAnim.value = null;
			}, 1000);
		}
	},
);

const openUser = (userId: string) => openUserActions({ _id: userId });

const openShare = () => {
	postStore.setActiveSharePost(props.post);
	menuStore.openMenu(Menu.SharePostMenu);
};

const toggleBookmark = () => {
	isBookmarked.value = !isBookmarked.value;
	toast(isBookmarked.value ? "Saved to bookmarks" : "Removed from bookmarks");
};

const remixPost = async () => {
	const alert = await alertController.create({
		header: "Start New Session?",
		subHeader: "This will leave your current lobby.",
		message:
			"You are about to start a private drawing session based upon this post.",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
			{
				text: "Start Drawing",
				cssClass: "alert-button-confirm",
				handler: () => {
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
			text: "Report Post",
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
@keyframes floatUpFade {
  0% { opacity: 0; transform: scale(0.5) translateY(20px); }
  15% { opacity: 1; transform: scale(1.2) translateY(0px); }
  80% { opacity: 1; transform: scale(1) translateY(-30px); }
  100% { opacity: 0; transform: scale(0.8) translateY(-50px); }
}

.anim-float-up {
  animation: floatUpFade 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
</style>