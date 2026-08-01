import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";
import {
	DrawingExportInput,
	exportDrawingBlobs,
	uploadAssets,
} from "@/draw/sharing/shareDrawings";
import { useShareToastStore } from "@/draw/sharing/shareToast.store";
import { getInboxUploadUrls, publishInboxItem } from "@/service/api/inbox.api";
import { getPostUploadUrls, publishPost } from "@/service/api/post.api";
import {
	getBalloonUploadUrls,
	publishBalloon,
} from "@/service/api/balloon.api";
import { useAuthStore } from "@/store/auth.store";
import { useQuotaStore } from "@/store/quota.store";
import { syncPostQuotaResetReminder } from "@/helper/notification.helper";
import { useInboxStore } from "@/store/inbox.store";
import { usePostStore } from "@/store/post.store";
import { FeedPost, InboxItem } from "@/types/server.types";
import { useChatStore } from "@/store/chat.store";
import { shouldShowThoughtPrompt } from "@/helper/general.helper";
import { recordEngagementAction, updateProfile } from "@/service/api/user.api";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { useGalleryData } from "@/composables/gallery/useGalleryData";
import { useRoute } from "vue-router";

export interface PostSettings {
	caption: string;
	enable_comments: boolean;
	enable_remix: boolean;
}

export type ShareableItem =
	| { type: "post"; data: FeedPost }
	| { type: "inbox"; data: InboxItem };

export const useShareService = defineStore("shareService", () => {
	const toasts = useShareToastStore();
	const isSending = computed(() => toasts.isSending);
	const quota = useQuotaStore();
	const preSelected = ref<"mate" | "balloon" | "post">("mate");
	const { user } = storeToRefs(useAuthStore());

	const activeShareItem = ref<ShareableItem | null>(null);

	function setActiveShareItem(item: ShareableItem | null) {
		activeShareItem.value = item;
	}

	async function shareItemToMates(
		item: ShareableItem,
		friendIds: string[],
	): Promise<{ successCount: number; totalCount: number }> {
		const chatStore = useChatStore();
		const totalCount = friendIds.length;
		let successCount = 0;

		await Promise.all(
			friendIds.map(async (friendId) => {
				const existingChat = chatStore.activeChats.find((c) =>
					c.participants.some((p: any) => p._id === friendId),
				);
				const tabId = existingChat?._id || friendId;

				const sharedPostId = item.type === "post" ? item.data._id : undefined;
				const sharedInboxId = item.type === "inbox" ? item.data._id : undefined;

				try {
					await chatStore.sendMessage(
						friendId,
						"",
						tabId,
						sharedPostId,
						sharedInboxId,
						{ silent: true },
					);
					successCount++;
				} catch (e) {
					console.error(`Failed sharing to friend ${friendId}`, e);
				}
			}),
		);

		if (successCount > 0) {
			const thumbnail =
				item.type === "post"
					? (item.data as any).thumbnail_url
					: (item.data as any).thumbnail;

			// Single recipient → tap opens that exact thread; many → the overview.
			let target: { id: string; type: "chat" | "user" } | undefined;
			if (friendIds.length === 1) {
				const fid = friendIds[0];
				const existingChat = chatStore.activeChats.find((c) =>
					c.participants.some((p: any) => p._id === fid),
				);
				target = existingChat
					? { id: existingChat._id, type: "chat" }
					: { id: fid, type: "user" };
			}

			toasts.pushSharedToast({ count: successCount, thumbnail, target });
		}

		return { successCount, totalCount };
	}

	async function sendToMates(
		data: DrawingExportInput,
		followers: string[],
	): Promise<void> {
		const blobs = await exportDrawingBlobs(data);

		const urls = await getInboxUploadUrls();
		const uploaded = await uploadAssets(urls, blobs);

		const { inbox_item } = await publishInboxItem({
			followers,
			drawing_url: uploaded.drawing_url,
			image_url: uploaded.image_url,
			thumbnail_url: uploaded.thumbnail_url,
			aspect_ratio: blobs.aspect_ratio,
		});

		const inboxStore = useInboxStore();
		inboxStore.inbox.unshift(inbox_item);

		const me = user.value!._id;
		const recipients = followers.filter((f) => f !== me);

		if (recipients.length === 0) {
			// Pure save-to-gallery — keep the photoswiper toast.
			toasts.pushDrawingToast({ inboxItem: inbox_item, currentUserId: me });
			return;
		}

		const chatStore = useChatStore();
		chatStore.injectSharedInboxOptimistic(inbox_item._id, recipients);

		// Single mate → tap the toast to jump into that thread; many → overview.
		let target: { id: string; type: "chat" | "user" } | undefined;
		if (recipients.length === 1) {
			const fid = recipients[0];
			const existingChat = chatStore.activeChats.find((c) =>
				c.participants.some((p: any) => p._id === fid),
			);
			target = existingChat
				? { id: existingChat._id, type: "chat" }
				: { id: fid, type: "user" };
		}

		toasts.pushSharedToast({
			count: recipients.length,
			thumbnail: inbox_item.thumbnail,
			target,
		});
	}

	async function publishCommunityPost(
		data: DrawingExportInput,
		settings: PostSettings,
	): Promise<void> {
		const blobs = await exportDrawingBlobs(data);

		const urls = await getPostUploadUrls();
		const uploaded = await uploadAssets(urls, blobs);

		const { post } = await publishPost({
			drawing_url: uploaded.drawing_url,
			image_url: uploaded.image_url,
			thumbnail_url: uploaded.thumbnail_url,
			aspect_ratio: blobs.aspect_ratio,
			description: settings.caption,
			enable_comments: settings.enable_comments,
			enable_remix: settings.enable_remix,
		});

		const postStore = usePostStore();
		postStore.cachePost(post);
		postStore.markProfileDirty();

		quota.decrementPost();
		void syncPostQuotaResetReminder(quota.posts);
		toasts.pushPostToast({ post });
	}

	async function releaseBalloon(
		data: DrawingExportInput,
		message: string,
	): Promise<void> {
		const blobs = await exportDrawingBlobs(data);

		const urls = await getBalloonUploadUrls();
		const uploaded = await uploadAssets(urls, blobs);

		await publishBalloon({
			message,
			drawing_url: uploaded.drawing_url,
			image_url: uploaded.image_url,
			thumbnail_url: uploaded.thumbnail_url,
			aspect_ratio: blobs.aspect_ratio,
		});

		quota.decrementBalloon();
		toasts.pushBalloonToast({ message });
	}

	async function runBatch(tasks: Array<() => Promise<void>>): Promise<void> {
		if (tasks.length === 0) return;
		toasts.isSending = true;
		try {
			const results = await Promise.allSettled(tasks.map((t) => t()));
			const anySucceeded = results.some((r) => r.status === "fulfilled");
			if (anySucceeded) {
				await recordEngagementAndMaybePrompt();
			}
		} finally {
			toasts.isSending = false;
			void quota.refresh(true);
		}
	}

	async function recordEngagementAndMaybePrompt(): Promise<void> {
		try {
			const { should_prompt } = await recordEngagementAction();
			if (should_prompt) {
				useMenuStore().openMenu(Menu.FeedbackMenu);
			}
		} catch (e) {
			// Never let engagement tracking break the share flow
			console.warn("Engagement tracking failed", e);
		}
	}

	return {
		isSending,
		sendToMates,
		publishCommunityPost,
		releaseBalloon,
		runBatch,
		preSelected,
		setActiveShareItem,
		activeShareItem,
		shareItemToMates,
	};
});
