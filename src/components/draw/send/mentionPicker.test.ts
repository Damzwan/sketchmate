// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

// `vi.mock` is hoisted above the file's own consts, so the spy has to be
// created inside the factory and read back through `vi.mocked` afterwards.
vi.mock("@/service/api/relationship.api", () => ({
	fetchNetworkType: vi.fn(),
}));
vi.mock("@/service/toast.service", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/store/auth.store", async () => {
	const { defineStore } = await import("pinia");
	const { ref } = await import("vue");
	return {
		useAuthStore: defineStore("auth-mention-picker-test", () => ({
			user: ref({ _id: "me" }),
		})),
	};
});

import { fetchNetworkType as rawFetchNetworkType } from "@/service/api/relationship.api";
import { useMentionPicker } from "./useMentionPicker";

const fetchNetworkType = vi.mocked(rawFetchNetworkType);

/**
 * The composable registers lifecycle hooks, so it has to run inside a real
 * component instance rather than being called bare.
 */
function mountPicker() {
	let picker!: ReturnType<typeof useMentionPicker>;
	const wrapper = mount(
		defineComponent({
			setup() {
				picker = useMentionPicker();
				return () => h("div");
			},
		}),
	);
	return { picker, wrapper };
}

const mate = (id: string, name: string) => ({ _id: id, name, img: "" });

describe("useMentionPicker", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		fetchNetworkType.mockReset();
		fetchNetworkType.mockResolvedValue({ total: 0, data: [] });
	});

	it("asks only for permanent mates", async () => {
		// Trials and pending requests are fine to hand a drawing to, but not to
		// name on the public feed.
		const { picker } = mountPicker();
		picker.ensureLoaded();
		await nextTick();

		expect(fetchNetworkType).toHaveBeenCalledWith(
			"me",
			"mates",
			expect.objectContaining({ status: "mate" }),
		);
	});

	it("does not fetch until the row asks it to", () => {
		mountPicker();
		expect(fetchNetworkType).not.toHaveBeenCalled();
	});

	it("passes a debounced search term through", async () => {
		vi.useFakeTimers();
		const { picker } = mountPicker();
		picker.mentionSearch.value = "rae";
		picker.onMentionSearch();
		await vi.runAllTimersAsync();
		vi.useRealTimers();

		expect(fetchNetworkType).toHaveBeenCalledWith(
			"me",
			"mates",
			expect.objectContaining({ search: "rae" }),
		);
	});

	it("skips the request for a search term the server would ignore", async () => {
		// The endpoint drops terms under three characters, so firing one costs a
		// round trip and returns the unfiltered list — which looks like the search
		// silently failing.
		vi.useFakeTimers();
		const { picker } = mountPicker();
		picker.mentionSearch.value = "ra";
		picker.onMentionSearch();
		await vi.runAllTimersAsync();
		vi.useRealTimers();

		expect(fetchNetworkType).not.toHaveBeenCalled();
	});

	it("keeps selected mates visible when a search excludes them", async () => {
		fetchNetworkType.mockResolvedValue({
			total: 1,
			data: [mate("u1", "rae")],
		});
		const { picker } = mountPicker();
		await picker.ensureLoaded();
		await nextTick();

		picker.toggleMention("u1");
		fetchNetworkType.mockResolvedValue({
			total: 1,
			data: [mate("u2", "nino")],
		});
		picker.mentionSearch.value = "nino";
		picker.clearMentionSearch();
		picker.mentionSearch.value = "nino";
		await nextTick();
		await nextTick();

		expect(picker.mentionIds.value).toEqual(["u1"]);
	});

	it("caps selection at three", async () => {
		const { picker } = mountPicker();
		for (const id of ["a", "b", "c", "d"]) picker.toggleMention(id);

		expect(picker.mentionIds.value).toHaveLength(3);
	});
});
