// ─── WEEKLY COMPETITION CONFIG (client copy) ─────────────────────────────────
// Mirror of sketchmate_server/src/config/competition.config.ts. Pure data and
// pure functions, no imports — same duplication contract as moderation.policy.
// If you change an accent or a phase rule here, change it there too.
//
// See docs/COMPETITION.md.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

export type CompetitionPhase =
	| "scheduled"
	| "open"
	| "voting"
	| "closed"
	| "announced";

export interface CompetitionCategory {
	id: string;
	label: string;
	emoji: string;
	votes_per_user: number;
	reward_items: string[];
}

export interface CompetitionAccent {
	from: string;
	to: string;
	ink: string;
	emoji: string;
}

/**
 * One accent per week. Every competition surface — home card, the SendHub
 * section, the page header, the winners modal — reads the same entry, which is
 * what makes the sheet visibly the same feature as the card the user tapped.
 * Never hardcode a competition colour in a component.
 */
export const COMPETITION_ACCENTS: Record<string, CompetitionAccent> = {
	sunset: { from: "#FF9A6C", to: "#FFD36E", ink: "#5F290E", emoji: "🌅" },
	ocean: { from: "#5EC8F2", to: "#9BE7D2", ink: "#0B4A63", emoji: "🌊" },
	forest: { from: "#7FC98B", to: "#D6EFA4", ink: "#1F4A2B", emoji: "🌿" },
	candy: { from: "#FF8FC1", to: "#FFC6E5", ink: "#6B113F", emoji: "🍬" },
	midnight: { from: "#6C7BFF", to: "#B79BFF", ink: "#0C091F", emoji: "🌙" },
	lavender: { from: "#B9A7FF", to: "#E2D8FF", ink: "#3D286F", emoji: "💜" },
	mint: { from: "#62D8B5", to: "#BDF1D2", ink: "#0C4C3A", emoji: "🍃" },
	coral: { from: "#FF7F8D", to: "#FFC0AA", ink: "#571722", emoji: "🪸" },
	citrus: { from: "#FFD15C", to: "#FFF0A6", ink: "#604400", emoji: "🍋" },
	berry: { from: "#C768E8", to: "#F2A5D0", ink: "#280C30", emoji: "🫐" },
	aurora: { from: "#58D5C7", to: "#A79BFF", ink: "#133242", emoji: "✨" },
	lagoon: { from: "#35C7CB", to: "#91E3DD", ink: "#054146", emoji: "🐚" },
	rose: { from: "#F59AB2", to: "#FAD1DC", ink: "#67263C", emoji: "🌹" },
	sky: { from: "#69B8FF", to: "#C1E5FF", ink: "#123F69", emoji: "☁️" },
	peach: { from: "#FFAA83", to: "#FFE0BC", ink: "#69351E", emoji: "🍑" },
};

export const resolveAccent = (key?: string): CompetitionAccent =>
	COMPETITION_ACCENTS[key ?? ""] ?? COMPETITION_ACCENTS.sunset;

/** Inline style for any accent-tinted surface. */
export const accentGradient = (key?: string): Record<string, string> => {
	const a = resolveAccent(key);
	return {
		background: `linear-gradient(135deg, ${a.from} 0%, ${a.to} 100%)`,
		color: a.ink,
	};
};

export const MAX_CAPTION_LENGTH = 100;
export const MAX_THEME_LENGTH = 60;

/**
 * An entry counts as seen after this long on screen — same rule as the feed's
 * `post_views`. Not analytics: the winner is decided on votes/impressions, so
 * under-reporting here makes the results less fair, not just less measured.
 */
export const IMPRESSION_DWELL_MS = 1500;

/** Flush the pending impression batch at most this often. */
export const IMPRESSION_FLUSH_MS = 4000;

// ─── PHASE RESOLUTION ────────────────────────────────────────────────────────
// Derived from `now` vs the timestamps, never from calendar maths — the server
// does the same, so a compressed test cycle behaves exactly like a real week.

export interface PhaseWindow {
	starts_at: string;
	submissions_close_at: string;
	ends_at: string;
	phase?: CompetitionPhase;
}

const ms = (v: string): number => new Date(v).getTime();

export function phaseFor(
	window: PhaseWindow,
	now: number = Date.now(),
): CompetitionPhase {
	// `announced` is a server decision (scoring and granting happened) and can
	// never be derived from the clock.
	if (window.phase === "announced") return "announced";
	if (now < ms(window.starts_at)) return "scheduled";
	if (now < ms(window.submissions_close_at)) return "open";
	if (now < ms(window.ends_at)) return "voting";
	return "closed";
}

export const canSubmit = (w: PhaseWindow, now = Date.now()): boolean =>
	phaseFor(w, now) === "open";

export const canVote = (w: PhaseWindow, now = Date.now()): boolean => {
	const p = phaseFor(w, now);
	return p === "open" || p === "voting";
};

/** "2d 4h" / "4h 12m" / "12m 30s" — the countdown on every surface. */
export function formatRemaining(iso: string, now: number = Date.now()): string {
	const diff = new Date(iso).getTime() - now;
	if (diff <= 0) return "0m";

	const totalMinutes = Math.floor(diff / MINUTE);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m ${Math.floor((diff % MINUTE) / 1000)}s`;
}
