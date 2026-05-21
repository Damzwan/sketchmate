import { useMenuStore } from "@/store/menu.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";

let lastFetchedId: string | null = null;
let lastFetchedAt = 0;
const PROFILE_FRESHNESS_MS = 120_000;

export const useUserContextSheet = () => {
	const menuStore = useMenuStore();
	const friendStore = useFriendStore();
	const userCache = useUserCacheStore();

	const openUserActions = async (info: {
		_id: string;
		name?: string;
		img?: string;
		last_seen_version?: string;
	}) => {
		if (!info?._id) return;

		// 1. Instantly seed cache
		if (info.name || info.img) {
			userCache.upsert(info as any);
		}

		// 2. Pre-fill targetProfile to prevent UI pop-in
		// Grab the freshest data from cache, fallback to the info stub
		const cached = userCache.peek(info._id);
		const stubData = cached || info;

		// If opening a new user, inject the stub and clear posts for skeletons
		if (friendStore.targetProfile?._id !== info._id) {
			friendStore.targetProfile = stubData as any;
			friendStore.targetPosts = [];
		}

		// 3. Open the sheet immediately
		menuStore.viewProfileMenuOpen = true;

		const now = Date.now();
		// Force a fetch if they don't have stats yet, even if they were recently peeked
		const hasFullData = !!friendStore.targetProfile?.stats;
		const isFresh =
			hasFullData &&
			lastFetchedId === info._id &&
			now - lastFetchedAt < PROFILE_FRESHNESS_MS;

		if (isFresh) return;

		lastFetchedId = info._id;
		lastFetchedAt = now;

		// 4. Background fetch for posts, stats, and relationships
		await friendStore.getProfile(info._id);
	};

	const closeSheet = () => {
		menuStore.viewProfileMenuOpen = false;
	};

	return {
		openUserActions,
		closeSheet,
	};
};

export const useUserActions = useUserContextSheet;
