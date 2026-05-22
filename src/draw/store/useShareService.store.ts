import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import {
	DrawingExportInput,
	exportDrawingBlobs,
	uploadAssets,
} from "@/draw/shareDrawings";
import { useShareToastStore } from "@/draw/store/useShareToastStore.store";
import { getInboxUploadUrls, publishInboxItem } from "@/service/api/inbox.api";
import { getPostUploadUrls, publishPost } from "@/service/api/post.api";
import {
	getBalloonUploadUrls,
	publishBalloon,
} from "@/service/api/balloon.api";
import { useAuthStore } from "@/store/auth.store";
import { useQuotaStore } from "@/store/quota.store";

export interface PostSettings {
	caption: string;
	enable_comments: boolean;
	enable_remix: boolean;
}

export const useShareService = defineStore("shareService", () => {
	const isSending = ref(false);
	const toasts = useShareToastStore();
	const quota = useQuotaStore();
	const { user } = storeToRefs(useAuthStore());

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

		toasts.pushDrawingToast({
			inboxItem: inbox_item,
			currentUserId: user.value!._id,
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

		quota.decrementPost();
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
		isSending.value = true;
		try {
			await Promise.allSettled(tasks.map((t) => t()));
		} finally {
			isSending.value = false;
			void quota.refresh(true);
		}
	}

	return {
		isSending,
		sendToMates,
		publishCommunityPost,
		releaseBalloon,
		runBatch,
	};
});
