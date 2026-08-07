import { useAuthStore } from "@/store/auth.store";

/**
 * PROFANITY FILTER — the read half.
 *
 * All the actual matching happened on the server, once, when the text was
 * written: anything that matched was stored with a censored twin beside it
 * (`content_filtered` on messages, `message_filtered` on comments and lobby
 * messages). This side is a field pick — no regex, no word list, nothing that
 * scales with thread length — which is what lets the toggle apply instantly to
 * history the user has already loaded.
 *
 * The preference is per-viewer, not per-author: the author's own words are
 * never rewritten in storage, and a report always carries the raw text to the
 * moderator.
 */

/**
 * Undefined means ON. The server defaults new accounts to `true`, but a user
 * document written before this feature existed has no field at all — and the
 * safe reading of "unknown" for a young audience is "filtered".
 */
export function isProfanityFilterOn(): boolean {
	return useAuthStore().user?.profanity_filter !== false;
}

/**
 * Pick what to render. `filtered` is only ever present when the server actually
 * found something, so clean text short-circuits on the first condition.
 */
export function safeText(
	raw?: string | null,
	filtered?: string | null,
): string {
	if (filtered && isProfanityFilterOn()) return filtered;
	return raw ?? "";
}
