import { defineStore } from "pinia";
import { ref } from "vue";
import { InboxItem, Mate, CommentRes, Comment } from "@/types/server.types";
import { useAPI } from "@/service/api/api.service";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";
import { viewCommentButton } from "@/config/toast.config";
import { useAuthStore } from "@/store/auth.store";
import { getInboxComments, getInboxV2 } from "@/router/inbox.router";

const INBOX_PAGE_SIZE = 20;
const COMMENT_PAGE_SIZE = 20;
// must match GALLERY_COMMENT_LIMIT on the backend
const GALLERY_COMMENT_LIMIT = 4;

const commentKey = (c: Comment) =>
	c._id ?? `${c.date}|${c.sender}|${c.message}`;

export const useInboxStore = defineStore("inbox", () => {
	const inbox = ref<InboxItem[]>([]);
	const inboxUsers = ref<Mate[]>([]);

	const isInboxLoading = ref(false);
	const hasFetchedInbox = ref(false);

	// inbox pagination
	const hasMoreInbox = ref(true);
	const isLoadingMoreInbox = ref(false);

	// comment pagination — track items whose full history is loaded
	const fullyLoadedComments = ref<Set<string>>(new Set());

	const api = useAPI();

	function mergeUsers(users: Mate[]) {
		for (const u of users) {
			if (!inboxUsers.value.find((x) => x._id === u._id))
				inboxUsers.value.push(u);
		}
	}

	async function getInbox() {
		try {
			const { user } = useAuthStore();
			if (!user) return;
			isInboxLoading.value = true;
			hasMoreInbox.value = true;

			if (user.inbox.length === 0) {
				inbox.value = [];
				hasMoreInbox.value = false;
				hasFetchedInbox.value = true;
				return;
			}

			const res = await getInboxV2({
				user_id: user._id,
				limit: INBOX_PAGE_SIZE,
			});
			if (!res) throw new Error();

			// backend already sorts date desc — no reverse needed
			inbox.value = res.inboxItems;
			mergeUsers(res.userInfo);

			hasMoreInbox.value = res.inboxItems.length === INBOX_PAGE_SIZE;
			hasFetchedInbox.value = true;
		} catch (e) {
			console.error(e);
		} finally {
			isInboxLoading.value = false;
		}
	}

	async function loadMoreInbox() {
		if (!hasMoreInbox.value || isLoadingMoreInbox.value || !inbox.value.length)
			return;
		try {
			const { user } = useAuthStore();
			if (!user) return;
			isLoadingMoreInbox.value = true;

			const lastDate = inbox.value[inbox.value.length - 1].date.toString();
			const res = await getInboxV2({
				user_id: user._id,
				limit: INBOX_PAGE_SIZE,
				lastDate,
			});
			if (!res) throw new Error();

			const seen = new Set(inbox.value.map((i) => i._id));
			const fresh = res.inboxItems.filter((i) => !seen.has(i._id));
			inbox.value.push(...fresh);
			mergeUsers(res.userInfo);

			hasMoreInbox.value = res.inboxItems.length === INBOX_PAGE_SIZE;
		} catch (e) {
			console.error(e);
		} finally {
			isLoadingMoreInbox.value = false;
		}
	}

	function hasMoreComments(item?: any): boolean {
		if (!item) return false;
		if (fullyLoadedComments.value.has(item._id)) return false;
		return (item.comment_count ?? 0) > item.comments.length;
	}

	async function loadMoreComments(item: InboxItem) {
		if (!hasMoreComments(item)) return;
		try {
			const beforeDate = item.comments[0]?.date.toString();
			const res = await getInboxComments({
				inbox_id: item._id,
				limit: COMMENT_PAGE_SIZE,
				beforeDate,
			});
			if (!res) return;

			const existing = new Set(item.comments.map(commentKey));
			const fresh = res.comments.filter((c) => !existing.has(commentKey(c)));
			if (fresh.length) item.comments.unshift(...fresh);

			if (!res.hasMore) {
				// reassign so the Set change is reactive
				fullyLoadedComments.value = new Set(fullyLoadedComments.value).add(
					item._id,
				);
			}
		} catch (e) {
			console.error(e);
		}
	}
	async function addComment(commentRes: CommentRes) {
		if (!inbox.value.length) await getInbox();

		const index = inbox.value.findIndex(
			(i) => i._id === commentRes.inbox_item_id,
		);
		if (index === -1) return; // item not on a loaded page yet; picks up on next fetch

		const item = inbox.value[index];

		// socket echo + optimistic insert can race — key off _id
		const exists = item.comments.some(
			(c) => commentKey(c) === commentKey(commentRes.comment),
		);
		if (!exists) item.comments.push(commentRes.comment);

		item.comment_count += 1;
		item.comments_seen_by = [commentRes.comment.sender];

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

	return {
		inbox,
		inboxUsers,
		isInboxLoading,
		hasFetchedInbox,
		hasMoreInbox,
		isLoadingMoreInbox,

		getInbox,
		loadMoreInbox,
		addComment,
		findUserInInboxUsers,
		hasMoreComments,
		loadMoreComments,
	};
});
