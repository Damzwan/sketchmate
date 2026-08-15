// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { FeedPost } from "@/types/server.types";
import PostCredits from "./PostCredits.vue";

function makePost(overrides: Partial<FeedPost> = {}): FeedPost {
	return {
		_id: "post-1",
		author_id: "author-1",
		drawing_url: "",
		image_url: "",
		thumbnail_url: "",
		aspect_ratio: 1,
		comment_count: 0,
		reports_count: 0,
		enable_comments: true,
		enable_remix: true,
		views: 0,
		total_reactions: 0,
		status: "active",
		reaction_counts: {},
		author: { _id: "author-1", name: "mika", img: "" },
		user_reaction: null,
		comments: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	} as FeedPost;
}

function mountCredits(post: FeedPost) {
	return mount(PostCredits, {
		props: {
			post,
			labelColor: "#000",
			ringColor: "#fff",
		},
		global: {
			stubs: {
				"ion-icon": true,
				UserAvatar: { props: ["user"], template: "<img :alt='user.name' />" },
			},
		},
	});
}

describe("PostCredits", () => {
	it("renders nothing when the post has no credits", () => {
		// The common case. A row that exists but is empty would still cost a line
		// box on every card in the feed.
		expect(mountCredits(makePost()).find("div").exists()).toBe(false);
	});

	it("credits the origin author when the post is a remix", () => {
		const wrapper = mountCredits(
			makePost({
				remix_of: {
					post_id: "post-0",
					author: { _id: "author-2", name: "joko", img: "" },
				},
			}),
		);

		expect(wrapper.text()).toContain("Remix of");
		expect(wrapper.text()).toContain("joko");
	});

	it("credits room peers who drew on the canvas", () => {
		const wrapper = mountCredits(
			makePost({
				collaborators: [
					{ _id: "u1", name: "rae", img: "" },
					{ _id: "u2", name: "tev", img: "" },
				],
			}),
		);

		expect(wrapper.text()).toContain("Drawn with");
		expect(wrapper.text()).toContain("rae and tev");
	});

	it("collapses a long collaborator list to three faces and a count", () => {
		const wrapper = mountCredits(
			makePost({
				collaborators: ["rae", "tev", "nino", "sunny", "joko"].map(
					(name, index) => ({ _id: `u${index}`, name, img: "" }),
				),
			}),
		);

		// Three avatars rendered, the rest folded into the overflow chip.
		expect(wrapper.findAll("img")).toHaveLength(3);
		expect(wrapper.text()).toContain("+2");
		expect(wrapper.text()).toContain("rae, tev and 3 more");
	});

	it("renders a shoutout row for manual mentions", () => {
		const wrapper = mountCredits(
			makePost({ mentions: [{ _id: "u1", name: "nino", img: "" }] }),
		);

		expect(wrapper.text()).toContain("Shoutout to");
		expect(wrapper.text()).toContain("nino");
	});

	it("shows every row when a post is a remix, a collab AND a shoutout", () => {
		const wrapper = mountCredits(
			makePost({
				remix_of: {
					post_id: "post-0",
					author: { _id: "author-2", name: "joko", img: "" },
				},
				collaborators: [{ _id: "u1", name: "rae", img: "" }],
				mentions: [{ _id: "u2", name: "nino", img: "" }],
			}),
		);

		expect(wrapper.text()).toContain("Remix of");
		expect(wrapper.text()).toContain("Drawn with");
		expect(wrapper.text()).toContain("Shoutout to");
	});

	it("emits the credited user's id when the row is tapped", async () => {
		const wrapper = mountCredits(
			makePost({
				remix_of: {
					post_id: "post-0",
					author: { _id: "author-2", name: "joko", img: "" },
				},
			}),
		);

		await wrapper.findAll("button")[0].trigger("click");
		expect(wrapper.emitted("open-user")?.[0]).toEqual(["author-2"]);
	});
});
