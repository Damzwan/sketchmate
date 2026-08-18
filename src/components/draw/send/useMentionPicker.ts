import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMateSelection } from "@/draw/sharing/mateSelection";
import { fetchNetworkType } from "@/service/api/relationship.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useUserCacheStore } from "@/store/userCache.store";
import type { NetworkUser } from "@/types/server.types";

/**
 * How many people one post can shout out.
 *
 * Three, not five: a shoutout is a deliberate credit, and every name on the
 * list becomes a notification for someone who did not choose to be on it. Past
 * a handful it stops reading as "I made this with them" and starts reading as
 * a way to put a post in front of people.
 */
export const MAX_MENTIONS = 3;

const PAGE_SIZE = 20;

/** The server ignores search terms below this, so don't spend a request. */
const MIN_SEARCH_LENGTH = 3;

/**
 * Mate picker for the shoutout row on a community post.
 *
 * Two things make this its own composable rather than a second
 * `useSendMatePicker`:
 *
 * 1. It holds its OWN result list instead of writing through the friend
 *    store's shared `networkLists.mates`. Both pickers live in SendHub and can
 *    be open at once, so a search typed into one would otherwise reshuffle the
 *    other's tiles out from under the user's finger.
 * 2. It asks for PERMANENT mates only (`status: "mate"`). Handing a drawing to
 *    someone you are on a 24h trial with is fine; publishing their name on the
 *    public feed is not. The server re-checks this at publish time — the
 *    filter here is so the composer never offers something that would be
 *    silently dropped.
 */
export function useMentionPicker() {
	const { user } = storeToRefs(useAuthStore());
	const userCache = useUserCacheStore();
	const { selected, toggle, reset } = useMateSelection(MAX_MENTIONS);
	const { toast } = useToast();

	const results = ref<NetworkUser[]>([]);
	const mentionSearch = ref("");
	const page = ref(1);
	const hasMore = ref(false);
	const loading = ref(false);
	const loadingMore = ref(false);
	const loaded = ref(false);
	const scrollEl = ref<HTMLElement | null>(null);
	const sentinel = ref<HTMLElement | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let observer: IntersectionObserver | null = null;
	let requestToken = 0;

	/**
	 * Selected mates stay pinned at the front even when the current search
	 * excludes them — otherwise typing a name makes your existing picks look
	 * like they were dropped.
	 */
	const selectedMates = computed(() =>
		[...selected.value]
			.map((id) => userCache.getUser(id))
			.filter((mate): mate is NetworkUser => !!mate),
	);

	const mentionCandidates = computed(() => {
		const byId = new Map<string, NetworkUser>();
		for (const mate of selectedMates.value) byId.set(mate._id, mate);
		for (const mate of results.value)
			if (!byId.has(mate._id)) byId.set(mate._id, mate);
		return [...byId.values()];
	});

	/**
	 * The row renders whenever the artist has any permanent mate at all —
	 * including when a search happens to match none, so the search box does not
	 * delete itself as you type.
	 *
	 * `!loaded` is what stops that from deadlocking: the first fetch is kicked
	 * off by the row mounting, so the row has to be allowed to render once
	 * before anything is known.
	 */
	const canMention = computed(
		() =>
			!loaded.value ||
			mentionCandidates.value.length > 0 ||
			!!mentionSearch.value.trim(),
	);
	const mentionIds = computed(() => [...selected.value]);

	async function fetchMates(reset = false) {
		if (!user.value?._id) return;
		const term = mentionSearch.value.trim();
		if (term.length > 0 && term.length < MIN_SEARCH_LENGTH) return;
		if (reset) page.value = 1;

		const token = ++requestToken;
		if (page.value === 1) loading.value = true;
		try {
			const res = await fetchNetworkType(user.value._id, "mates", {
				page: page.value,
				limit: PAGE_SIZE,
				search: term,
				status: "mate",
			});
			// A newer search superseded this one while it was in flight.
			if (token !== requestToken) return;

			const records = res.data || [];
			// The identities still go through the shared cache — that part is a
			// read-through store with no ordering for another picker to lose.
			userCache.upsertMany(records);
			results.value =
				page.value === 1 ? records : [...results.value, ...records];
			hasMore.value = records.length === PAGE_SIZE;
		} catch (error) {
			console.error("Failed to load mates for shoutout:", error);
		} finally {
			if (token === requestToken) {
				loading.value = false;
				loaded.value = true;
			}
		}
	}

	/**
	 * Called by the row when it first mounts, which only happens once the artist
	 * expands the post section — most sends never do, and this is a request
	 * nobody should pay for on the way to a plain save.
	 */
	function ensureLoaded() {
		if (loaded.value || loading.value) return;
		void fetchMates(true);
	}

	function onMentionSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!mentionSearch.value.trim()) {
			void fetchMates(true);
			return;
		}
		debounceTimer = setTimeout(() => void fetchMates(true), 400);
	}

	function clearMentionSearch() {
		mentionSearch.value = "";
		if (debounceTimer) clearTimeout(debounceTimer);
		void fetchMates(true);
	}

	async function loadMore() {
		const term = mentionSearch.value.trim();
		if (
			!hasMore.value ||
			loading.value ||
			loadingMore.value ||
			(term.length > 0 && term.length < MIN_SEARCH_LENGTH)
		)
			return;

		loadingMore.value = true;
		page.value++;
		try {
			await fetchMates();
		} finally {
			loadingMore.value = false;
		}
	}

	function attachObserver() {
		observer?.disconnect();
		if (!sentinel.value) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void loadMore();
			},
			{ root: scrollEl.value, threshold: 0.1 },
		);
		observer.observe(sentinel.value);
	}

	function toggleMention(id: string) {
		if (!toggle(id)) toast(`You can tag up to ${MAX_MENTIONS} people`);
	}

	watch(sentinel, attachObserver);
	onBeforeUnmount(() => {
		observer?.disconnect();
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	return {
		MAX_MENTIONS,
		selected,
		mentionIds,
		mentionCandidates,
		canMention,
		mentionSearch,
		loading,
		loadingMore,
		scrollEl,
		sentinel,
		ensureLoaded,
		toggleMention,
		onMentionSearch,
		clearMentionSearch,
		resetMentions: reset,
	};
}
