<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="close"
    @did-present="scrollToBottom()"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-comment-modal"
  >
    <div class="h-full flex flex-col bg-background cabin-sketch-regular overflow-y-auto max-h-[85vh]">
      <div class="shrink-0 pt-5 px-5 pb-3 text-center relative border-b border-black/5">
        <h1 class="text-xl text-black font-black tracking-tight italic leading-none">Comments</h1>
        <p v-if="currItem.comment_count > 0" class="text-[11px] text-black/40 font-bold uppercase tracking-widest mt-1">
          {{ currItem.comment_count }} {{ currItem.comment_count === 1 ? 'reply' : 'replies' }}
        </p>
      </div>

      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto hide-scrollbar pb-4 pt-1 relative"
        @touchmove.stop
      >
        <div v-if="loadingOlder" class="flex justify-center py-4 w-full">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <div v-if="loading && comments.length === 0" class="flex justify-center py-10">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <div v-else-if="comments.length === 0" class="text-center py-12 px-6">
          <p class="font-bold text-black/60 italic">No comments yet.</p>
          <p class="text-sm text-black/40 mt-1">Be the first to say something nice.</p>
        </div>

        <div
          v-else
          v-for="(comment, idx) in comments"
          :key="comment._id || idx"
          class="flex items-start px-4 py-3 relative"
        >
          <button @click="openUser(getAuthorId(comment))" class="shrink-0 active:scale-95 transition-transform">
            <ion-avatar class="h-[38px] w-[38px] bg-white/80 shadow-sm border border-black/5 overflow-hidden">
              <img v-if="getAuthorImg(comment)" :src="getAuthorImg(comment)" class="aspect-square object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center font-bold text-black text-sm">
                {{ getAuthorName(comment).charAt(0) }}
              </span>
            </ion-avatar>
          </button>

          <div
            class="flex-1 ml-3 min-w-0 pb-3 pr-6"
            :class="{ 'border-b border-black/5': idx < comments.length - 1 }"
          >
            <div class="flex items-baseline justify-between gap-2">
              <button
                @click="openUser(getAuthorId(comment))"
                class="text-sm font-black text-black truncate active:opacity-60 transition-opacity text-left"
              >
                {{ getAuthorName(comment) }}
              </button>
              <span class="text-[10px] text-black/40 font-bold uppercase tracking-wider shrink-0 pr-7">
                {{ dayjs(comment.createdAt || comment.date).fromNow() }}
              </span>
            </div>

            <p class="text-[14px] text-black/85 mt-1 leading-snug break-words">
              {{ comment.message }}
            </p>
          </div>

          <button
            @click.stop="openCommentActions(comment)"
            class="absolute top-3 right-3 p-1.5 active:scale-90 transition-transform"
          >
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg text-black/30" />
          </button>
        </div>
      </div>

      <div class="flex w-full items-center gap-2 bg-background sticky bottom-0 border-t border-black/10 px-3 py-2 pb-safe z-10 shrink-0">
        <ion-avatar class="shrink-0 h-[34px] w-[34px] shadow-sm">
          <img v-if="user?.img" :src="user.img" alt="Me" class="aspect-square object-cover" />
          <span v-else class="w-full h-full flex items-center justify-center font-bold text-black bg-black/5 text-sm">{{ user?.name?.charAt(0) }}</span>
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
            class="shrink-0 active:scale-90 transition-transform pl-2"
          >
            <ion-icon :icon="svg(mdiSend)" class="text-2xl text-secondary" />
          </button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, watch } from "vue";
