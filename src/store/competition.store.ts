import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	type CompetitionPhase,
	canSubmit as canSubmitFor,
	canVote as canVoteFor,
	IMPRESSION_FLUSH_MS,
	phaseFor,
} from "@/config/competition.config";
import router from "@/router";
import {
	type Competition,
	type CompetitionEntry,
	type CompetitionResultRow,
	castVote as castVoteApi,
	fetchCompetitionEntry,
	fetchCurrentCompetition,
	fetchEntries,
	fetchMyCompetitionVotes,
	fetchResults,
	fetchThemes,
	type MyEntrySummary,
	markResultsSeen,
	removeVote as removeVoteApi,
	reportImpressions,
	type ThemesResponse,
} from "@/service/api/competition.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useAuthStore } from "./auth.store";
import { useMenuStore } from "./menu.store";

/**
 * Weekly competition state.
 *
 * Deliberately light: no fabric, no draw-engine imports, nothing that would pull
 * the draw chunk into app start (see docs/DRAW_MODULE_ARCHITECTURE.md). The home
 * card imports this store; the competition page and its heavy grid do not load
 * until the route does.
 */
/**
 * Last `/current` payload, kept in localStorage so the home card can paint the
 * real theme on the very first frame of a cold start instead of a grey block
 * that pops into a card a network round trip later.
 *
 * Only the card's inputs are cached — no entries, no votes, nothing that would
 * be wrong to act on. It is a paint hint: `refresh()` still runs immediately
 * and overwrites it, and `phaseFor()` re-derives the phase from the clock, so a
 * cache written last Tuesday shows "voting closed", never a stale "open".
 */
/**
 * Ceiling on the entry grid. Beyond this the page stops paginating: the value
 * of card 200 is near zero, and the cost — decoded artwork plus a ProfileWorld
 * and ProfileEffect per card — is not.
 */
const MAX_LOADED_ENTRIES = 180;

/** Long enough to collapse a page-open plus a sheet-open into one request. */
const THEMES_TTL_MS = 60_000;

const CARD_CACHE_KEY = "competition_card_v1";
/** Past this the cached week is more likely to mislead than to help. */
const CARD_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface CardCache {
	saved_at: number;
	competition: Competition | null;
	my_entry: MyEntrySummary | null;
}

