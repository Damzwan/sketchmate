import { describe, expect, it } from "vitest";
import {
	canSubmit,
	canVote,
	DAY,
	formatRemaining,
	type PhaseWindow,
	phaseFor,
	resolveAccent,
} from "./competition.config";

/**
 * Phase resolution is the load-bearing rule of the whole feature: it is what
 * lets a six-minute test cycle exercise the same code as a real week. The
 * server keeps an identical copy of this logic — if a case here changes,
 * sketchmate_server/src/config/competition.config.ts changes with it.
 */

const START = Date.parse("2026-08-03T00:00:00Z"); // a Monday

const window = (overrides: Partial<PhaseWindow> = {}): PhaseWindow => ({
	starts_at: new Date(START).toISOString(),
	submissions_close_at: new Date(START + 5 * DAY).toISOString(),
	ends_at: new Date(START + 7 * DAY).toISOString(),
	...overrides,
});

describe("phaseFor", () => {
	it.each([
		["before it starts", START - 1, "scheduled"],
		["at the opening instant", START, "open"],
		["mid submissions", START + 2 * DAY, "open"],
		["one ms before submissions close", START + 5 * DAY - 1, "open"],
		["at submissions close", START + 5 * DAY, "voting"],
		["one ms before the end", START + 7 * DAY - 1, "voting"],
		["at the end", START + 7 * DAY, "closed"],
		["long after the end", START + 30 * DAY, "closed"],
	])("%s → %s", (_label, now, expected) => {
		expect(phaseFor(window(), now as number)).toBe(expected);
	});

	it("never derives 'announced' from the clock", () => {
		// Announcing means scoring, moderation re-check and granting all happened.
		// Only the server can say so; the client must not guess it from dates.
		expect(phaseFor(window(), START + 30 * DAY)).toBe("closed");
	});

	it("trusts a server-declared 'announced' over the clock", () => {
		expect(phaseFor(window({ phase: "announced" }), START + DAY)).toBe(
			"announced",
		);
	});

	it("works identically on a compressed test cycle", () => {
		const short = window({
			submissions_close_at: new Date(START + 4 * 60_000).toISOString(),
			ends_at: new Date(START + 6 * 60_000).toISOString(),
		});
		expect(phaseFor(short, START + 60_000)).toBe("open");
		expect(phaseFor(short, START + 5 * 60_000)).toBe("voting");
		expect(phaseFor(short, START + 7 * 60_000)).toBe("closed");
	});
});

describe("canSubmit / canVote", () => {
	it("allows voting through both open and voting, submissions only in open", () => {
		expect(canSubmit(window(), START + DAY)).toBe(true);
		expect(canVote(window(), START + DAY)).toBe(true);

		expect(canSubmit(window(), START + 6 * DAY)).toBe(false);
		expect(canVote(window(), START + 6 * DAY)).toBe(true);

		expect(canVote(window(), START + 8 * DAY)).toBe(false);
	});
});

describe("resolveAccent", () => {
	it("falls back rather than returning undefined for an unknown key", () => {
		expect(resolveAccent("not-a-real-accent")).toEqual(resolveAccent("sunset"));
		expect(resolveAccent(undefined).from).toBeTruthy();
	});
});

describe("formatRemaining", () => {
	const iso = new Date(START + 7 * DAY).toISOString();

	it("drops to finer units as the deadline approaches", () => {
		expect(formatRemaining(iso, START)).toBe("7d 0h");
		expect(formatRemaining(iso, START + 6 * DAY)).toBe("1d 0h");
		expect(formatRemaining(iso, START + 6 * DAY + 90 * 60_000)).toBe("22h 30m");
		expect(formatRemaining(iso, START + 7 * DAY - 90_000)).toBe("1m 30s");
	});

	it("clamps at zero instead of counting up past the deadline", () => {
		expect(formatRemaining(iso, START + 8 * DAY)).toBe("0m");
	});
});
