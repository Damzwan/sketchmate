import { defineStore } from "pinia";
import { ref } from "vue";
import type { FeedPost, InboxItem } from "@/types/server.types";

export type ShareToastKind = "drawing" | "post" | "balloon";

export interface ShareToast {
	id: string;
	kind: ShareToastKind;

	title: string;
	subtitle: string;

	thumbnail?: string;

	inboxItem?: InboxItem;
	post?: FeedPost;
}

const AUTO_DISMISS_MS = 4500;
const MAX_TOASTS = 4;

let counter = 0;
const nextId = () => `share-toast-${Date.now()}-${++counter}`;

export const useShareToastStore = defineStore("shareToast", () => {
	const toasts = ref<ShareToast[]>([]);
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	function push(toast: ShareToast) {
		if (toasts.value.length >= MAX_TOASTS) {
			const dropped = toasts.value.shift();
			if (dropped) clearTimer(dropped.id);
		}
		toasts.value.push(toast);

		const t = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
		timers.set(toast.id, t);
	}

	function clearTimer(id: string) {
		const t = timers.get(id);
		if (t) {
			clearTimeout(t);
			timers.delete(id);
		}
	}

	function dismiss(id: string) {
		clearTimer(id);
		toasts.value = toasts.value.filter((t) => t.id !== id);
	}

	function clearAll() {
		timers.forEach((t) => clearTimeout(t));
		timers.clear();
		toasts.value = [];
	}

	function pushDrawingToast(params: {
		inboxItem: InboxItem;
		currentUserId: string;
	}) {
		const recipientCount = Math.max(
			0,
			(params.inboxItem.followers?.length || 0) -
				(params.inboxItem.followers?.includes(params.currentUserId) ? 1 : 0),
		);

		const subtitle =
			recipientCount === 0
				? "Saved to your gallery"
				: recipientCount === 1
					? "Shared with 1 mate"
					: `Shared with ${recipientCount} mates`;

		push({
			id: nextId(),
			kind: "drawing",
			title: recipientCount === 0 ? "Saved!" : "Sent!",
			subtitle,
			thumbnail: params.inboxItem.thumbnail,
			inboxItem: params.inboxItem,
		});
	}

	function pushPostToast(params: { post: FeedPost }) {
		push({
			id: nextId(),
			kind: "post",
			title: "Posted!",
			subtitle: "Live on the community feed",
			thumbnail: params.post.thumbnail_url,
			post: params.post,
		});
	}

	function pushBalloonToast(params: { message: string }) {
		push({
			id: nextId(),
			kind: "balloon",
			title: "Balloon released",
			subtitle: params.message?.trim()
				? `“${params.message.trim()}”`
				: "Drifting to a stranger…",
		});
	}

	return {
		toasts,
		dismiss,
		clearAll,
		pushDrawingToast,
		pushPostToast,
		pushBalloonToast,
	};
});
