<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @will-present="onPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-comment-modal"
  >
    <div class="h-full flex flex-col bg-background cabin-sketch-regular overflow-hidden">
      <!-- Header -->
      <div class="shrink-0 pt-5 px-5 pb-3 text-center relative border-b border-black/5">
        <h1 class="text-xl text-black font-black tracking-tight italic leading-none">Comments</h1>
        <p v-if="comments.length > 0" class="text-[11px] text-black/40 font-bold uppercase tracking-widest mt-1">
          {{ comments.length }} {{ comments.length === 1 ? 'reply' : 'replies' }}
        </p>
      </div>

      <!-- Comments List -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto hide-scrollbar pb-4 pt-1"
        @touchmove.stop
      >
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
          :key="comment._id"
          class="flex items-start px-4 py-3 group"
        >
          <button
            @click="openUser(comment.author._id)"
            class="shrink-0 active:scale-95 transition-transform"
          >
            <ion-avatar class="h-[38px] w-[38px] bg-white/80 shadow-sm border border-black/5 overflow-hidden">
              <img v-if="comment.author.img" :src="comment.author.img" class="aspect-square object-cover" />
              <span v-else class="w-full h-full flex items-center justify-center font-bold text-black text-sm">
                {{ comment.author.name.charAt(0) }}
              </span>
            </ion-avatar>
          </button>

          <div
            class="flex-1 ml-3 min-w-0 pb-3"
            :class="{ 'border-b border-black/5': idx < comments.length - 1 }"
          >
            <div class="flex items-baseline justify-between gap-2">
              <button
                @click="openUser(comment.author._id)"
                class="text-sm font-black text-black truncate active:opacity-60 transition-opacity text-left"
              >
                {{ comment.author.name }}
              </button>
              <span class="text-[10px] text-black/40 font-bold uppercase tracking-wider shrink-0">
                {{ dayjs(comment.createdAt).fromNow() }}
              </span>
            </div>

            <p class="text-[14px] text-black/85 mt-1 leading-snug break-words">
              {{ comment.message }}
            </p>

            <div class="flex items-center mt-1.5 -ml-1">
              <button
                @click="openCommentActions(comment)"
                class="px-2 py-0.5 text-[11px] font-bold text-black/40 hover:text-black/70 active:opacity-60 transition-opacity uppercase tracking-wider"
              >
                More
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky Input Footer -->
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
import { ref, nextTick } from "vue";
import {
	IonModal,
	IonSpinner,
	IonIcon,
	IonAvatar,
	IonInput,
	actionSheetController,
	alertController,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { mdiSend, mdiFlagVariantOutline, mdiDeleteOutline } from "@mdi/js";
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
const isSubmitting = ref(false);
const newComment = ref("");

const onPresent = async () => {
	if (props.post) {
		comments.value = props.post.comments ? [...props.post.comments] : [];

		loading.value = true;
		try {
			const res = await fetchPostComments(props.post._id, 1, 50);
			comments.value = res.comments;
			scrollToBottom();
		} catch (e) {
			console.error("Failed to load comments", e);
		} finally {
			loading.value = false;
		}
	}
};

const openUser = (userId: string) => {
	openUserActions({ _id: userId });
};

const submitComment = async () => {
	if (!newComment.value.trim() || !props.post) return;
	isSubmitting.value = true;
	try {
		const res = await postComment(props.post._id, newComment.value);
		comments.value.push(res.comment);
		if (props.post) {
			props.post.comment_count++;
			props.post.comments = [res.comment];
		}
		newComment.value = "";
		scrollToBottom();
	} catch (e) {
		console.error("Failed to post comment", e);
	} finally {
		isSubmitting.value = false;
	}
};

const scrollToBottom = async () => {
	await nextTick();
	if (scrollContainer.value) {
		scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
	}
};

const handleDismiss = () => emit("close");

// --- Comment Actions ---

const openCommentActions = async (comment: any) => {
	const isMine = comment.author._id === user.value?._id;

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
					label: `${comment.author.name}'s comment`,
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

ion-modal.liquid-comment-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>