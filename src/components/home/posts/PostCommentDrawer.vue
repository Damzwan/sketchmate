<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @did-present="onDidPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-comment-modal"
  >
    <!-- FIX: Restored overflow-y-auto and max-h-[85vh] here to match the working component layout layout structure -->
    <div class="h-full flex flex-col bg-background cabin-sketch-regular overflow-y-auto max-h-[85vh]">
      <!-- Header -->
      <div class="shrink-0 pt-4 px-5 pb-3 text-center relative border-b border-black/5">
        <h1 class="text-xl text-black font-black tracking-tight italic leading-none">Comments</h1>
        <p v-if="post?.comment_count > 0" class="text-xs text-black/80 font-bold uppercase tracking-widest mt-1">
          {{ post.comment_count }} {{ post.comment_count === 1 ? 'reply' : 'replies' }}
        </p>
      </div>

      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="$emit('close')" fill="clear" color="dark" class="m-0">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
      </div>

      <!-- Comments List Area -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto hide-scrollbar pb-4 pt-1 relative"
        @touchmove.stop
      >
        <!-- Top Loading Spinner for Pagination History -->
        <div v-if="loadingOlder" class="flex justify-center py-4 w-full">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <!-- Initial Load Spinner -->
        <div v-if="loading && comments.length === 0" class="flex justify-center py-10">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <!-- Empty State -->
        <div v-else-if="comments.length === 0" class="text-center py-12 px-6">
          <p class="text-black/80 italic">No comments yet.</p>
          <p class="text-sm text-black/80 mt-1">Be the first to say something nice.</p>
        </div>

        <!-- Comments Stream Loop -->
        <div
          v-else
          v-for="(comment, idx) in comments"
          :key="comment._id || idx"
          class="flex items-start px-4 py-3 relative group"
        >
          <!-- User Avatar -->
          <button
            @click="openUser(comment.author?._id)"
            class="shrink-0 cursor-pointer active:scale-95 transition-transform mt-0.5"
          >
            <UserAvatar
              static
              v-if="comment.author"
              :user="comment.author"
              :customization="comment.author?.customization"
              size="sm"
            />
          </button>

          <!-- Comment Content Body -->
          <div class="flex-1 ml-3 min-w-0 pb-3 pr-6 relative" :class="{ 'border-b border-black/5': idx < comments.length - 1 }">

            <!-- Header row containing Name and Timestamp -->
            <div class="flex items-baseline justify-between gap-2">
              <button
                @click="openUser(comment.author?._id)"
                class="text-sm font-black cursor-pointer text-black truncate active:opacity-60 transition-opacity text-left max-w-[70%]"
              >
                {{ comment.author?.name || 'Sketcher' }}
              </button>
              <span class="text-xs text-black/80 uppercase tracking-wider shrink-0 pr-7">
                {{ dayjs(comment.createdAt || comment.date).fromNow() }}
              </span>
            </div>

            <!-- Message Text -->
            <p class="text-sm text-black/85 mt-1 leading-snug break-words">
              {{ comment.message }}
            </p>

            <!-- Context Options Button -->
            <button
              @click.stop="openCommentActions(comment)"
              class="absolute top-3 cursor-pointer right-3 p-1.5 active:scale-90 transition-transform"
            >
              <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg text-black/80" />
            </button>
          </div>
        </div>
      </div>

      <!-- Sticky Input Footer -->
      <div class="flex w-full items-center gap-2 bg-background sticky bottom-0 border-t border-black/10 px-3 py-3 pb-safe z-10 shrink-0">
        <ion-avatar class="shrink-0 h-[34px] w-[34px] shadow-sm">
          <img v-if="user?.img" :src="user.img" alt="Me" class="aspect-square object-cover" />
          <span v-else class="w-full h-full flex items-center justify-center font-bold text-black bg-black/5 text-sm">
            {{ user?.name?.charAt(0) }}
          </span>
        </ion-avatar>

        <div class="flex-1 flex items-center bg-white/60 rounded-full px-4 border border-black/10 shadow-inner">
          <ion-input
            placeholder="Say something nice..."
            ref="input"
            v-model="newComment"
            autocapitalize="sentences"
            @keyup.enter="submitComment"
            color="secondary"
            class="flex-1 font-bold cabin-sketch-regular text-sm"
          />
          <button
            v-show="newComment.trim().length > 0"
            @mousedown.prevent
            @click="submitComment"
            :disabled="isSubmitting"
            class="shrink-0 cursor-pointer active:scale-90 transition-transform pl-2"
          >
            <ion-icon :icon="svg(mdiSend)" class="text-2xl text-secondary" />
          </button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from "vue";
