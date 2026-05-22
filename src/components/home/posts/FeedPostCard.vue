<template>
  <div class="post-container relative group w-full mb-6 mt-4 flex flex-col" :data-post-id="post._id">
    <!-- Main container -->
    <div
      class="rounded-[2.5rem] border border-black/5 shadow-sm overflow-hidden pt-2 flex flex-col h-full transition-colors duration-500"
      :style="{ backgroundColor: 'var(--ion-color-tertiary)' }"
    >

      <!-- Post Header -->
      <div class="px-4 pb-3 shrink-0">
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

        <p v-if="post.description" class="cabin-sketch-regular text-lg line-clamp-1">
          {{ post.description }}
        </p>
      </div>

      <!-- Canvas Area: Removed rigid aspect-ratio in favor of container-based scaling -->
      <div
        class="relative w-full flex items-center justify-center overflow-hidden"
        :style="{ backgroundColor: 'var(--ion-color-tertiary)' }"
        @dblclick="handleDoubleTap"
      >
        <!-- Background Blur (fills the space) -->
        <img :src="post.image_url" class="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-40" />

        <!-- Vignette -->
        <div class="absolute inset-0 z-[5] pointer-events-none vignette-mask" />

        <!-- Main Image: object-contain ensures the WHOLE image is visible -->
        <img
          :src="post.image_url"
          class="relative z-10 w-full h-full object-contain transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          @load="imageLoaded = true"
          :style="{ maxHeight: '60vh' }"
        />

        <!-- Reaction Animation -->
        <div v-if="activeAnim" class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" >
          <img :src="reactionImages[activeAnim]" class="w-32 h-32 drop-shadow-2xl anim-float-up object-contain" />
        </div>
      </div>

      <!-- Action Bar -->
      <div class="px-4 pt-3 pb-2 flex items-center justify-between bg-white/40 shrink-0">
        <div class="flex items-center gap-3">
          <button @click="(e) => $emit('open-reaction-popover', { event: e, post })" class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform">
            <img :src="post.user_reaction ? reactionImages[post.user_reaction] : reactionImages.heart" class="w-7 h-7 drop-shadow-sm object-contain" :class="{ 'grayscale opacity-50': !post.user_reaction }" />
          </button>
          <button @click="$emit('open-comments', post)" class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black">
            <ion-icon :icon="svg(mdiChatOutline)" class="text-[28px]" />
          </button>
          <button @click="openShare" class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black">
            <ion-icon :icon="svg(mdiSendOutline)" class="text-[26px] -rotate-12" />
          </button>
        </div>
        <div class="flex items-center gap-2">
<!--          <button @click="toggleBookmark" class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black">-->
<!--            <ion-icon :icon="svg(isBookmarked ? mdiBookmark : mdiBookmarkOutline)" class="text-[28px]" :class="{ 'text-secondary': isBookmarked }" />-->
<!--          </button>-->
          <button @click="remixPost" class="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform text-black/70 hover:text-black">
            <ion-icon :icon="svg(mdiPencilOutline)" class="text-[26px]" />
          </button>
        </div>
      </div>

      <div class="px-4 pb-4 bg-white/40 shrink-0">
        <div v-if="activeReactions.length > 0" class="flex items-center gap-2 mb-2">
          <div class="flex items-center">
            <img v-for="(key, i) in activeReactions.slice(0, 3)" :key="key" :src="reactionImages[key]" class="w-6 h-6 object-contain drop-shadow-sm" :class="i !== 0 ? '-ml-1' : ''" />
          </div>
          <span class="text-[13px] font-black text-black/40">{{ totalReactionCount }}</span>
        </div>

        <div v-if="post.comments?.length || post.comment_count" @click="$emit('open-comments', post)" class="cursor-pointer active:opacity-60 transition-opacity">
          <div v-for="comment in post.comments?.slice(0, 2)" :key="comment._id" class="flex items-start gap-1.5 mb-0.5">
            <span class="text-black font-black text-sm shrink-0">{{ comment.author.name }}</span>
            <span class="text-black/80 text-sm truncate">{{ comment.message }}</span>
          </div>
          <p class="text-[10px] font-bold text-black/40 mt-1 uppercase tracking-widest">View all comments ({{post.comment_count}})</p>
        </div>
        <p v-else @click="$emit('open-comments', post)" class="text-[10px] font-bold text-black/40 uppercase tracking-widest cursor-pointer active:opacity-60">
          Start the conversation...
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// (Imports and Logic remain exactly the same as your original provided code)
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
@keyframes floatUpFade { 0% { opacity: 0; transform: scale(0.5) translateY(20px); } 15% { opacity: 1; transform: scale(1.2) translateY(0px); } 80% { opacity: 1; transform: scale(1) translateY(-30px); } 100% { opacity: 0; transform: scale(0.8) translateY(-50px); } }
.anim-float-up { animation: floatUpFade 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
.vignette-mask { background: linear-gradient(to right, rgba(255,255,255,0.18) 0%, transparent 18%, transparent 82%, rgba(255,255,255,0.18) 100%); }
@media (max-aspect-ratio: 1/1) { .vignette-mask { background: linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, transparent 18%, transparent 82%, rgba(255,255,255,0.15) 100%); } }
</style>