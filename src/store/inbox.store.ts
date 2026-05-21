import { defineStore } from "pinia";
import { ref } from "vue";
import { InboxItem, Mate, CommentRes, GetInboxRes } from "@/types/server.types";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";
import { viewCommentButton } from "@/config/toast.config";
import { useAuthStore } from "@/store/auth.store";
import { getInbox } from "@/service/api/inbox.api";

export const useInboxStore = defineStore("inbox", () => {
	// --- State ---
	const inbox = ref<InboxItem[]>([]);
	const inboxUsers = ref<Mate[]>([]);
	const isInboxLoading = ref(false);

	// Tracks if we've reached the very end of the user's history
	const allLoaded = ref(false);

	// To avoid redundant fetches during the same session if needed
	const hasFetchedInitial = ref(false);

	/**
	 * Fetches a batch of inbox items.
	 * @param reset - If true, clears the current inbox and starts from the beginning.
	 */
	async function getInboxBatch(reset = false) {
		// Prevent overlapping fetches or fetching when we've reached the end
		if (isInboxLoading.value || (allLoaded.value && !reset)) return;

		try {
			const { user } = useAuthStore();
			if (!user) return;

			isInboxLoading.value = true;

			if (reset) {
				inbox.value = [];
				allLoaded.value = false;
			}

			const lastDate =
				inbox.value.length > 0 && !reset
					? inbox.value[inbox.value.length - 1].date
					: undefined;

			const limit = 30;

			const retrieved: GetInboxRes = await getInbox({
				user_id: user._id,
				limit,
				lastDate,
			} as any);

			if (!retrieved) throw new Error("No data received from gallery");

			// 3. Check if we've reached the end
			if (retrieved.inboxItems.length < limit) {
				allLoaded.value = true;
			}

			// 4. Append new items (API v2 already sorts by newest first)
			inbox.value = reset
				? retrieved.inboxItems
				: [...inbox.value, ...retrieved.inboxItems];

			// 5. Merge unique user info
			for (const u of retrieved.userInfo) {
				if (!inboxUsers.value.find((x) => x._id === u._id)) {
					inboxUsers.value.push(u);
				}
			}

			hasFetchedInitial.value = true;
		} catch (e) {
			console.error("Failed to fetch gallery batch:", e);
		} finally {
			isInboxLoading.value = false;
		}
	}

	/**
	 * Updates the inbox when a new comment arrives via socket or pulse.
	 */
	async function addComment(commentRes: CommentRes) {
		// If the gallery isn't loaded yet, we don't necessarily want to fetch the whole thing
		// but we check if the item exists in our current loaded set
		const index = inbox.value.findIndex(
			(i) => i._id === commentRes.inbox_item_id,
		);
		if (index === -1) return;

		// Update the reactive item
		inbox.value[index].comments.push(commentRes.comment);
		inbox.value[index].comments_seen_by = [commentRes.comment.sender];

		const { user } = useAuthStore();
		if (!user || commentRes.comment.sender === user._id) return;

		const sender = findUserInInboxUsers(commentRes.comment.sender);
		if (!sender) return;

		const { toast } = useToast();
		toast(`${sender.name} commented on a drawing`, {
			buttons: [viewCommentButton(commentRes.inbox_item_id)],
			duration: ToastDuration.medium,
		});
	}

	function findUserInInboxUsers(id: string): Mate | undefined {
		return inboxUsers.value.find((u) => u._id === id);
	}

	/**
	 * Local removal (optimistic UI update)
	 */
	function removeFromLocalInbox(inboxId: string) {
		inbox.value = inbox.value.filter((item) => item._id !== inboxId);
	}

	return {
		inbox,
		inboxUsers,
		isInboxLoading,
		allLoaded,
		hasFetchedInitial,
		getInboxBatch,
		addComment,
		findUserInInboxUsers,
		removeFromLocalInbox,
	};
});