import { useInfiniteScroll } from "@vueuse/core";
import {
	IonModal,
	IonSpinner,
	IonIcon,
	IonAvatar,
	IonInput,
	actionSheetController,
	alertController,
} from "@ionic/vue";
import {
	mdiSend,
	mdiFlagVariantOutline,
	mdiDeleteOutline,
	mdiDotsHorizontal,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { svg } from "@/helper/general.helper";
import { fetchPostComments, postComment } from "@/service/api/post.api";
import { usePostStore } from "@/store/post.store";
import { useModerationStore } from "@/store/moderation.store";
import { useToast } from "@/service/toast.service";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { getInboxComments } from "@/service/api/inbox.api";

const props = defineProps<{
	open: boolean;
	currItem: any;
	type: "post" | "inbox";
	user: any;
	userLookup?: (userId: string) => any;
	onComment?: (item: any, message: string) => Promise<any>;
}>();

const emit = defineEmits(["update:open"]);

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

const isPost = computed(() => props.type === "post");

// --- VueUse Infinite Scroll setup
useInfiniteScroll(
	scrollContainer,
	async () => {
		if (hasMore.value && !loadingOlder.value) {
			await loadOlderComments();
		}
	},
	{ direction: "top", distance: 40 },
);

// --- Author resolution (handles hydrated post comments AND raw inbox comments)
function getAuthorId(comment: any): string {
	return comment.author?._id || comment.author_id || comment.sender;
}

function getAuthorName(comment: any): string {
	if (comment.author?.name) return comment.author.name;
	const resolved = props.userLookup?.(comment.sender || comment.author_id);
	return resolved?.name || "Sketcher";
}

function getAuthorImg(comment: any): string | undefined {
	if (comment.author?.img) return comment.author.img;
	const resolved = props.userLookup?.(comment.sender || comment.author_id);
	return resolved?.img;
}

// --- Lifecycle: load comments when drawer opens
watch(
	() => props.open,
	async (isOpen) => {
		if (!isOpen || !props.currItem) return;

		hasMore.value = false;

		if (isPost.value) {
			comments.value = props.currItem.comments
				? [...props.currItem.comments]
				: [];
			loading.value = true;
			try {
				const res = await fetchPostComments(props.currItem._id, 20);
				comments.value = res.comments;
				hasMore.value = res.hasMore;
				scrollToBottom();
			} catch (e) {
				console.error("Failed to load post comments", e);
			} finally {
				loading.value = false;
			}
		} else {
			comments.value = props.currItem.comments
				? [...props.currItem.comments]
				: [];
			loading.value = true;
			try {
				const res = await getInboxComments(props.currItem._id, 20);
				comments.value = res.comments;
				hasMore.value = res.hasMore;
				scrollToBottom();
			} catch (e) {
				console.error("Failed to load inbox comments", e);
			} finally {
				loading.value = false;
			}
		}
	},
);

watch(
	() => props.currItem?._id,
	() => {
		comments.value = props.currItem?.comments
			? [...props.currItem.comments]
			: [];
	},
);

function openUser(userId: string) {
	if (userId) openUserActions({ _id: userId });
}

async function submitComment() {
	if (!newComment.value.trim() || !props.currItem || isSubmitting.value) return;
	const message = newComment.value;
	newComment.value = "";
	isSubmitting.value = true;

	try {
		if (isPost.value) {
			const res = await postComment(props.currItem._id, message);
			comments.value.push(res.comment);
			props.currItem.comment_count++;
			props.currItem.comments = [res.comment];
		} else if (props.onComment) {
			await props.onComment(props.currItem, message);
		}
		scrollToBottom();
	} catch (e) {
		console.error("Failed to post comment", e);
		toast("Failed to post comment", { color: "danger" });
		newComment.value = message; // restore text if it fails
	} finally {
		isSubmitting.value = false;
	}
}

async function loadOlderComments() {
	if (!hasMore.value || comments.value.length === 0 || loadingOlder.value) {
		return;
	}

	loadingOlder.value = true;

	// The first item in the array is the oldest loaded comment
	const oldestComment = comments.value[0];
	const oldestDate = oldestComment.date || oldestComment.createdAt;

	try {
		let res;
		if (isPost.value) {
			res = await fetchPostComments(props.currItem._id, 20, oldestDate);
		} else {
			res = await getInboxComments(props.currItem._id, 20, oldestDate);
		}

		const newComments = res.comments.filter(
			(c: any) => !comments.value.some((existing) => existing._id === c._id),
		);

		const container = scrollContainer.value;
		const previousScrollHeight = container ? container.scrollHeight : 0;
		const previousScrollTop = container ? container.scrollTop : 0;

		comments.value = [...newComments, ...comments.value];
		hasMore.value = res.hasMore;

		await nextTick();
		if (container) {
			// Keeps the user looking at the same comment they were just at
			container.scrollTop =
				previousScrollTop + (container.scrollHeight - previousScrollHeight);
		}
	} catch (e) {
		console.error("Failed to load older comments", e);
	} finally {
		loadingOlder.value = false;
	}
}

const scrollToBottom = async () => {
	await nextTick();
	if (scrollContainer.value) {
		scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
	}
};

function close() {
	emit("update:open", false);
}

// --- Comment actions
async function openCommentActions(comment: any) {
	const authorId = getAuthorId(comment);
	const isMine = authorId === props.user._id;

	const buttons: any[] = [];

	if (isMine && isPost.value) {
		// Only post comments have a delete endpoint right now
		buttons.push({
			text: "Delete Comment",
			role: "destructive",
			icon: svg(mdiDeleteOutline),
			handler: () => confirmDeleteComment(comment),
		});
	} else if (!isMine) {
		buttons.push({
			text: "Report Comment",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				moderationStore.openReport({
					type: isPost.value ? "comment" : "inbox_comment",
					id: comment._id,
					label: `${getAuthorName(comment)}'s comment`,
				});
			},
		});
	}

	if (buttons.length === 0) return;
	buttons.push({ text: "Cancel", role: "cancel" });

	const sheet = await actionSheetController.create({
		header: "Comment Options",
		cssClass: "liquid-action-sheet",
		buttons,
	});
	await sheet.present();
}

async function confirmDeleteComment(comment: any) {
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
					if (!props.currItem) return;
					try {
						await postStore.deletePostComment(props.currItem._id, comment._id);
						comments.value = comments.value.filter(
							(c) => c._id !== comment._id,
						);
						toast("Comment deleted");
					} catch (e) {
						toast("Failed to delete comment", { color: "danger" });
					}
				},
			},
		],
	});
	await alert.present();
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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