function readCardCache(): CardCache | null {
	try {
		const raw = localStorage.getItem(CARD_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CardCache;
		if (Date.now() - parsed.saved_at > CARD_CACHE_TTL_MS) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeCardCache(
	competition: Competition | null,
	myEntry: MyEntrySummary | null,
): void {
	try {
		localStorage.setItem(
			CARD_CACHE_KEY,
			JSON.stringify({ saved_at: Date.now(), competition, my_entry: myEntry }),
		);
	} catch {
		// Private mode or a full quota. The card falls back to its skeleton.
	}
}

export const useCompetitionStore = defineStore("competition", () => {
	const cached = readCardCache();

	const competition = ref<Competition | null>(cached?.competition ?? null);
	const myEntry = ref<MyEntrySummary | null>(cached?.my_entry ?? null);
	const votesLeft = ref<Record<string, number>>({});

	const entries = ref<CompetitionEntry[]>([]);
	const nextCursor = ref<number | null>(0);
	const totalEntries = ref(0);
	const myVotedEntries = ref<CompetitionEntry[]>([]);
	const isLoadingMyVotes = ref(false);

	const results = ref<CompetitionResultRow[] | null>(null);
	const presentedCompetition = ref<Competition | null>(null);
	const presentedResults = ref<CompetitionResultRow[] | null>(null);
	const resultsTargetId = ref<string | null>(null);
	const requestedArchiveId = ref<string | null>(null);

	const isLoading = ref(false);
	const isLoadingEntries = ref(false);
	/** True once `refresh()` has completed at least once — the card waits on it
	 *  rather than flashing an empty state on every cold start. */
	const hydrated = ref(false);
	/**
	 * The card has something real to draw: either this session's fetch landed, or
	 * the localStorage cache gave it last week's shape to paint immediately.
	 * Separate from `hydrated`, which still means "the server has answered" and
	 * is what the entry grid and the vote budget key off.
	 */
	const cardReady = ref(!!cached?.competition);
	let inFlight: Promise<void> | null = null;
	let themesCache: { fetched_at: number; data: ThemesResponse } | null = null;
	let themesInFlight: Promise<ThemesResponse | null> | null = null;

	// ── Derived ────────────────────────────────────────────────────────────
	// Phase is recomputed from the clock, never trusted from the payload: the
	// server cron may be up to an hour behind the actual boundary.
	const phase = computed<CompetitionPhase | null>(() =>
		competition.value ? phaseFor(competition.value) : null,
	);

	const isActive = computed(
		() => !!competition.value && phase.value !== "scheduled",
	);

	const hasEntered = computed(() => !!myEntry.value);

	const canSubmit = computed(
		() => !!competition.value && canSubmitFor(competition.value),
	);

	const canVote = computed(
		() => !!competition.value && canVoteFor(competition.value),
	);

	/** The SendHub section shows only when there is something to enter. */
	const canEnter = computed(() => {
		const auth = useAuthStore();
		return canSubmit.value && !auth.isUnderAge;
	});

	const accent = computed(() => competition.value?.accent ?? "sunset");

	const deadline = computed(() => {
		if (!competition.value) return null;
		if (phase.value === "scheduled") return competition.value.starts_at;
		return phase.value === "open"
			? competition.value.submissions_close_at
			: competition.value.ends_at;
	});

	/** Results are out and this user has not been shown them yet. */
	const hasUnseenResults = computed(() => {
		const auth = useAuthStore();
		const seen = (auth.user as any)?.competition?.last_seen_results_week;
		return (
			phase.value === "announced" &&
			!!competition.value &&
			seen !== competition.value.week_key
		);
	});

	const votesLeftFor = (categoryId: string): number =>
		votesLeft.value[categoryId] ?? 0;

	// ── Actions ────────────────────────────────────────────────────────────

	/** Coalesced: the home card and the page can both call this on view-enter. */
	async function refresh(force = false): Promise<void> {
		// Dev controls can finish while an older home/page refresh is still in
		// flight. A forced refresh waits for that stale request, then pulls again.
		if (inFlight) {
			if (!force) return inFlight;
			await inFlight;
		}
		isLoading.value = true;
		inFlight = (async () => {
			try {
				const auth = useAuthStore();
				await auth.waitUntilInitialized();
				if (!auth.isLoggedIn) return;

				const res = await fetchCurrentCompetition();
				const changed = res.competition?._id !== competition.value?._id;

				competition.value = res.competition;
				myEntry.value = res.my_entry ?? null;
				votesLeft.value = res.votes_left ?? {};
				writeCardCache(res.competition, res.my_entry ?? null);

				// A new week invalidates the cached grid and podium.
				if (changed) {
					entries.value = [];
					nextCursor.value = 0;
					totalEntries.value = 0;
					results.value = null;
					presentedCompetition.value = null;
					presentedResults.value = null;
					resultsTargetId.value = null;
					myVotedEntries.value = [];
				}
			} catch (e) {
				// Signing out while the auth token is being requested is an expected
				// race, not a competition failure worth surfacing in the console.
				if (useAuthStore().isLoggedIn) {
					console.error("[competition] refresh failed", e);
				}
			} finally {
				hydrated.value = true;
				cardReady.value = true;
				isLoading.value = false;
				inFlight = null;
			}
		})();

		return inFlight;
	}

	async function loadMyVotes(): Promise<void> {
		if (!competition.value || isLoadingMyVotes.value) return;
		isLoadingMyVotes.value = true;
		try {
			const res = await fetchMyCompetitionVotes(competition.value._id);
			myVotedEntries.value = res.entries;
		} catch (e) {
			console.error("[competition] loadMyVotes failed", e);
		} finally {
			isLoadingMyVotes.value = false;
		}
	}

	async function loadEntries(reset = false, pageSize = 24): Promise<void> {
		if (!competition.value || isLoadingEntries.value) return;
		if (!reset && nextCursor.value === null) return;
		// The feed is a flat 20 posts and never paginates; this grid does, so
		// without a ceiling a 500-entry week ends up as 500 live cards. Same shape
		// as `MAX_USER_POSTS` in post.store.
		if (!reset && entries.value.length >= MAX_LOADED_ENTRIES) {
			nextCursor.value = null;
			return;
		}

		isLoadingEntries.value = true;
		try {
			const cursor = reset ? 0 : (nextCursor.value ?? 0);
			const res = await fetchEntries(
				competition.value._id,
				cursor,
				Math.min(Math.max(pageSize, 12), 60),
			);
			if (reset) {
				entries.value = res.entries;
			} else {
				// Exposure counts can move a card between ordering buckets while the
				// viewer paginates. Keep the rendered feed stable if that makes a row
				// appear in two adjacent responses.
				const loaded = new Set(entries.value.map((entry) => entry._id));
				entries.value = [
					...entries.value,
					...res.entries.filter((entry) => !loaded.has(entry._id)),
				];
			}
			nextCursor.value = res.next_cursor;
			totalEntries.value = res.total;
		} catch (e) {
			console.error("[competition] loadEntries failed", e);
		} finally {
			isLoadingEntries.value = false;
		}
	}

	/**
	 * Optimistic vote toggle. The chip flips immediately and rolls back on
	 * failure — a vote is a tap, and waiting on the network for it feels broken.
	 */
	async function toggleVote(
		entryId: string,
		categoryId: string,
	): Promise<boolean> {
		if (!competition.value) return false;

		const entry =
			entries.value.find((e) => e._id === entryId) ??
			myVotedEntries.value.find((e) => e._id === entryId);
		if (!entry) return false;

		const had = entry.my_votes.includes(categoryId);
		if (!had && votesLeftFor(categoryId) <= 0) return false;

		const previousVotes = [...entry.my_votes];
		const previousBudget = { ...votesLeft.value };

		entry.my_votes = had ? [] : [categoryId];
		const optimisticBudget = { ...votesLeft.value };
		for (const previousCategory of previousVotes) {
			optimisticBudget[previousCategory] =
				(optimisticBudget[previousCategory] ?? 0) + 1;
		}
		if (!had)
			optimisticBudget[categoryId] = (optimisticBudget[categoryId] ?? 0) - 1;
		votesLeft.value = optimisticBudget;

		try {
			const res = had
				? await removeVoteApi(competition.value._id, entryId, categoryId)
				: await castVoteApi(competition.value._id, entryId, categoryId);
			votesLeft.value = res.votes_left_by_category ?? {
				...votesLeft.value,
				[categoryId]: res.votes_left,
			};
			const receipt = myVotedEntries.value.find((item) => item._id === entryId);
			if (had) {
				if (receipt) {
					receipt.my_votes = receipt.my_votes.filter((id) => id !== categoryId);
					if (!receipt.my_votes.length) {
						myVotedEntries.value = myVotedEntries.value.filter(
							(item) => item._id !== entryId,
						);
					}
				}
			} else if (receipt) {
				receipt.my_votes = [categoryId];
			} else {
				myVotedEntries.value = [
					{ ...entry, my_votes: [...entry.my_votes] },
					...myVotedEntries.value,
				];
			}
			trackEvent(mixpanelEvents.competitionVoteCast, {
				category_id: categoryId,
				removed: had,
			});
			return true;
		} catch (e) {
			entry.my_votes = previousVotes;
			votesLeft.value = previousBudget;
			console.error("[competition] vote failed", e);
			return false;
		}
	}

	// ── Impressions ────────────────────────────────────────────────────────
	// Batched, deduped per competition. Each entry is reported once per session:
	// the counter is the denominator of the fairness score, so re-reporting the
	// same card as the user scrolls past it twice would quietly deflate the
	// artist's rate.
	const reportedImpressions = new Set<string>();
	let pendingImpressions: string[] = [];
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

	function flushImpressions(): void {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		if (!pendingImpressions.length || !competition.value) return;

		const batch = pendingImpressions;
		pendingImpressions = [];
		void reportImpressions(competition.value._id, batch).catch((e) => {
			// Losing a batch skews one entry's denominator slightly; re-queuing
			// risks double-counting, which skews it the other way and is worse.
			console.warn("[competition] impressions failed", e);
		});
	}

	function trackImpression(entryId: string): void {
		if (reportedImpressions.has(entryId)) return;
		reportedImpressions.add(entryId);
		pendingImpressions.push(entryId);

		if (pendingImpressions.length >= 20) {
			flushImpressions();
			return;
		}
		if (!flushTimer) {
			flushTimer = setTimeout(flushImpressions, IMPRESSION_FLUSH_MS);
		}
	}

	async function loadResults(): Promise<void> {
		if (!competition.value || phase.value !== "announced") return;
		try {
			const res = await fetchResults(competition.value._id);
			results.value = res.results;
		} catch (e) {
			console.error("[competition] loadResults failed", e);
		}
	}

	function targetResults(competitionId?: string): void {
		resultsTargetId.value = competitionId ?? null;
		presentedCompetition.value = null;
		presentedResults.value = null;
	}

	/**
	 * Open the winners moment for a specific week, from anywhere.
	 *
	 * Routes to the competition page first. A results notification is an
	 * invitation to look at the week, not just at a podium — closing the modal
	 * should leave the user on the entries, not back on the notification list
	 * with nothing to do next.
	 *
	 * Order matters: the page runs `refresh()` on enter, and a week rollover
	 * makes that clear the presented results. Awaiting it (coalesced, so this
	 * joins the page's own call rather than issuing a second) before setting the
	 * target is what stops the page from wiping the thing we just asked for.
	 */
	async function openResults(competitionId?: string): Promise<void> {
		const path = `/${FRONTEND_ROUTES.competition}`;
		if (router.currentRoute.value.path !== path) await router.push(path);

		await refresh();
		targetResults(competitionId);
		useMenuStore().isCompetitionResultsOpen = true;
	}

	async function loadPresentedResults(): Promise<void> {
		const targetId = resultsTargetId.value ?? competition.value?._id;
		if (!targetId) return;

		if (targetId === competition.value?._id && results.value) {
			presentedCompetition.value = competition.value;
			presentedResults.value = results.value;
			return;
		}

		try {
			const res = await fetchResults(targetId);
			presentedCompetition.value = res.competition;
			presentedResults.value = res.results;
			if (targetId === competition.value?._id) results.value = res.results;
		} catch (e) {
			console.error("[competition] loadPresentedResults failed", e);
		}
	}

	function clearResultsPresentation(): void {
		resultsTargetId.value = null;
		presentedCompetition.value = null;
		presentedResults.value = null;
	}

	function requestArchive(competitionId: string): void {
		requestedArchiveId.value = competitionId;
	}

	/**
	 * Shared `/themes` result.
	 *
	 * Both the page's top panel (which wants the leading idea) and the themes
	 * sheet (which wants the full list) need this, and they were issuing two
	 * identical requests every time the sheet was opened. Short TTL, and
	 * `force` after a write so a suggestion or an upvote is never served stale.
	 */
	async function loadThemes(force = false): Promise<ThemesResponse | null> {
		if (
			!force &&
			themesCache &&
			Date.now() - themesCache.fetched_at < THEMES_TTL_MS
		) {
			return themesCache.data;
		}
		if (themesInFlight) return themesInFlight;

		themesInFlight = (async () => {
			try {
				const data = await fetchThemes();
				themesCache = { fetched_at: Date.now(), data };
				return data;
			} catch (e) {
				console.warn("[competition] themes failed", e);
				return themesCache?.data ?? null;
			} finally {
				themesInFlight = null;
			}
		})();

		return themesInFlight;
	}

	function invalidateThemes(): void {
		themesCache = null;
	}

	/**
	 * The entry a deep link points at, from the loaded grid when possible and
	 * from the server otherwise — a notification can arrive long before the page
	 * has ever fetched a page of entries.
	 */
	async function resolveEntry(
		entryId: string,
	): Promise<CompetitionEntry | null> {
		const loaded =
			entries.value.find((entry) => entry._id === entryId) ??
			myVotedEntries.value.find((entry) => entry._id === entryId);
		if (loaded) return loaded;

		try {
			const res = await fetchCompetitionEntry(entryId);
			return res.entry;
		} catch (e) {
			console.error("[competition] resolveEntry failed", e);
			return null;
		}
	}

	/** Fire-and-forget: never block the modal's close on this. */
	async function markSeen(): Promise<void> {
		if (!competition.value) return;
		const auth = useAuthStore();
		const week = competition.value.week_key;

		// Update locally first so `hasUnseenResults` flips even if the call fails.
		if (auth.user) {
			(auth.user as any).competition = {
				...((auth.user as any).competition ?? {}),
				last_seen_results_week: week,
			};
		}

		try {
			await markResultsSeen(competition.value._id);
		} catch (e) {
			console.error("[competition] markSeen failed", e);
		}
	}

	/** Called after a successful entry submit so the card flips to "You're in". */
	function applyOwnEntry(entry: { _id: string; thumbnail_url: string }): void {
		const wasEntered = !!myEntry.value;
		myEntry.value = {
			_id: entry._id,
			thumbnail_url: entry.thumbnail_url,
			status: "active",
			is_winner: false,
		};
		// The grid is now stale — the user's own entry belongs in it.
		nextCursor.value = 0;
		entries.value = [];
		if (!wasEntered && competition.value) competition.value.entry_count++;
	}

	function removeOwnEntry(entryId: string): void {
		if (myEntry.value?._id === entryId) myEntry.value = null;
		entries.value = entries.value.filter((entry) => entry._id !== entryId);
		totalEntries.value = Math.max(0, totalEntries.value - 1);
		if (competition.value) {
			competition.value.entry_count = Math.max(
				0,
				competition.value.entry_count - 1,
			);
		}
	}

	function resetRuntimeState() {
		competition.value = null;
		myEntry.value = null;
		votesLeft.value = {};
		entries.value = [];
		nextCursor.value = 0;
		totalEntries.value = 0;
		results.value = null;
		presentedCompetition.value = null;
		presentedResults.value = null;
		resultsTargetId.value = null;
		requestedArchiveId.value = null;
		myVotedEntries.value = [];
		hydrated.value = false;
		cardReady.value = false;
		themesCache = null;
		themesInFlight = null;
		try {
			localStorage.removeItem(CARD_CACHE_KEY);
		} catch {
			// Nothing to do — a stale card cache is overwritten on next refresh.
		}
		reportedImpressions.clear();
		pendingImpressions = [];
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		isLoading.value = false;
		isLoadingEntries.value = false;
		isLoadingMyVotes.value = false;
	}

	return {
		competition,
		myEntry,
		votesLeft,
		entries,
		nextCursor,
		totalEntries,
		myVotedEntries,
		results,
		presentedCompetition,
		presentedResults,
		resultsTargetId,
		requestedArchiveId,
		isLoading,
		isLoadingEntries,
		isLoadingMyVotes,
		hydrated,
		cardReady,
		phase,
		isActive,
		hasEntered,
		canSubmit,
		canVote,
		canEnter,
		accent,
		deadline,
		hasUnseenResults,
		votesLeftFor,
		refresh,
		loadEntries,
		loadMyVotes,
		toggleVote,
		trackImpression,
		flushImpressions,
		loadResults,
		targetResults,
		openResults,
		loadPresentedResults,
		clearResultsPresentation,
		requestArchive,
		resolveEntry,
		loadThemes,
		invalidateThemes,
		markSeen,
		applyOwnEntry,
		removeOwnEntry,
		resetRuntimeState,
	};
});
