<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="close"
    @did-present="onDidPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-comment-modal"
  >
    <div class="h-full flex flex-col bg-background cabin-sketch-regular overflow-y-auto max-h-[85vh]">
      <div class="shrink-0 pt-4 px-5 pb-3 text-center relative border-b border-black/5">
        <h1 class="text-xl text-black font-black tracking-tight italic leading-none">Comments</h1>
        <p v-if="currItem?.comment_count > 0" class="text-xs text-black/80 font-bold uppercase tracking-widest mt-1">
          {{ currItem.comment_count }} {{ currItem.comment_count === 1 ? 'reply' : 'replies' }}
        </p>
      </div>

      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="close" fill="clear" color="dark" class="m-0">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
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
          <p class="text-black/80 italic">No comments yet.</p>
          <p class="text-sm text-black/80 mt-1">Be the first to say something nice.</p>
        </div>

        <div
          v-else
          v-for="(comment, idx) in comments"
          :key="comment._id || idx"
          class="flex items-start px-4 py-3 relative"
        >
          <button @click="openUser(getAuthorId(comment))" class="shrink-0 cursor-pointer active:scale-95 transition-transform">
            <ion-avatar class="h-[38px] w-[38px] bg-white/80 shadow-sm border border-black/5 overflow-hidden">
<img width="1" height="1" loading="lazy" decoding="async" v-if="getAuthorImg(comment)" :src="getAuthorImg(comment)" class="aspect-square object-cover" />
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
                class="text-sm font-black cursor-pointer text-black truncate active:opacity-60 transition-opacity text-left"
              >
                {{ getAuthorName(comment) }}
              </button>
              <span class="text-xs text-black/80 uppercase tracking-wider shrink-0 pr-7">
                {{ dayjs(comment.createdAt || comment.date).fromNow() }}
              </span>
            </div>

            <p class="text-sm text-black/85 mt-1 leading-snug break-words">
              {{ safeText(comment.message, comment.message_filtered) }}
            </p>
          </div>

          <button
            @click.stop="openCommentActions(comment)"
            class="absolute cursor-pointer top-3 right-3 p-1.5 active:scale-90 transition-transform"
          >
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg text-black/80" />
          </button>
        </div>
      </div>

      <div
        class="flex w-full items-center gap-2 bg-background sticky bottom-0 border-t border-black/10 px-3 py-3 pb-safe z-10 shrink-0">
        <ion-avatar class="shrink-0 h-[34px] w-[34px] shadow-sm">
<img width="1" height="1" loading="lazy" decoding="async" v-if="user?.img" :src="user.img" alt="Me" class="aspect-square object-cover" />
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
            class="flex-1 font-bold text-sm"
          />
          <button
            v-show="newComment.trim().length > 0"
            @mousedown.prevent
            @click="submitComment"
            :disabled="isSubmitting"
            class="shrink-0 active:scale-90 cursor-pointer transition-transform pl-2"
          >
            <ion-icon :icon="svg(mdiSend)" class="text-2xl text-secondary" />
          </button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import {
	IonAvatar,
	IonButton,
	IonIcon,
	IonInput,
	IonModal,
	IonSpinner,
} from "@ionic/vue";
import { mdiClose, mdiDotsHorizontal, mdiSend } from "@mdi/js";
import { useInfiniteScroll } from "@vueuse/core";
import dayjs from "dayjs";
import { nextTick, ref, watch } from "vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { svg } from "@/helper/general.helper";
import { safeText } from "@/helper/profanity.helper";
import { useToast } from "@/service/toast.service";
import { useCommentActions } from "./useCommentActions";
import { useCommentSubject } from "./useCommentSubject";

const props = defineProps<{
	open: boolean;
	currItem: any;
	type: "post" | "inbox" | "competition";
	user: any;
	userLookup?: (userId: string) => any;
	onComment?: (item: any, message: string) => Promise<any>;
}>();

const emit = defineEmits(["update:open"]);

const { openUserActions } = useUserContextSheet();
const { toast } = useToast();

const scrollContainer = ref<HTMLElement | null>(null);
const input = ref<any>();
const comments = ref<any[]>([]);
const loading = ref(false);
const loadingOlder = ref(false);
const isSubmitting = ref(false);
const newComment = ref("");
const hasMore = ref(false);

const { getAuthorId, getAuthorName, getAuthorImg, fetchPage, submit, remove } =
	useCommentSubject(props);
const { openCommentActions } = useCommentActions({
	props,
	comments,
	authorId: getAuthorId,
	authorName: getAuthorName,
	remove,
});

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

watch(
	() => props.open,
	async (isOpen) => {
		if (!isOpen || !props.currItem) return;

		// Initialize with local preview comments if they exist
		comments.value = props.currItem.comments
			? [...props.currItem.comments]
			: [];

		// Skip the network only when the server also says there are none.
		// Preview array can be empty while comment_count > 0 (no preview loaded).
		if (comments.value.length === 0 && !(props.currItem.comment_count > 0)) {
			hasMore.value = false;
			loading.value = false;
			return; // Focus handled by onDidPresent
		}

		hasMore.value = false;
		loading.value = true;

		try {
			const res = await fetchPage();

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

// --- Handles switching items entirely when drawer is already open
watch(
	() => props.currItem?._id,
	() => {
		if (props.open) {
			comments.value = props.currItem?.comments
				? [...props.currItem.comments]
				: [];
		}
	},
);

// --- Watch deep changes for incoming items arriving via Socket or Pulse
watch(
	() => props.currItem?.comments,
	(newIncomingComments) => {
		if (!props.open || !newIncomingComments) return;

		// Find comments in the new prop data that aren't present in our local state
		const incomingNewArray = newIncomingComments.filter(
			(incoming: any) =>
				!comments.value.some((local) => local._id === incoming._id),
		);

		// Only append fresh socket/pulse payloads to the bottom without dropping our local history
		if (incomingNewArray.length > 0) {
			comments.value = [...comments.value, ...incomingNewArray];
			scrollToBottom();
		}
	},
	{ deep: true },
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
		const comment = await submit(message);
		if (comment) {
			comments.value.push(comment);
			props.currItem.comment_count = (props.currItem.comment_count ?? 0) + 1;
			props.currItem.comments = [...(props.currItem.comments || []), comment];
		}
		scrollToBottom();
	} catch (e) {
		console.error("Failed to post comment", e);
		toast("Failed to post comment", { color: "danger" });
		newComment.value = message;
	} finally {
		isSubmitting.value = false;
	}
}

async function loadOlderComments() {
	if (!hasMore.value || comments.value.length === 0 || loadingOlder.value)
		return;

	loadingOlder.value = true;
	const oldestComment = comments.value[0];
	const oldestDate = oldestComment.date || oldestComment.createdAt;

	try {
		const res = await fetchPage(oldestDate);

		const newComments = res.comments.filter(
			(c: any) => !comments.value.some((existing) => existing._id === c._id),
		);

		const container = scrollContainer.value;
		const previousScrollHeight = container ? container.scrollHeight : 0;
		const previousScrollTop = container ? container.scrollTop : 0;

		// Prepend the loaded historical comments to our current state
		comments.value = [...newComments, ...comments.value];
		hasMore.value = res.hasMore;

		await nextTick();
		if (container) {
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

// Fires once the modal is fully presented — the only reliable moment to focus
// the input on iOS. Empty thread → focus to invite a comment; otherwise scroll.
async function onDidPresent() {
	await nextTick();
	if (!loading.value && comments.value.length === 0) {
		input.value?.$el?.setFocus();
	} else {
		scrollToBottom();
	}
}

function close() {
	emit("update:open", false);
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

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