import { useInfiniteScroll } from "@vueuse/core";
import {
	IonModal,
	IonSpinner,
	IonIcon,
	IonAvatar,
	IonInput,
	actionSheetController,
	alertController,
	IonButton,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import {
	mdiSend,
	mdiFlagVariantOutline,
	mdiDeleteOutline,
	mdiDotsHorizontal,
	mdiClose,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { svg } from "@/helper/general.helper";
import { fetchPostComments, postComment } from "@/service/api/post.api";
import { useAuthStore } from "@/store/auth.store";
import { usePostStore } from "@/store/post.store";
import { useModerationStore } from "@/store/moderation.store";
import { useToast } from "@/service/toast.service";
import { FeedPost } from "@/types/server.types";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";

dayjs.extend(relativeTime);

const props = defineProps<{ isOpen: boolean; post: FeedPost | null }>();
const emit = defineEmits(["close"]);

const { user } = storeToRefs(useAuthStore());
const { openUserActions } = useUserContextSheet();
const postStore = usePostStore();
const moderationStore = useModerationStore();
const { toast } = useToast();

const scrollContainer = ref<HTMLElement | null>(null);
const input = ref<any>();
const comments = ref<any[]>([]);
const loading = ref(false);
const loadingOlder = ref(false);
const isSubmitting = ref(false);
const newComment = ref("");
const hasMore = ref(false);

// --- Infinite Scroll Implementation (Top Anchored for Older Items)
useInfiniteScroll(
	scrollContainer,
	async () => {
		if (hasMore.value && !loadingOlder.value) {
			await loadOlderComments();
		}
	},
	{ direction: "top", distance: 40 },
);

// --- Handle initial load sequence on modal toggle
watch(
	() => props.isOpen,
	async (openState) => {
		if (!openState || !props.post) return;

		// Initialize with the preview comments if they exist
		comments.value = props.post.comments ? [...props.post.comments] : [];

		// Skip the network only when the server also says there are none.
		// Preview array can be empty while comment_count > 0 (no preview loaded).
		if (comments.value.length === 0 && !((props.post.comment_count ?? 0) > 0)) {
			hasMore.value = false;
			loading.value = false;
			return; // Focus handled by onDidPresent
		}

		hasMore.value = false;
		loading.value = true;

		try {
			const res = await fetchPostComments(props.post._id, 20);
			comments.value = res.comments;
			hasMore.value = res.hasMore;

			if (comments.value.length === 0) {
				await nextTick();
				input.value?.$el?.setFocus();
			} else {
				scrollToBottom();
			}
		} catch (e) {
			console.error("Failed to load comments", e);
		} finally {
			loading.value = false;
		}
	},
);

// --- Reset streams cleanly when post instance shifts
watch(
	() => props.post?._id,
	() => {
		if (props.isOpen) {
			comments.value = props.post?.comments ? [...props.post.comments] : [];
		}
	},
);

// --- Watch deep mutations arriving via external channels (sockets) safely
watch(
	() => props.post?.comments,
	(incomingList) => {
		if (!props.isOpen || !incomingList) return;

		const uniquelyNew = incomingList.filter(
			(inc: any) => !comments.value.some((loc) => loc._id === inc._id),
		);

		if (uniquelyNew.length > 0) {
			comments.value = [...comments.value, ...uniquelyNew];
			scrollToBottom();
		}
	},
	{ deep: true },
);

const openUser = (userId: string) => {
	if (userId) openUserActions({ _id: userId });
};

const submitComment = async () => {
	if (!newComment.value.trim() || !props.post || isSubmitting.value) return;
	const message = newComment.value;
	newComment.value = "";
	isSubmitting.value = true;

	try {
		const res = await postComment(props.post._id, message);
		res.comment.author = user.value;

		comments.value.push(res.comment);

		if (props.post) {
			props.post.comment_count++;
			props.post.comments = [...(props.post.comments || []), res.comment];
		}
		scrollToBottom();
	} catch (e) {
		console.error("Failed to post comment", e);
		newComment.value = message;
	} finally {
		isSubmitting.value = false;
	}
};

const loadOlderComments = async () => {
	if (!hasMore.value || comments.value.length === 0 || loadingOlder.value)
		return;

	loadingOlder.value = true;
	const oldestComment = comments.value[0];
	const oldestDate = oldestComment.createdAt || oldestComment.date;

	try {
		const res = await fetchPostComments(props.post!._id, 20, oldestDate);

		const historicalSlice = res.comments.filter(
			(c: any) => !comments.value.some((existing) => existing._id === c._id),
		);

		const container = scrollContainer.value;
		const initialHeight = container ? container.scrollHeight : 0;
		const initialTop = container ? container.scrollTop : 0;

		comments.value = [...historicalSlice, ...comments.value];
		hasMore.value = res.hasMore;

		await nextTick();
		if (container) {
			container.scrollTop =
				initialTop + (container.scrollHeight - initialHeight);
		}
	} catch (e) {
		console.error("Failed to load older historical chunks", e);
	} finally {
		loadingOlder.value = false;
	}
};

const scrollToBottom = async () => {
	await nextTick();
	if (scrollContainer.value) {
		scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
	}
};

// Fires once the modal is fully presented — the only reliable moment to focus
// the input on iOS. Empty thread → focus to invite a comment; otherwise scroll.
const onDidPresent = async () => {
	await nextTick();
	if (!loading.value && comments.value.length === 0) {
		input.value?.$el?.setFocus();
	} else {
		scrollToBottom();
	}
};

const handleDismiss = () => {
	newComment.value = "";
	emit("close");
};

// --- Comment Actions Configuration ---

const openCommentActions = async (comment: any) => {
	const isMine = comment.author?._id === user.value?._id;
	const buttons: any[] = [];

	if (isMine) {
		buttons.push({
			text: "Delete Comment",
			role: "destructive",
			icon: svg(mdiDeleteOutline),
			handler: () => confirmDeleteComment(comment),
		});
	} else {
		buttons.push({
			text: "Report Comment",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				moderationStore.openReport({
					type: "comment",
					id: comment._id,
					label: `${comment.author?.name || "User"}'s comment`,
				});
			},
		});
	}

	buttons.push({ text: "Cancel", role: "cancel" });

	const sheet = await actionSheetController.create({
		header: "Comment Options",
		cssClass: "liquid-action-sheet",
		buttons,
	});
	await sheet.present();
};

const confirmDeleteComment = async (comment: any) => {
	const alert = await alertController.create({
		header: "Delete Comment?",
		subHeader: "This can't be undone.",
		message: "Are you sure you want to remove this comment?",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
			{
				text: "Delete",
				role: "destructive",
				cssClass: "alert-button-confirm",
				handler: async () => {
					if (!props.post) return;
					try {
						await postStore.deletePostComment(props.post._id, comment._id);

						comments.value = comments.value.filter(
							(c) => c._id !== comment._id,
						);

						if (props.post.comments) {
							props.post.comments = props.post.comments.filter(
								(c: any) => c._id !== comment._id,
							);
						}
						if (
							typeof props.post.comment_count === "number" &&
							props.post.comment_count > 0
						) {
							props.post.comment_count--;
						}

						toast("Comment deleted");
					} catch (e) {
						console.error("Delete failed", e);
						toast("Failed to delete comment", { color: "danger" });
					}
				},
			},
		],
	});
	await alert.present();
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.pb-safe {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
}

ion-input {
  --color: black;
  --placeholder-color: rgba(0, 0, 0, 0.4);
  --padding-start: 0;
  --padding-end: 0;
}

ion-modal.liquid-comment-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --background: var(--ion-color-tertiary);
  --height: auto;
  --max-height: 85vh;
}
</style>