// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReactive, nextTick, watchEffect } from "vue";
import type {
	FeedPost,
	InboxItem,
	PopulatedConversation,
} from "@/types/server.types";

// The real auth store registers native/Firebase listeners during setup. Chat
// only needs the current user for these state-level tests, so keep the test at
// the Pinia boundary without booting platform services.
vi.mock("@/store/auth.store", async () => {
	const { defineStore } = await import("pinia");
	const { ref } = await import("vue");
	return {
		useAuthStore: defineStore("auth-reactivity-test", () => ({
			user: ref({ _id: "me" }),
		})),
	};
});

import { useChatStore } from "./chat.store";
import { useInboxStore } from "./inbox.store";
import { usePostStore } from "./post.store";

describe("list store reactivity", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("tracks nested feed reactions", async () => {
		const store = usePostStore();
		store.feedByTab.for_you = [
			{ _id: "post", reaction_counts: { love: 1 } } as unknown as FeedPost,
		];
		expect(isReactive(store.feedByTab.for_you[0])).toBe(true);

		let count = 0;
		const stop = watchEffect(() => {
			count = store.feedByTab.for_you[0]?.reaction_counts.love ?? 0;
		});
		store.feedByTab.for_you[0].reaction_counts.love = 2;
		await nextTick();

		expect(count).toBe(2);
		stop();
	});

	it("tracks nested inbox comments", async () => {
		const store = useInboxStore();
		store.inbox = [{ _id: "inbox", comments: [] } as unknown as InboxItem];
		expect(isReactive(store.inbox[0])).toBe(true);

		let count = 0;
		const stop = watchEffect(() => {
			count = store.inbox[0]?.comments.length ?? 0;
		});
		store.inbox[0].comments.push({
			_id: "comment",
			sender: "me",
			message: "hello",
			date: new Date().toISOString(),
		});
		await nextTick();

		expect(count).toBe(1);
		stop();
	});

	it("tracks chat metadata and message-array mutations", async () => {
		const store = useChatStore();
		store.activeChats = [
			{
				_id: "chat",
				participants: [],
				unread_counts: { me: 1 },
				status: "mate",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			} as PopulatedConversation,
		];
		store.messagesByChat.chat = [];
		expect(isReactive(store.activeChats[0])).toBe(true);
		expect(isReactive(store.messagesByChat.chat)).toBe(true);

		let unread = 0;
		let messages = 0;
		const stop = watchEffect(() => {
			unread = store.activeChats[0]?.unread_counts.me ?? 0;
			messages = store.messagesByChat.chat?.length ?? 0;
		});
		store.activeChats[0].unread_counts.me = 0;
		store.messagesByChat.chat.push({
			_id: "message",
			conversation_id: "chat",
			sender_id: "me",
			content: "hello",
			is_invite: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await nextTick();

		expect(unread).toBe(0);
		expect(messages).toBe(1);
		stop();
	});
});
