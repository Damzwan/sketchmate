import { describe, expect, it } from "vitest";
import {
	compareConversationActivity,
	conversationActivityAt,
	recentActivityForPartner,
} from "./chat.helper";

const conversation = (overrides: Record<string, unknown> = {}) =>
	({
		_id: "conversation",
		participants: [],
		unread_counts: {},
		status: "mate",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	}) as any;

describe("chat activity ordering", () => {
	it("uses the last message rather than an administrative update", () => {
		const chat = conversation({
			last_message: { createdAt: "2026-02-01T00:00:00.000Z" },
		});

		expect(conversationActivityAt(chat)).toBe(
			new Date("2026-02-01T00:00:00.000Z").getTime(),
		);
	});

	it("sorts the newest actual conversation first", () => {
		const older = conversation({
			_id: "older",
			updatedAt: "2026-12-01T00:00:00.000Z",
			last_message: { createdAt: "2026-02-01T00:00:00.000Z" },
		});
		const newer = conversation({
			_id: "newer",
			updatedAt: "2026-03-01T00:00:00.000Z",
			last_message: { createdAt: "2026-03-01T00:00:00.000Z" },
		});

		expect([older, newer].sort(compareConversationActivity)[0]._id).toBe(
			"newer",
		);
	});

	it("uses server interaction metadata before chats hydrate", () => {
		expect(
			recentActivityForPartner([], "mate", "2026-04-01T00:00:00.000Z"),
		).toBe(new Date("2026-04-01T00:00:00.000Z").getTime());
	});
});
