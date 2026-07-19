import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { InboxItem, CommentRes, GetInboxRes } from "@/types/server.types";
import { useAuthStore } from "@/store/auth.store";
import { useUserCacheStore } from "@/store/userCache.store";
import {
	getInbox,
	getSingleInboxItem,
	syncInboxItems,
} from "@/service/api/inbox.api";

export const useInboxStore = defineStore("inbox", () => {
	const inbox = ref<InboxItem[]>([]);
	const isInboxLoading = ref(false);

	// Id → item index. Chat renders one bubble per message and each shared-sketch
	// bubble used to `inbox.find(...)`, so looking up N bubbles cost N × inbox
	// length. Built once per inbox change and shared by every lookup instead.
	const inboxById = computed(() => {
		const map = new Map<string, InboxItem>();
		for (const item of inbox.value) map.set(item._id, item);
		return map;
	});

	const getInboxItem = (id?: string | null) =>
		id ? (inboxById.value.get(id) ?? null) : null;

	const allLoaded = ref(false);

	const hasFetchedInitial = ref(false);

	const PAGE_SIZE = 30;

	/**
	 * Fetch the next page of inbox items.
	 * @param reset - Clear current inbox and start from the beginning.
	 */
	async function getInboxBatch(reset = false) {
		if (isInboxLoading.value || (allLoaded.value && !reset)) return;

		const { user } = useAuthStore();
		if (!user) return;

		isInboxLoading.value = true;
		try {
			if (reset) {
				inbox.value = [];
				allLoaded.value = false;
			}

			const lastDate =
				!reset && inbox.value.length > 0
					? inbox.value[inbox.value.length - 1].date
					: undefined;

			const retrieved: GetInboxRes = await getInbox({
				user_id: user._id,
				limit: PAGE_SIZE,
				lastDate,
			} as any);

			if (!retrieved) throw new Error("No data received from inbox endpoint");

			if (retrieved.inboxItems.length < PAGE_SIZE) {
				allLoaded.value = true;
			}

			inbox.value = reset
				? retrieved.inboxItems
				: [...inbox.value, ...retrieved.inboxItems];

			// Single source of truth for user data
			useUserCacheStore().upsertMany(retrieved.userInfo);

			hasFetchedInitial.value = true;
		} catch (e) {
			console.error("Failed to fetch inbox batch:", e);
		} finally {
			isInboxLoading.value = false;
		}
	}

	/**
	 * Fetch only items newer than what we already have. Used on focus / socket reconnect.
	 */
	async function syncNewItems() {
		if (inbox.value.length === 0) return getInboxBatch(true);

		const newestDate = inbox.value[0].date;
		try {
			const res = await syncInboxItems(newestDate);
			if (res?.inboxItems?.length) {
				inbox.value = [...res.inboxItems, ...inbox.value];
				useUserCacheStore().upsertMany(res.userInfo ?? []);
			}
		} catch (e) {
			console.error("Failed to sync new inbox items:", e);
		}
	}

	/**
	 * Fetch a single inbox item, e.g. when opening from a push notification.
	 * Returns the cached item if already present.
	 */
	async function fetchSingleInboxItem(
		inboxId: string,
	): Promise<InboxItem | null> {
		const existing = inbox.value.find((item) => item._id === inboxId);
		if (existing) return existing;

		try {
			const res = await getSingleInboxItem(inboxId);
			if (res?.inboxItem) {
				useUserCacheStore().upsertMany(res.userInfo ?? []);
				inbox.value.push(res.inboxItem);
				return res.inboxItem;
			}
		} catch (e) {
			console.error("Failed to fetch specific inbox item:", e);
		}
		return null;
	}

	/**
	 * Append a comment arriving via socket or pulse.
	 */
	function addComment(commentRes: CommentRes) {
		const index = inbox.value.findIndex(
			(i) => i._id === commentRes.inbox_item_id,
		);
		if (index === -1) return;

		const alreadyExists = inbox.value[index].comments.some(
			(c) => c._id === commentRes.comment._id,
		);
		if (alreadyExists) return;

		inbox.value[index].comments.push(commentRes.comment);
		inbox.value[index].comment_count += 1;
		inbox.value[index].comments_seen_by = [commentRes.comment.sender];
	}

	function findUserInInboxUsers(id: string) {
		return useUserCacheStore().getUser(id);
	}

	function removeFromLocalInbox(inboxId: string) {
		inbox.value = inbox.value.filter((item) => item._id !== inboxId);
	}

	function hasItem(inboxId: string): boolean {
		return inboxById.value.has(inboxId);
	}

	return {
		inbox,
		inboxById,
		getInboxItem,
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
