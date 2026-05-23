import { defineStore } from "pinia";
import { ref } from "vue";
import { InboxItem, Mate, CommentRes, GetInboxRes } from "@/types/server.types";
import { useAuthStore } from "@/store/auth.store";
import {
	getInbox,
	getSingleInboxItem,
	syncInboxItems,
} from "@/service/api/inbox.api";

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
	 * Syncs only new items that arrived since our newest cached item.
	 */
	async function syncNewItems() {
		if (inbox.value.length === 0) return getInboxBatch(true);

		const newestDate = inbox.value[0].date;

		try {
			const res = await syncInboxItems(newestDate);
			if (res?.inboxItems?.length > 0) {
				// Prepend new items
				inbox.value = [...res.inboxItems, ...inbox.value];

				for (const u of res.userInfo || []) {
					if (!inboxUsers.value.find((x) => x._id === u._id)) {
						inboxUsers.value.push(u);
					}
				}
			}
		} catch (e) {
			console.error("Failed to sync new inbox items:", e);
		}
	}

	/**
	 * Fetches a specific inbox item if it's not already in the store.
	 */
	async function fetchSingleInboxItem(inboxId: string) {
		const existing = inbox.value.find((item) => item._id === inboxId);
		if (existing) return existing;

		try {
			const res = await getSingleInboxItem(inboxId);
			if (res?.inboxItem) {
				for (const u of res.userInfo || []) {
					if (!inboxUsers.value.find((x) => x._id === u._id)) {
						inboxUsers.value.push(u);
					}
				}
				inbox.value.push(res.inboxItem);
				return res.inboxItem;
			}
		} catch (e) {
			console.error("Failed to fetch specific inbox item:", e);
		}
		return null;
	}

	/**
	 * Updates the inbox when a new comment arrives via socket or pulse.
	 */
	async function addComment(commentRes: CommentRes) {
		const index = inbox.value.findIndex(
			(i) => i._id === commentRes.inbox_item_id,
		);
		if (index === -1) return;

		const alreadyExists = inbox.value[index].comments.some(
			(c) => c._id === commentRes.comment._id,
		);
		if (alreadyExists) return;

		inbox.value[index].comments.push(commentRes.comment);
		inbox.value[index].comments_seen_by = [commentRes.comment.sender];
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

	function hasItem(inboxId: string): boolean {
		return inbox.value.some((item) => item._id === inboxId);
	}

	return {
		inbox,
		inboxUsers,
		isInboxLoading,
		allLoaded,
		hasFetchedInitial,
		getInboxBatch,
		syncNewItems,
		fetchSingleInboxItem,
		addComment,
		findUserInInboxUsers,
		removeFromLocalInbox,
		hasItem,
	};
});
