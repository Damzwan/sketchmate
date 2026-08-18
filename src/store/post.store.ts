import { defineStore } from "pinia";
import { ref } from "vue";
import {
	toggleReaction as apiReact,
	savePost as apiSave,
	unsavePost as apiUnsave,
	deleteComment,
	type FeedTab,
	fetchFeed,
	fetchPost,
	fetchSavedPosts,
} from "@/service/api/post.api";
import { fetchUserPosts } from "@/service/api/user.api";
import type { FeedPost } from "@/types/server.types";

export const FEED_TABS: FeedTab[] = ["for_you", "mates", "latest"];

export const usePostStore = defineStore("post", () => {
	// One cached list per tab. Switching tabs shouldn't re-hit the network for a
	// list we already pulled this session — the feed is a single capped fetch, so
	// there's nothing to page in and a refetch would just reshuffle under the user.
	const feedByTab = ref<Record<FeedTab, FeedPost[]>>({
		for_you: [],
		mates: [],
		latest: [],
	});
	const fetchedTabs = ref<Record<FeedTab, boolean>>({
		for_you: false,
		mates: false,
		latest: false,
	});
	const userPosts = ref<FeedPost[]>([]);
	const userPage = ref(1);
	const hasMoreUserPosts = ref(true);
	// Saved posts are their own paginated list rather than a filter over the
	// others: it is ordered by when YOU saved, not by when the post was made,
	// and most of what is on it was never in a list this session.
	const savedPosts = ref<FeedPost[]>([]);
	// A cursor, not a page number. Unsaving is the main thing people do on this
	// page, so the list shrinks under the reader — an offset would step over one
	// item for every one removed.
	const savedCursor = ref<string | null>(null);
	const hasMoreSavedPosts = ref(true);
	const isSavedDirty = ref(false);
	const isProfileDirty = ref(false);
	const isFeedDirty = ref(false);
	const limit = 20;
	const MAX_USER_POSTS = 200;
	const MAX_SAVED_POSTS = 200;
	const postCache = ref<Record<string, FeedPost>>({});
	const POST_CACHE_LIMIT = 60;
	const postCacheAccess = new Map<string, number>();
	const viewedFeedPostIds = new Set<string>();
	const VIEWED_FEED_POST_LIMIT = 500;
	let postCacheClock = 0;

	/** @param keep cache ceiling; memory pressure passes a smaller number. */
	function prunePostCache(keep = POST_CACHE_LIMIT) {
		const ids = Object.keys(postCache.value);
		if (ids.length <= keep) return;
		const staleIds = ids
			.sort(
				(a, b) => (postCacheAccess.get(a) || 0) - (postCacheAccess.get(b) || 0),
			)
			.slice(0, ids.length - keep);
		staleIds.forEach((id) => {
			delete postCache.value[id];
			postCacheAccess.delete(id);
		});
	}

	function cachePost(post: FeedPost) {
		if (!post?._id) return;
		postCache.value[post._id] = post;
		postCacheAccess.set(post._id, ++postCacheClock);
		prunePostCache();
	}

	function getCachedPost(postId: string): FeedPost | null {
		const post = postCache.value[postId] || null;
		if (post) postCacheAccess.set(postId, ++postCacheClock);
		return post;
	}

	function hasViewedFeedPost(postId: string) {
		return viewedFeedPostIds.has(postId);
	}

	/** Returns true only for the first qualifying view this app session. */
	function markFeedPostViewed(postId: string) {
		if (viewedFeedPostIds.has(postId)) return false;
		viewedFeedPostIds.add(postId);
		if (viewedFeedPostIds.size > VIEWED_FEED_POST_LIMIT) {
			const oldest = viewedFeedPostIds.values().next().value;
			if (oldest) viewedFeedPostIds.delete(oldest);
		}
		return true;
	}

	async function getFeed(tab: FeedTab = "for_you") {
		try {
			const res = await fetchFeed(tab, limit);
			feedByTab.value[tab] = res.feed;
			fetchedTabs.value[tab] = true;
			isFeedDirty.value = false;
		} catch (error) {
			console.error("Failed to fetch feed", error);
			throw error;
		}
	}

	/** Force every tab to re-pull on next view (feed_level changed, feed cleared). */
	function resetFeeds() {
		for (const tab of FEED_TABS) {
			feedByTab.value[tab] = [];
			fetchedTabs.value[tab] = false;
		}
	}

	/** Apply a mutation to every cached copy of a post across all three tabs. */
	function eachFeedList(fn: (list: FeedPost[]) => void) {
		for (const tab of FEED_TABS) fn(feedByTab.value[tab]);
	}

	async function getUserPosts(userId: string, isInitial = false) {
		if (isInitial) {
			userPage.value = 1;
			hasMoreUserPosts.value = true;
		}
		try {
			const res = await fetchUserPosts(userId, userPage.value, limit);
			const fetchedPosts = res.posts || [];
			if (isInitial) userPosts.value = fetchedPosts;
			else userPosts.value.push(...fetchedPosts);

			// Profile galleries are the one paginated list with no natural end, and
			// each entry drives a decoded thumbnail. Stop at the ceiling rather than
			// evict: the swiper indexes straight into this array, so dropping the
			// head would silently renumber every open slide.
			hasMoreUserPosts.value =
				fetchedPosts.length === limit &&
				userPosts.value.length < MAX_USER_POSTS;
			userPage.value++;
			isProfileDirty.value = false;
		} catch (error) {
			console.error("Failed to fetch gallery", error);
			throw error;
		}
	}

	function removePostLocally(postId: string) {
		for (const tab of FEED_TABS) {
			feedByTab.value[tab] = feedByTab.value[tab].filter(
				(p) => p._id !== postId,
			);
		}
		userPosts.value = userPosts.value.filter((p) => p._id !== postId);
		savedPosts.value = savedPosts.value.filter((p) => p._id !== postId);
	}

	/**
	 * Drop one user out of a post's shoutout list everywhere it is cached.
	 *
	 * The post itself stays: removing your tag is not a moderation action on
	 * someone else's work, it only takes your name off it.
	 */
	function removeMentionLocally(postId: string, userId: string) {
		const strip = (post: FeedPost) => {
			if (!post.mentions?.length) return;
			const remaining = post.mentions.filter((user) => user._id !== userId);
			post.mentions = remaining.length ? remaining : undefined;
		};

		eachFeedList((list) => {
			for (const post of list) if (post._id === postId) strip(post);
		});
		for (const post of userPosts.value) if (post._id === postId) strip(post);

		const cached = postCache.value[postId];
		if (cached) strip(cached);
	}

	function applyReactionToggle(post: FeedPost, type: string) {
		const isRemoving = post.user_reaction === type;
		const previousReaction = post.user_reaction;

		if (isRemoving) {
			post.user_reaction = null;
			post.reaction_counts[type]--;
		} else {
			if (previousReaction) post.reaction_counts[previousReaction]--;
			post.user_reaction = type;
			post.reaction_counts[type] = (post.reaction_counts[type] || 0) + 1;
		}
	}

	/**
	 * Optimistically toggle a reaction. Applies to every copy of the post we hold
	 * (feed list, profile list, plus the optional `target` object the caller is
	 * rendering — e.g. the photoswiper's currItem, which may be a separate object
	 * reference and otherwise wouldn't update its count). Deduped by identity so a
	 * post that lives in two of those never gets double-counted.
	 */
	async function toggleReactionLocally(
		postId: string,
		type: string,
		target?: FeedPost,
	) {
		const seen = new Set<FeedPost>();
		const collect = (post?: FeedPost) => {
			if (post && post._id === postId && !seen.has(post)) seen.add(post);
		};

		// The same post can sit in several tabs at once (For You and Latest, say),
		// and each is a distinct object — react in one, all of them must update.
		eachFeedList((list) => collect(list.find((p) => p._id === postId)));
		collect(userPosts.value.find((p) => p._id === postId));
		collect(savedPosts.value.find((p) => p._id === postId));
		collect(target);

		seen.forEach((post) => applyReactionToggle(post, type));
		return await apiReact(postId, type);
	}

	async function getSavedPosts(isInitial = false) {
		if (isInitial) {
			savedCursor.value = null;
			hasMoreSavedPosts.value = true;
		} else if (!savedCursor.value) {
			// No cursor means the last page was the last page. Guard here rather
			// than only in the view: an infinite-scroll event can land after the
			// end and would otherwise re-request page one and duplicate it.
			return;
		}

		try {
			const res = await fetchSavedPosts(limit, savedCursor.value ?? undefined);
			const fetched = res.posts || [];

			if (isInitial) {
				savedPosts.value = fetched;
			} else {
				// Dedupe by id. The cursor is a timestamp, so a save made while the
				// user is mid-scroll can shift a row across the page boundary.
				const known = new Set(savedPosts.value.map((p) => p._id));
				savedPosts.value.push(...fetched.filter((p) => !known.has(p._id)));
			}

			// The server derives both from BOOKMARK rows, not from how many posts
			// survived its active-post filter — a page can come back short (deleted
			// or moderated posts) and still have pages behind it.
			savedCursor.value = res.nextCursor;
			hasMoreSavedPosts.value = res.hasMore;

			// Same ceiling, and the same reason, as the profile gallery: every entry
			// holds a decoded thumbnail, and this list has no natural end. Stop
			// paging rather than evict — the swiper indexes straight into this
			// array, so dropping the head would renumber every open slide.
			if (savedPosts.value.length >= MAX_SAVED_POSTS) {
				hasMoreSavedPosts.value = false;
			}

			isSavedDirty.value = false;
		} catch (error) {
			console.error("Failed to fetch saved posts", error);
			throw error;
		}
	}

	/**
	 * Optimistically flip a post's bookmark, in every copy we hold — the feed
	 * tabs, the profile gallery, the saved list, the single-post cache, and the
	 * optional `target` the caller is rendering (the photoswiper's currItem is a
	 * separate object and otherwise wouldn't update its icon).
	 *
	 * On failure the flip is rolled back rather than left to the next fetch:
	 * unlike a reaction, a wrong bookmark state is invisible until the user opens
	 * the saved list and finds the post missing.
	 */
	async function toggleSaveLocally(postId: string, target?: FeedPost) {
		const seen = new Set<FeedPost>();
		const collect = (post?: FeedPost) => {
			if (post && post._id === postId && !seen.has(post)) seen.add(post);
		};

		eachFeedList((list) => collect(list.find((p) => p._id === postId)));
		collect(userPosts.value.find((p) => p._id === postId));
		collect(savedPosts.value.find((p) => p._id === postId));
		collect(postCache.value[postId]);
		collect(target);

		// Whichever copy we found first is as good a source of truth as any —
		// they are kept in lockstep by this function.
		const nextSaved = !(
			seen.values().next().value?.is_saved ?? target?.is_saved
		);
		seen.forEach((post) => {
			post.is_saved = nextSaved;
		});

		try {
			if (nextSaved) {
				await apiSave(postId);
				// The list is ordered by save time and this is the newest save, so a
				// re-open has to re-pull rather than trusting what it already holds.
				isSavedDirty.value = true;
			} else {
				await apiUnsave(postId);
				savedPosts.value = savedPosts.value.filter((p) => p._id !== postId);
			}
			return nextSaved;
		} catch (error) {
			seen.forEach((post) => {
				post.is_saved = !nextSaved;
			});
			throw error;
		}
	}

	function markSavedDirty() {
		isSavedDirty.value = true;
	}

	function markProfileDirty() {
		isProfileDirty.value = true;
	}
	function markFeedDirty() {
		isFeedDirty.value = true;
		// Every tab is derived from feed_level, so a change invalidates all three —
		// not just whichever one happens to be on screen.
		resetFeeds();
	}

	async function deletePostComment(postId: string, commentId: string) {
		const removeFrom = (list: FeedPost[]) => {
			const post = list.find((p) => p._id === postId);
			if (!post) return;
			if (post.comments) {
				post.comments = post.comments.filter((c) => c._id !== commentId);
			}
			if (typeof post.comment_count === "number" && post.comment_count > 0) {
				post.comment_count--;
			}
		};
		eachFeedList(removeFrom);
		removeFrom(userPosts.value);
		return await deleteComment(postId, commentId);
	}

	async function fetchSinglePost(postId: string): Promise<FeedPost | null> {
		const cached = getCachedPost(postId);
		if (cached) return cached;
		try {
			const res = await fetchPost(postId);
			if (res?.post) {
				cachePost(res.post);
				return res.post;
			}
		} catch (e) {
			console.error("Failed to fetch shared post:", e);
		}
		return null;
	}

	function resetRuntimeState() {
		resetFeeds();
		userPosts.value = [];
		userPage.value = 1;
		hasMoreUserPosts.value = true;
		savedPosts.value = [];
		savedCursor.value = null;
		hasMoreSavedPosts.value = true;
		isSavedDirty.value = false;
		isProfileDirty.value = false;
		isFeedDirty.value = false;
		postCache.value = {};
		postCacheAccess.clear();
		viewedFeedPostIds.clear();
		postCacheClock = 0;
	}

	return {
		feedByTab,
		fetchedTabs,
		resetFeeds,
		prunePostCache,
		userPosts,
		userPage,
		hasMoreUserPosts,
		savedPosts,
		savedCursor,
		hasMoreSavedPosts,
		isSavedDirty,
		getSavedPosts,
		toggleSaveLocally,
		markSavedDirty,
		isProfileDirty,
		isFeedDirty,
		getUserPosts,
		getFeed,
		removePostLocally,
		removeMentionLocally,
		toggleReactionLocally,
		deletePostComment,
		markProfileDirty,
		markFeedDirty,
		fetchSinglePost,
		cachePost,
		getCachedPost,
		hasViewedFeedPost,
		markFeedPostViewed,
		resetRuntimeState,
		postCache,
	};
});
