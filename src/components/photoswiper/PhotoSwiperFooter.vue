<template>
  <!-- The translucent plate is on the wrapper in PhotoSwiper.vue so it can cover
       the bottom safe-area inset too; this bar just carries layout. -->
  <div class="flex z-10 justify-between w-full items-center h-16 relative px-6">
    <!-- Lives INSIDE the bar so `bottom-full` anchors it to the bar's top edge —
         one continuous surface with the chrome instead of an island over art. -->
    <!-- Keyed on the item. Without this the preview is ONE instance reused
         across slides, so swiping to the next post left its two <Transition>s
         mid-flight: the outgoing panel is still in the DOM for 200ms rendering
         the PREVIOUS post's comments over the new one. Re-keying tears the old
         instance down at the slide boundary — new post, new panel, no ghost. -->
    <CommentPreview
      :key="currItem._id"
      :visible="showComments"
      :comments="currItem.comments || []"
      :commentCount="currItem.comment_count"
      :resolveUser="resolveUser"
      @open-comments="$emit('open-comments')"
      @update:visible="$emit('update:showComments', $event)"
    />

    <div class="flex items-center w-full justify-between max-w-lg mx-auto">

      <PhotoSwiperReactions
        v-if="type === 'post'"
        :item="currItem"
        :reactionImages="reactionImages"
        @open-popover="openReactionPopover"
        @open-breakdown="showReactionSheet = true"
      />

      <button v-if="canReply" @click="$emit('reply')" class="swiper-action-btn">
        <ion-icon :icon="svg(mdiPencilOutline)" />
      </button>

      <!-- Always opens the full thread. "Comments" means ONE thing across the
           whole viewer — this button and the peek panel body both land in the
           drawer. Showing/hiding the peek is the panel's own affordance (its X
           and its collapsed edge handle), not a second meaning bolted onto this
           button. -->
      <button
        @click="$emit('open-comments')"
        class="swiper-action-btn relative"
        aria-label="Open comments"
      >
        <ion-icon :icon="svg(mdiChatOutline)" />

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

    <ReactionPopover
      :is-open="popoverOpen"
      :event="popoverEvent"
      :userReaction="currItem.user_reaction"
      @close="popoverOpen = false"
      @select="selectReaction"
    />

    <!-- Same sheet the feed card uses, so "who reacted" looks identical whether
         you tapped it in the feed or in fullscreen. -->
    <ReactionBreakdownSheet
      v-if="type === 'post'"
      :is-open="showReactionSheet"
      :post="currItem"
      @close="showReactionSheet = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
	actionSheetController,
	alertController,
	IonIcon,
	IonPopover,
} from "@ionic/vue";
import {
	mdiChatOutline,
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
import { useShareService } from "@/draw/store/useShareService.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import ReactionPopover from "@/components/general/ReactionPopover.vue";
import ReactionBreakdownSheet from "@/components/general/ReactionBreakdownSheet.vue";

const props = defineProps<{
	currItem: any;
	type: "post" | "inbox";
	showComments: boolean;
	canReply: boolean | undefined;
	canDelete: boolean;
	userLookup?: (userId: string) => any;
}>();

const emit = defineEmits([
	"open-comments",
	"update:showComments",
	"reply",
	"delete",
	"react",
]);

const moderationStore = useModerationStore();

// Both branches were identical — the ternary carried no information.
const displayCommentCount = computed(() => props.currItem.comment_count || 0);

const popoverOpen = ref(false);
const popoverEvent = ref<Event | null>(null);
const showReactionSheet = ref(false);

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
  @apply flex items-center justify-center p-2.5 rounded-2xl text-white text-[28px] transition-all active:scale-75 cursor-pointer hover:scale-105;
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
  from {
    opacity: 0;
    transform: scale(0.8) translateY(15px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-pop-in {
  animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.2) forwards;
}
</style>