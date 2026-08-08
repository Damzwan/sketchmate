import { defineStore } from "pinia";
import { ref } from "vue";
import { resolveTitleDef } from "@/config/profile_options.config";
import { useInboxStore } from "@/store/inbox.store";
import { usePostStore } from "@/store/post.store";
import type { FeedPost, InboxItem } from "@/types/server.types";

export type ShareToastKind =
	| "drawing"
	| "post"
	| "balloon"
	| "saved"
	| "title"
	| "competition"
	| "shared";

export interface ShareToast {
	id: string;
	kind: ShareToastKind;
	title: string;
	subtitle: string;
	thumbnail?: string;
	emoji?: string;

	// Add optional field for saved drawing reference
	inboxId?: string;
	postId?: string;
	savedId?: string; // New reference

	// "shared" toasts open the chat on tap. When shared to a single mate we know
	// exactly which thread; otherwise we drop the user on the overview.
	shareTargetId?: string;
	shareTargetType?: "chat" | "user";
}

export const useShareToastStore = defineStore("shareToast", () => {
	const inboxStore = useInboxStore();
	const postStore = usePostStore();

	const toasts = ref<ShareToast[]>([]);
	// Presentation-only progress state. Keeping it here lets the global toast
	// renderer stay independent from the drawing export pipeline.
	const isSending = ref(false);
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	// Helper to get the actual item from stores reactively
	const getInboxItem = (id: string) =>
		inboxStore.inbox.find((i) => i._id === id);
	const getPost = (id: string) => postStore.getCachedPost(id);

	function push(toast: ShareToast) {
		if (toasts.value.length >= 4) {
			const dropped = toasts.value.shift();
			if (dropped) clearTimeout(timers.get(dropped.id)!);
		}
		toasts.value.push(toast);
		const t = setTimeout(() => dismiss(toast.id), 4500);
		timers.set(toast.id, t);
	}

	function dismiss(id: string) {
		if (timers.has(id)) {
			clearTimeout(timers.get(id)!);
			timers.delete(id);
		}
		toasts.value = toasts.value.filter((t) => t.id !== id);
	}

	// --- Public Push Methods ---
	function pushDrawingToast(params: {
		inboxItem: InboxItem;
		currentUserId: string;
	}) {
		const recipientCount = Math.max(
			0,
			(params.inboxItem.followers?.length || 0) - 1,
		);

		push({
			id: `toast-${Date.now()}`,
			kind: "drawing",
			title: recipientCount === 0 ? "Saved!" : "Sent!",
			subtitle:
				recipientCount === 0
					? "Saved to your gallery"
					: `Shared with ${recipientCount} mates`,
			thumbnail: params.inboxItem.thumbnail,
			inboxId: params.inboxItem._id,
		});
	}

	/** Forwarded an existing post/drawing to mates from the share sheet. Tapping
	 *  it jumps into the chat (single mate → that thread, many → overview). */
	function pushSharedToast(params: {
		count: number;
		thumbnail?: string;
		target?: { id: string; type: "chat" | "user" };
	}) {
		push({
			id: `toast-${Date.now()}`,
			kind: "shared",
			title: "Sent!",
			subtitle:
				params.count === 1
					? "Shared with 1 mate"
					: `Shared with ${params.count} mates`,
			thumbnail: params.thumbnail,
			shareTargetId: params.target?.id,
			shareTargetType: params.target?.type,
		});
	}

	function pushPostToast(params: { post: FeedPost }) {
		push({
			id: `toast-${Date.now()}`,
			kind: "post",
			title: "Posted!",
			subtitle: "Live on the community feed",
			thumbnail: params.post.thumbnail_url,
			postId: params.post._id,
		});
	}

	function pushCompetitionToast(params: {
		thumbnail?: string;
		replaced?: boolean;
		/** "quota" when the entry landed but the cross-post could not. */
		postSkipped?: string;
	}) {
		push({
			id: `toast-${Date.now()}`,
			kind: "competition",
			title: params.replaced ? "Entry replaced" : "You're in!",
			subtitle:
				params.postSkipped === "quota"
					? "Entered — no posts left today, so it wasn't shared to the feed"
					: "Entered in this week's competition",
			thumbnail: params.thumbnail,
			emoji: "🏆",
		});
	}

	function pushBalloonToast(params: { message: string }) {
		push({
			id: `toast-${Date.now()}`,
			kind: "balloon",
			title: "Balloon released",
			subtitle: params.message?.trim()
				? `“${params.message.trim()}”`
				: "Drifting to a stranger…",
		});
	}

	function pushSavedToast(params: { saved: any }) {
		push({
			id: `toast-${Date.now()}`,
			kind: "saved",
			title: "Saved!",
			subtitle: "Added to your collection",
			thumbnail: params.saved.img,
			savedId: params.saved._id,
		});
	}

	/** Title earned — emoji-led toast, no thumbnail. Accepts a bare title id
	 *  (`early-tester`) or an inventory item id (`title.early-tester`). Returns
	 *  false if the title is unknown so callers don't fire on garbage. */
	function pushTitleToast(titleOrItemId: string): boolean {
		const id = titleOrItemId.replace(/^title\./, "");
		const def = resolveTitleDef(id);
		if (!def) return false;
		push({
			id: `toast-${Date.now()}-${id}`,
			kind: "title",
			title: `${def.name} unlocked!`,
			subtitle: def.desc,
			emoji: def.emoji,
		});
		return true;
	}

	return {
		toasts,
		isSending,
		dismiss,
		pushDrawingToast,
		pushSharedToast,
		pushPostToast,
		getInboxItem, // Expose these to component
		getPost,
		pushBalloonToast,
		pushCompetitionToast,
		pushSavedToast,
		pushTitleToast,
	};
});
