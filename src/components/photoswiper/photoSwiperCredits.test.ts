// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/composables/profile/useUserContextSheet", () => ({
	useUserContextSheet: () => ({ openUserActions: vi.fn() }),
}));

import PhotoSwiperHeader from "./PhotoSwiperHeader.vue";

const stubs = {
	"ion-toolbar": { template: "<div><slot /></div>" },
	"ion-buttons": { template: "<div><slot /></div>" },
	"ion-button": { template: "<button><slot /></button>" },
	"ion-icon": true,
	UserAvatar: { props: ["user"], template: "<img />" },
};

function mountHeader(currItem: any, type: "post" | "inbox" | "competition") {
	return mount(PhotoSwiperHeader, {
		props: { currItem, type },
		global: { stubs },
	});
}

describe("PhotoSwiperHeader credits", () => {
	it("shows the same credit rows the feed card does", () => {
		// Opening a post fullscreen must not drop an attribution the smaller
		// view showed.
		const wrapper = mountHeader(
			{
				_id: "p1",
				author: { _id: "a1", name: "mika", img: "" },
				remix_of: {
					post_id: "p0",
					author: { _id: "a2", name: "joko", img: "" },
				},
				collaborators: [{ _id: "u1", name: "rae", img: "" }],
				mentions: [{ _id: "u2", name: "nino", img: "" }],
			},
			"post",
		);

		expect(wrapper.text()).toContain("Remix of");
		expect(wrapper.text()).toContain("joko");
		expect(wrapper.text()).toContain("Drawn with");
		expect(wrapper.text()).toContain("Shoutout to");
	});

	it("renders no credit row for a post that has none", () => {
		const wrapper = mountHeader(
			{ _id: "p1", author: { _id: "a1", name: "mika", img: "" } },
			"post",
		);

		expect(wrapper.text()).not.toContain("Remix of");
	});

	it("stays out of the inbox header", () => {
		// The swiper is shared with the inbox, where items are not posts and have
		// no credit fields at all.
		const wrapper = mountHeader(
			{ _id: "i1", followers: [], sender: "a1" },
			"inbox",
		);

		expect(wrapper.text()).not.toContain("Remix of");
	});
});
