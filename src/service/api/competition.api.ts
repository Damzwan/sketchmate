import type {
	CompetitionAccent,
	CompetitionCategory,
	CompetitionPhase,
} from "@/config/competition.config";
import type { PresignedUploadBundle } from "@/draw/sharing/shareDrawings";
import { request } from "./http";

export interface CompetitionAuthor {
	_id: string;
	name: string;
	img: string;
	customization?: Record<string, unknown>;
	stats?: Record<string, number>;
}

export interface Competition {
	_id: string;
	week_key: string;
	theme: string;
	theme_blurb: string;
	accent: string;
	accent_colors: CompetitionAccent;
	phase: CompetitionPhase;
	starts_at: string;
	submissions_close_at: string;
	ends_at: string;
	categories: CompetitionCategory[];
	entry_count: number;
	announced_at?: string;
}

export interface CompetitionEntry {
	_id: string;
	competition_id: string;
	author_id: string;
	author: CompetitionAuthor | null;
	image_url: string;
	thumbnail_url: string;
	drawing_url: string;
	aspect_ratio: number;
	caption: string;
	caption_filtered: string;
	post_id?: string;
	is_winner: boolean;
	won_category?: string;
	/** Absent until results are announced — tallies are hidden during voting. */
	vote_counts?: Record<string, number>;
	total_votes?: number;
	my_votes: string[];
	comment_count: number;
	comments?: CompetitionComment[];
	submitted_at: string;
}

export interface CompetitionComment {
	_id: string;
	entry_id: string;
	author_id: string;
	message: string;
	message_filtered?: string;
	createdAt: string;
	author: CompetitionAuthor;
}

export interface MyEntrySummary {
	_id: string;
	competition_id?: string;
	author_id?: string;
	drawing_url?: string;
	image_url?: string;
	thumbnail_url: string;
	aspect_ratio?: number;
	caption?: string;
	caption_filtered?: string;
	comment_count?: number;
	my_votes?: string[];
	vote_counts?: Record<string, number>;
	total_votes?: number;
	submitted_at?: string;
	status: string;
	is_winner: boolean;
	won_category?: string;
}

export interface CurrentCompetitionResponse {
	competition: Competition | null;
	my_entry?: MyEntrySummary | null;
	votes_left?: Record<string, number>;
	can_vote?: boolean;
	can_submit?: boolean;
}

export interface EnterCompetitionParams {
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
	caption?: string;
	share_to_feed?: boolean;
}

export interface EnterCompetitionResponse {
	entry: CompetitionEntry;
	replaced: boolean;
	post_id?: string;
	/** "quota" | "error" — the entry landed, the cross-post did not. */
	post_skipped?: string;
}

export interface CompetitionResultRow {
	category_id: string;
	category_label: string;
	category_emoji: string;
	votes: number;
	granted_items: string[];
	winner: CompetitionAuthor | null;
	entry: CompetitionEntry | null;
}

export async function fetchCurrentCompetition() {
	return await request<CurrentCompetitionResponse>("/competition/current");
}

export async function getCompetitionUploadUrls() {
	return await request<PresignedUploadBundle>("/competition/upload-urls", {
		method: "POST",
	});
}

export async function enterCompetition(
	competitionId: string,
	params: EnterCompetitionParams,
) {
	return await request<EnterCompetitionResponse>(
		`/competition/${competitionId}/enter`,
		{ method: "POST", body: JSON.stringify(params) },
	);
}

export async function withdrawEntry(competitionId: string) {
	return await request<{ success: boolean; deleted: boolean }>(
		`/competition/${competitionId}/entry`,
		{ method: "DELETE" },
	);
}

export async function fetchEntries(
	competitionId: string,
	cursor = 0,
	limit = 24,
) {
	return await request<{
		entries: CompetitionEntry[];
		next_cursor: number | null;
		total: number;
	}>(`/competition/${competitionId}/entries?cursor=${cursor}&limit=${limit}`);
}

export async function fetchMyCompetitionVotes(competitionId: string) {
	return await request<{ entries: CompetitionEntry[] }>(
		`/competition/${competitionId}/my-votes`,
	);
}

/**
 * One entry, without the grid. Needed for deep links that arrive cold — a
 * "someone commented on your entry" notification must open that drawing even
 * when the competition page has never been visited this session.
 */
export async function fetchCompetitionEntry(entryId: string) {
	return await request<{ entry: CompetitionEntry }>(
		`/competition/entry/${entryId}`,
	);
}

export async function fetchCompetition(competitionId: string) {
	return await request<{
		competition: Competition;
		votes_left: Record<string, number>;
		can_vote: boolean;
		can_submit: boolean;
	}>(`/competition/${competitionId}`);
}

/**
 * Entries that were on screen for >1.5s. Feeds both the fairness scoring and
 * the exposure-balanced ordering, so this is not optional telemetry.
 */
export async function reportImpressions(
	competitionId: string,
	entryIds: string[],
) {
	return await request<{ success: boolean }>(
		`/competition/${competitionId}/impressions`,
		{ method: "POST", body: JSON.stringify({ entry_ids: entryIds }) },
	);
}

