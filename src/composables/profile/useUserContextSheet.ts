import { useMenuStore } from "@/store/menu.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";

let lastFetchedId: string | null = null;
let lastFetchedAt = 0;
const PROFILE_FRESHNESS_MS = 120_000;

// Ionic's sheet leave transition. Waiting on the real `didDismiss` event would
// mean reaching into the modal instance from here; the sheet's animation is a
// fixed duration, so a timer is enough and keeps this composable decoupled from
// the component. Slightly generous so a slow frame can't land us mid-dismiss.
const SHEET_DISMISS_MS = 320;
const waitForSheetDismiss = () =>
	new Promise((resolve) => setTimeout(resolve, SHEET_DISMISS_MS));

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

		// 3. Open the sheet immediately.
		//
		// If it's ALREADY open, assigning `true` again is a no-op and the sheet
		// stays wherever it is in the overlay stack. That's the bug behind
		// sheet → photoswiper → comments → tap a user: the sheet is open but
		// buried beneath the swiper, so the profile silently changed underneath
		// while nothing appeared to happen. Dismiss and re-present so Ionic puts
		// it back on top of whatever is currently showing.
		if (menuStore.viewProfileMenuOpen) {
			menuStore.viewProfileMenuOpen = false;
			// Ionic needs the leave transition to finish before the same modal can
			// present again; re-presenting mid-dismiss leaves it stuck hidden.
			await waitForSheetDismiss();
		}
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
