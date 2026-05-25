<template>
  <CommentPreview
    :comments="currItem.comments || []"
    @open-comments="$emit('open-comments')"
    :resolveUser="resolveUser"
  />

  <div class="flex justify-between w-full items-center h-16 relative px-6 bg-black/60 backdrop-blur-xl">
    <div class="flex items-center w-full justify-between max-w-lg mx-auto">

      <PhotoSwiperReactions
        v-if="type === 'post'"
        :item="currItem"
        :reactionImages="reactionImages"
        @open-popover="openReactionPopover"
      />

      <button v-if="canReply" @click="$emit('reply')" class="swiper-action-btn">
        <ion-icon :icon="svg(mdiPencilOutline)" />
      </button>

      <button @click="$emit('open-comments')" class="swiper-action-btn relative">
        <ion-icon :icon="svg(mdiCommentOutline)" />
        <div
          v-if="displayCommentCount > 0"
          class="absolute -top-0.5 -right-0.5 bg-secondary text-white text-[11px] font-black min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1 border-2 border-black shadow-md transform rotate-3"
        >
          {{ displayCommentCount }}
        </div>
      </button>

      <button @click="handleShare" class="swiper-action-btn">
        <ion-icon :icon="svg(mdiShareVariantOutline)" />
      </button>

      <button @click="openOverflow" class="swiper-action-btn">
        <ion-icon :icon="svg(mdiDotsHorizontal)" />
      </button>
    </div>

    <ion-popover
      :is-open="popoverOpen"
      :event="popoverEvent"
      @didDismiss="popoverOpen = false"
      :show-backdrop="false"
      class="liquid-popover"
      side="top"
      :arrow="false"
      alignment="center"
    >
      <div class="bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] flex items-center px-4 py-3 space-x-3 animate-pop-in shadow-2xl">
        <button
          v-for="(imgSrc, type) in reactionImages"
          :key="type"
          @click="selectReaction(type)"
          class="group relative w-11 h-11 p-1 transition-all duration-300 hover:scale-125 active:scale-90"
        >
          <img :src="imgSrc" class="h-full w-full object-contain drop-shadow-md group-hover:-translate-y-2 transition-transform" />
          <div v-if="currItem.user_reaction === type"
               class="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-secondary shadow-[0_0_8px_rgba(var(--ion-color-secondary-rgb),0.6)]" />
        </button>
      </div>
    </ion-popover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
	IonIcon,
	IonPopover,
	actionSheetController,
	alertController,
} from "@ionic/vue";
import {
	mdiCommentOutline,
	mdiDeleteOutline,
	mdiDotsHorizontal,
	mdiFlagVariantOutline,
	mdiPencilOutline,
	mdiShareVariantOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { shareImg } from "@/helper/share.helper";
import CommentPreview from "@/components/photoswiper/CommentPreview.vue";
import PhotoSwiperReactions from "@/components/photoswiper/PhotoSwiperReactions.vue";
import { reactionImages } from "@/config/post.config";
import { useModerationStore } from "@/store/moderation.store";
import { useAuthStore } from "@/store/auth.store";
import {
	useShareService,
	ShareableItem,
} from "@/draw/store/useShareService.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const props = defineProps<{
	currItem: any;
	type: "post" | "inbox";
	showComments: boolean;
	canReply: boolean | undefined;
	canDelete: boolean;
	userLookup?: (userId: string) => any;
}>();

const emit = defineEmits(["open-comments", "reply", "delete", "react"]);

const moderationStore = useModerationStore();

const displayCommentCount = computed(() =>
	props.type === "post"
		? props.currItem.comment_count || 0
		: props.currItem.comments?.length || 0,
);

const popoverOpen = ref(false);
const popoverEvent = ref<Event | null>(null);

function openReactionPopover(e: any) {
	popoverEvent.value = e;
	popoverOpen.value = true;
}

function selectReaction(type: string) {
	popoverOpen.value = false;
	emit("react", type);
}

function resolveUser(userId: string) {
	return props.userLookup ? props.userLookup(userId) : userId;
}

const shareService = useShareService();
const menuStore = useMenuStore();

function handleShare() {
	if (props.type === "post") {
		shareService.setActiveShareItem({ type: "post", data: props.currItem });
		menuStore.openMenu(Menu.SharePostMenu);
	} else {
		const imgUrl = props.currItem.image;
		if (imgUrl) shareImg(imgUrl);
	}
}

async function openOverflow() {
	const buttons: any[] = [];
	const userId = useAuthStore().user?._id;

	if (props.canDelete) {
		buttons.push({
			text: props.type === "post" ? "Delete Post" : "Delete Drawing",
			role: "destructive",
			icon: svg(mdiDeleteOutline),
			handler: () => confirmDelete(),
		});
	}

	if (props.type === "inbox" && props.currItem.sender !== userId) {
		buttons.push({
			text: "Report Drawing",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				moderationStore.openReport({
					type: "inbox_drawing",
					id: props.currItem._id,
					label: "this drawing",
				});
			},
		});
	} else if (props.type === "post" && props.currItem.author._id !== userId) {
		buttons.push({
			text: "Report Drawing",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				moderationStore.openReport({
					type: "post",
					id: props.currItem._id,
					label: `${props.currItem.author?.name || "this user"}'s post`,
				});
			},
		});
	}

	buttons.push({ text: "Cancel", role: "cancel" });

	const sheet = await actionSheetController.create({
		header: props.type === "post" ? "Post Options" : "Drawing Options",
		cssClass: "normal-action-sheet",
		buttons,
	});
	await sheet.present();
}

async function confirmDelete() {
	const alert = await alertController.create({
		header: props.type === "post" ? "Delete Post?" : "Delete Drawing?",
		subHeader: "This can't be undone.",
		message: "Are you sure?",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
			{
				text: "Delete",
				role: "destructive",
				cssClass: "alert-button-confirm",
				handler: () => emit("delete"),
			},
		],
	});
	await alert.present();
}
</script>

<style scoped>
@reference "@/theme/main.css";

.swiper-action-btn {
  @apply flex items-center justify-center p-2.5 rounded-2xl text-white text-[28px] transition-all active:scale-75;
}

ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
}

ion-popover.liquid-popover::part(content) {
  background: transparent;
  box-shadow: none;
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.8) translateY(15px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.animate-pop-in {
  animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.2) forwards;
}
</style>