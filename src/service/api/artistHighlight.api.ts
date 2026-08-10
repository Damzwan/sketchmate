import type {
	ArtistHighlightConfig,
	ArtistHighlightEntry,
	ArtistHighlightQuestion,
} from "@/types/server.types";
import { request } from "./http";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object";

function normalizeQuestions(value: Record<string, unknown>) {
	const questions = Array.isArray(value.questions)
		? value.questions.flatMap((item, index): ArtistHighlightQuestion[] => {
				if (
					!isRecord(item) ||
					typeof item.question !== "string" ||
					typeof item.answer !== "string"
				) {
					return [];
				}
				return [
					{
						_id:
							typeof item._id === "string"
								? item._id
								: `${String(value._id)}-question-${index}`,
						question: item.question,
						answer: item.answer,
					},
				];
			})
		: [];

	if (questions.length) return questions;
	if (typeof value.question === "string" && typeof value.answer === "string") {
		return [
			{
				_id: `${String(value._id)}-legacy`,
				question: value.question,
				answer: value.answer,
			},
		];
	}
	return [];
}

function normalizeHighlightEntry(value: unknown): ArtistHighlightEntry | null {
	if (!isRecord(value) || !isRecord(value.artist)) return null;
	if (
		typeof value._id !== "string" ||
		typeof value.artist._id !== "string" ||
		typeof value.artist.name !== "string" ||
		typeof value.artist.img !== "string" ||
		!Array.isArray(value.posts)
	) {
		return null;
	}
	const questions = normalizeQuestions(value);
	if (!questions.length) return null;
	return { ...value, questions } as unknown as ArtistHighlightEntry;
}

/**
 * The production endpoint originally had no artist-highlight contract, and a
 * rolling deploy can briefly put an older or wrapped response in front of a
 * newer client. Normalize that boundary here so Home never has to reason about
 * missing arrays or dashboard-shaped `{ config }` payloads.
 */
export async function fetchArtistHighlights(): Promise<ArtistHighlightConfig | null> {
	const payload = await request<unknown>("/artist-highlights");
	if (!isRecord(payload)) return null;

	const raw = isRecord(payload.config) ? payload.config : payload;
	const artists = Array.isArray(raw.artists)
		? raw.artists.flatMap((entry) => {
				const normalized = normalizeHighlightEntry(entry);
				return normalized ? [normalized] : [];
			})
		: [];

	return {
		title:
			typeof raw.title === "string" && raw.title.trim()
				? raw.title
				: "Meet the artists",
		subtitle: typeof raw.subtitle === "string" ? raw.subtitle : undefined,
		updated_at:
			typeof raw.updated_at === "string"
				? raw.updated_at
				: new Date(0).toISOString(),
		artists,
	};
}

export async function updateArtistHighlightPreferences(payload: {
	enabled?: boolean;
	snoozed_until?: string | null;
}) {
	return request<{ success: boolean }>("/artist-highlights/preferences", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}
