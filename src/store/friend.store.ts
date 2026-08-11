import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getPendingRequests } from "@/service/api/chat.api";
import {
	fetchNetworkType,
	fetchUserStats,
	getBlockedIds,
	toggleFollow,
} from "@/service/api/relationship.api";
import {
	type FullProfileRes,
	fetchOnlineFriends,
	getFullProfile,
} from "@/service/api/user.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useUserCacheStore } from "@/store/userCache.store";
import type {
	ChatStatus,
	FeedPost,
	NetworkUser,
	PopulatedConversation,
	PublicUser,
} from "@/types/server.types";

export const useFriendStore = defineStore("friend", () => {
	const authStore = useAuthStore();
	const userCache = useUserCacheStore();

	const onlineFriendIds = ref<Set<string>>(new Set());
	const pendingRequests = ref<PopulatedConversation[]>([]);
	const friendRequestLoading = ref(false);
	const blockedUserIds = ref<Set<string>>(new Set());
	const totalCounts = ref<Record<"mates" | "following" | "followers", number>>({
		mates: 0,
		following: 0,
		followers: 0,
	});

	interface NetworkEntry {
		_id: string;
		chat_status?: ChatStatus;
		expires_at?: string;
		relationship_id?: string;
		last_interaction_at?: string;
	}

	const networkLists = ref<{
		mates: NetworkEntry[];
		following: NetworkEntry[];
		followers: NetworkEntry[];
	}>({ mates: [], following: [], followers: [] });

	const networkLoading = ref(false);
	const hasMore = ref(true);
	const targetProfile = ref<FullProfileRes["profile"] | null>(null);
	const targetPosts = ref<FeedPost[]>([]);
	const loadingProfile = ref(false);

	function resetRuntimeState() {
		onlineFriendIds.value = new Set();
		blockedUserIds.value = new Set();
		pendingRequests.value = [];
		friendRequestLoading.value = false;
		totalCounts.value = { mates: 0, following: 0, followers: 0 };
		networkLists.value = { mates: [], following: [], followers: [] };
		networkLoading.value = false;
		hasMore.value = true;
		targetProfile.value = null;
		targetPosts.value = [];
		loadingProfile.value = false;
	}

	const myStats = computed(
		() =>
			authStore.user?.stats || {
				mates: 0,
				followers: 0,
				following: 0,
				posts: 0,
			},
	);

	// --- GETTERS ---

	const isFriendOnline = computed(
		() => (userId: string) => onlineFriendIds.value.has(userId),
	);

	const onlineFriends = computed<NetworkUser[]>(() => {
		const result: NetworkUser[] = [];
		for (const id of onlineFriendIds.value) {
			const cached = userCache.getUser(id);
			if (cached) {
				result.push({ ...cached, chat_status: "mate" } as NetworkUser);
			}
		}
		return result;
	});

	const allConnectedPartners = computed<NetworkUser[]>(() => {
		const chatStore = useChatStore();
		const me = authStore.user?._id;
		if (!me) return [];

		const ids = new Set<string>();
		networkLists.value.mates.forEach((m) => ids.add(m._id));
		chatStore.activeChats.forEach((chat) => {
			if (!["mate", "temporary", "pending_mate"].includes(chat.status)) return;
			if (
				chat.status === "temporary" &&
				chat.trial_expires_at &&
				new Date(chat.trial_expires_at).getTime() <= Date.now()
			)
				return;
			const partner = chat.participants.find((p) => p._id !== me);
			if (partner) ids.add(partner._id);
		});

		const result: NetworkUser[] = [];
		for (const id of ids) {
			const cached = userCache.getUser(id);
			if (cached) {
				const networkEntry = networkLists.value.mates.find((m) => m._id === id);
				result.push({
					...cached,
					chat_status: networkEntry?.chat_status ?? "mate",
					relationship_id: networkEntry?.relationship_id,
					last_interaction_at: networkEntry?.last_interaction_at,
				} as NetworkUser);
			}
		}
		return result;
	});

	const isBlocked = computed(
		() => (userId: string) =>
			blockedUserIds.value.has(userId?.toString() ?? ""),
	);

	const resolvePartnerInfo = (id: string): NetworkUser | null => {
		if (!id) return null;

		const cached = userCache.getUser(id);
		if (!cached) return null;

		const chatStore = useChatStore();
		const allConvos = [...chatStore.activeChats, ...pendingRequests.value];
		const chat = allConvos.find((c) =>
			c.participants.some((p) => p._id === id),
		);
		const networkEntry = networkLists.value.mates.find((m) => m._id === id);

		return {
			...cached,
			chat_status: isBlocked.value(id)
				? "blocked"
				: (chat?.status ?? networkEntry?.chat_status),
			relationship_id: networkEntry?.relationship_id,
		} as NetworkUser;
	};

	async function initializeSocialGraph() {
		const [onlineIds] = await Promise.all([
			fetchInitialOnlineFriends(),
			fetchPendingRequests(), // Seeds cache with pending users
			fetchBlockedUsers(), // Evicts blocked users
		]);

		if (onlineIds && Array.isArray(onlineIds)) {
			onlineIds.forEach((id) => onlineFriendIds.value.add(id));
		}
	}

	async function fetchInitialOnlineFriends(): Promise<string[]> {
		try {
			return await fetchOnlineFriends();
		} catch (e) {
			console.error("Failed to fetch initial online friends", e);
			return [];
		}
	}

	async function setFriendOnlineStatus(userId: string, isOnline: boolean) {
		if (isOnline) {
			onlineFriendIds.value.add(userId);
			// Trigger a cache fill if we don't already have this user
			userCache.getUser(userId);
		} else {
			onlineFriendIds.value.delete(userId);
		}
	}

	async function fetchPendingRequests() {
		friendRequestLoading.value = true;
		try {
			const convos = await getPendingRequests();
			pendingRequests.value = convos;
			// Ingest all participant data into the cache
			convos.forEach((c) => userCache.upsertMany(c.participants));
		} catch (e) {
			console.error("Failed to fetch pending requests:", e);
		} finally {
			friendRequestLoading.value = false;
		}
	}

	async function getProfile(userId: string) {
		loadingProfile.value = true;
		try {
			const res = await getFullProfile(userId);
			targetProfile.value = res.profile;
			targetPosts.value = res.posts;
			userCache.upsert(res.profile);
		} catch (e) {
			console.error("Error fetching target profile:", e);
		} finally {
			loadingProfile.value = false;
		}
	}

	// Monotonic token per list type. A new request bumps the token; when an
	// in-flight response resolves it is dropped unless it is still the latest.
	// Kills races where a stale page (e.g. page 2 of a previous search term)
	// lands after a fresh page-1 reset and pollutes the list.
	const networkRequestToken: Record<string, number> = {
		mates: 0,
		following: 0,
		followers: 0,
	};

	async function getNetworkList(
		type: "mates" | "following" | "followers",
		userId: string,
		page = 1,
		search = "",
	) {
		const token = ++networkRequestToken[type];
		if (page === 1) networkLoading.value = true;
		try {
			// API now returns an object shape: { total: number, data: any[] }
			const res: {
				total: number;
				data: (any & {
					chat_status?: ChatStatus;
					expires_at?: string;
					relationship_id?: string;
					last_interaction_at?: string;
				})[];
			} = await fetchNetworkType(userId, type, { page, search, limit: 20 });

			// Stale response — a newer request superseded this one. Drop it.
			if (token !== networkRequestToken[type]) return;

			const records = res.data || [];
			const totalCount = res.total || 0;

			// Save total match count immediately for the layout badge
			totalCounts.value[type] = totalCount;

			// Feed user identity profiles into the cache list
			userCache.upsertMany(records);

			// Store only relationship-flavored metadata values locally
			const entries: NetworkEntry[] = records.map((u) => ({
				_id: u._id,
				chat_status: u.chat_status,
				expires_at: u.expires_at,
				relationship_id: u.relationship_id,
				last_interaction_at: u.last_interaction_at,
			}));

			const before = networkLists.value[type].length;
			if (page === 1) {
				networkLists.value[type] = entries;
			} else {
				// Dedupe on append — guards against overlapping page fetches
				// adding the same relationship twice.
				const seen = new Set(networkLists.value[type].map((e) => e._id));
				networkLists.value[type].push(
					...entries.filter((e) => !seen.has(e._id)),
				);
			}

			// Stop paging when the list is complete OR a page made no progress
			// (empty page / all duplicates). The progress guard means we can
			// never loop forever even if `totalCount` never becomes reachable
			// (e.g. relationships whose target user was deleted).
			const added =
				page === 1
					? networkLists.value[type].length
					: networkLists.value[type].length - before;
			hasMore.value = added > 0 && networkLists.value[type].length < totalCount;
		} catch (e) {
			console.error(`Failed to fetch ${type}`, e);
			if (token !== networkRequestToken[type]) return;
			hasMore.value = false;
			if (page === 1) {
				networkLists.value[type] = [];
				totalCounts.value[type] = 0;
			}
		} finally {
			if (token === networkRequestToken[type]) networkLoading.value = false;
		}
	}
	// Reconcile my own counters with the server. Block/unfriend mutate mates,
	// followers AND following server-side (follow links get severed too), and the
	// exact delta depends on follow direction the client doesn't track — so pull
	// the authoritative numbers instead of trying to replicate the math locally.
	async function refreshMyStats() {
		const me = authStore.user?._id;
		if (!me || !authStore.user) return;
		try {
			const stats = await fetchUserStats(me);
			authStore.user.stats = { ...authStore.user.stats, ...stats };
		} catch (e) {
			console.error("Failed to refresh my stats", e);
		}
	}

	async function fetchBlockedUsers() {
		try {
			const blockedIds: string[] = await getBlockedIds();
			blockedUserIds.value = new Set(blockedIds);
		} catch (e) {
			console.error("Failed to fetch blocked user IDs", e);
		}
	}

	// --- LOCAL MUTATIONS ---

	function blockUserLocally(userId: string) {
		blockedUserIds.value.add(userId);
		onlineFriendIds.value.delete(userId);
	}

	function unblockUserLocally(userId: string) {
		blockedUserIds.value.delete(userId);
	}

	function removeFriendLocally(userId: string) {
		networkLists.value.mates = networkLists.value.mates.filter(
			(m) => m._id !== userId,
		);
		onlineFriendIds.value.delete(userId);
		if (targetProfile.value?._id === userId) targetProfile.value = null;

		if (authStore.user?.stats && authStore.user.stats.mates)
			authStore.user.stats.mates--;
	}

	function addFriendLocally(mate: PublicUser) {
		userCache.upsert(mate);
		const exists = networkLists.value.mates.some((m) => m._id === mate._id);
		if (!exists) {
			networkLists.value.mates.unshift({ _id: mate._id, chat_status: "mate" });
			if (authStore.user?.stats && authStore.user.stats.mates !== undefined)
				authStore.user.stats.mates++;
		}
	}

	async function toggleFollowUser(target: NetworkUser) {
		if (!authStore.user?._id || target._id === authStore.user._id) return;

		const wasFollowing = networkLists.value.following.some(
			(f) => f._id === target._id,
		);

		if (wasFollowing) {
			networkLists.value.following = networkLists.value.following.filter(
				(f) => f._id !== target._id,
			);
			if (authStore.user.stats) authStore.user.stats.following--;
		} else {
			networkLists.value.following.push({ _id: target._id });
			if (authStore.user.stats) authStore.user.stats.following++;
			trackEvent(mixpanelEvents.mateAdd, { target_id: target._id });
		}

		try {
			const res = await toggleFollow(target._id);
			return res.isFollowing;
		} catch (e) {
			// Rollback
			if (wasFollowing) {
				networkLists.value.following.push({ _id: target._id });
				if (authStore.user.stats) authStore.user.stats.following++;
			} else {
				networkLists.value.following = networkLists.value.following.filter(
					(f) => f._id !== target._id,
				);
				if (authStore.user.stats) authStore.user.stats.following--;
			}
			throw e;
		}
	}

	return {
		onlineFriendIds,
		pendingRequests,
		friendRequestLoading,
		targetProfile,
		targetPosts,
		loadingProfile,
		networkLists,
		networkLoading,
		hasMore,
		myStats,
		isFriendOnline,
		onlineFriends,
		allConnectedPartners,
		isBlocked,
		totalCounts,
		initializeSocialGraph,
		setFriendOnlineStatus,
		fetchPendingRequests,
		getProfile,
		resolvePartnerInfo,
		getNetworkList,
		blockUserLocally,
		unblockUserLocally,
		removeFriendLocally,
		toggleFollowUser,
		addFriendLocally,
		refreshMyStats,
		resetRuntimeState,
	};
});
