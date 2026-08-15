// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "@/types/server.types";

// The real auth store registers native/Firebase listeners during setup; these
// are state-level tests that never reach them.
vi.mock("@/store/auth.store", async () => {
	const { defineStore } = await import("pinia");
	const { ref } = await import("vue");
	return {
		useAuthStore: defineStore("auth-mention-test", () => ({
			user: ref({ _id: "me" }),
		})),
	};
});

import { usePostStore } from "./post.store";

function post(
	mentions: { _id: string; name: string; img: string }[],
): FeedPost {
	return { _id: "post-1", mentions } as unknown as FeedPost;
}

describe("removeMentionLocally", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("drops the user from every cached copy of the post", () => {
		const store = usePostStore();
		const mentions = [
			{ _id: "me", name: "mika", img: "" },
			{ _id: "other", name: "rae", img: "" },
		];
		store.feedByTab.for_you = [post(mentions)];
		store.userPosts = [post(mentions)];

		store.removeMentionLocally("post-1", "me");

		expect(store.feedByTab.for_you[0].mentions).toEqual([
			{ _id: "other", name: "rae", img: "" },
		]);
		expect(store.userPosts[0].mentions).toEqual([
			{ _id: "other", name: "rae", img: "" },
		]);
	});

	it("clears the field entirely when the last mention goes", () => {
		// Not an empty array: the credit row keys off presence, and an empty
		// array would render a labelled row with nothing in it.
		const store = usePostStore();
		store.feedByTab.for_you = [post([{ _id: "me", name: "mika", img: "" }])];

		store.removeMentionLocally("post-1", "me");

		expect(store.feedByTab.for_you[0].mentions).toBeUndefined();
	});

	it("leaves other posts alone", () => {
		const store = usePostStore();
		const other = post([{ _id: "me", name: "mika", img: "" }]);
		other._id = "post-2";
		store.feedByTab.for_you = [other];

		store.removeMentionLocally("post-1", "me");

		expect(store.feedByTab.for_you[0].mentions).toHaveLength(1);
	});
});