export async function castVote(
	competitionId: string,
	entryId: string,
	categoryId: string,
) {
	return await request<{
		success: boolean;
		votes_left: number;
		votes_left_by_category?: Record<string, number>;
	}>(`/competition/${competitionId}/vote`, {
		method: "POST",
		body: JSON.stringify({ entry_id: entryId, category_id: categoryId }),
	});
}

export async function removeVote(
	competitionId: string,
	entryId: string,
	categoryId: string,
) {
	return await request<{
		success: boolean;
		votes_left: number;
		votes_left_by_category?: Record<string, number>;
	}>(
		`/competition/${competitionId}/vote?entry_id=${encodeURIComponent(entryId)}&category_id=${encodeURIComponent(categoryId)}`,
		{
			method: "DELETE",
		},
	);
}

export async function fetchCompetitionComments(
	entryId: string,
	limit = 20,
	beforeDate?: string,
) {
	const query = new URLSearchParams({ limit: String(limit) });
	if (beforeDate) query.set("beforeDate", beforeDate);
	return await request<{ comments: CompetitionComment[]; hasMore: boolean }>(
		`/competition/entry/${entryId}/comments?${query.toString()}`,
	);
}

export async function postCompetitionComment(entryId: string, message: string) {
	return await request<{ comment: CompetitionComment }>(
		`/competition/entry/${entryId}/comment`,
		{ method: "POST", body: JSON.stringify({ message }) },
	);
}

export async function deleteCompetitionComment(
	entryId: string,
	commentId: string,
) {
	return await request<{ success: boolean }>(
		`/competition/entry/${entryId}/comment/${commentId}`,
		{ method: "DELETE" },
	);
}

export async function fetchResults(competitionId: string) {
	return await request<{
		competition: Competition;
		skipped_reason?: string;
		results: CompetitionResultRow[];
	}>(`/competition/${competitionId}/results`);
}

export interface ArchiveWinner {
	category_id: string;
	category_label: string;
	category_emoji: string;
	thumbnail_url: string;
	aspect_ratio: number;
	name: string;
}

export type ArchivedCompetition = Competition & {
	winner_count: number;
	winners: ArchiveWinner[];
};

export async function fetchArchive(limit = 10) {
	return await request<{ competitions: ArchivedCompetition[] }>(
		`/competition/archive?limit=${limit}`,
	);
}

export interface ProfileCompetitionEntry {
	_id: string;
	competition_id: string;
	author_id: string;
	thumbnail_url: string;
	image_url: string;
	drawing_url: string;
	aspect_ratio: number;
	caption: string;
	caption_filtered: string;
	comment_count: number;
	comments?: CompetitionComment[];
	is_winner: boolean;
	won_category?: string;
	week_key: string;
	theme: string;
	accent: string;
	/** Still running — only ever true for your own entry. */
	pending: boolean;
	can_delete: boolean;
	/** Finalized totals; absent until this competition is announced. */
	vote_counts?: Record<string, number>;
	total_votes?: number;
}

export async function fetchUserCompetitionEntries(userId: string, limit = 12) {
	return await request<{ entries: ProfileCompetitionEntry[] }>(
		`/competition/user/${userId}/entries?limit=${limit}`,
	);
}

export async function markResultsSeen(competitionId: string) {
	return await request<{ success: boolean }>(
		`/competition/${competitionId}/seen`,
		{ method: "POST" },
	);
}

// ─── PREFERENCES ─────────────────────────────────────────────────────────────

/**
 * Dedicated route rather than the generic user update: that one $sets whole
 * objects and would wipe `last_seen_results_week` and `wins`.
 */
export async function updateCompetitionPreferences(notifications: boolean) {
	return await request<{ notifications: boolean }>("/competition/preferences", {
		method: "PUT",
		body: JSON.stringify({ notifications }),
	});
}

// ─── THEMES ──────────────────────────────────────────────────────────────────

export interface CompetitionTheme {
	_id: string;
	text: string;
	status: "pending" | "approved" | "rejected" | "used";
	upvotes: number;
	mine: boolean;
	voted: boolean;
	rejected_reason?: string;
}

export interface ThemesResponse {
	themes: CompetitionTheme[];
	my_pending: CompetitionTheme[];
	can_suggest: boolean;
	/** ISO date the user may suggest again, or null when they never have. */
	can_suggest_at: string | null;
	cycle_competition_id?: string;
}

export async function fetchThemes() {
	return await request<ThemesResponse>("/competition/themes");
}

export async function suggestTheme(text: string) {
	return await request<{ theme: CompetitionTheme }>("/competition/themes", {
		method: "POST",
		body: JSON.stringify({ text }),
	});
}

export async function cancelThemeSuggestion(themeId: string) {
	return await request<{ success: boolean }>(`/competition/themes/${themeId}`, {
		method: "DELETE",
	});
}

export async function toggleThemeUpvote(themeId: string) {
	return await request<{ voted: boolean }>(
		`/competition/themes/${themeId}/upvote`,
		{ method: "POST" },
	);
}
