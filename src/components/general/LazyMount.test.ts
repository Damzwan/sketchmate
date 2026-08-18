// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import LazyMount from "./LazyMount.vue";

afterEach(() => vi.useRealTimers());

describe("LazyMount", () => {
	it("retains a mounted child by default", async () => {
		const wrapper = mount(LazyMount, {
			props: { when: true },
			slots: { default: '<div data-test="child" />' },
		});

		await wrapper.setProps({ when: false });
		expect(wrapper.find('[data-test="child"]').exists()).toBe(true);
	});

	it("releases a closed child after the configured delay", async () => {
		vi.useFakeTimers();
		const wrapper = mount(LazyMount, {
			props: { when: true, retain: false, unmountDelay: 100 },
			slots: { default: '<div data-test="child" />' },
		});

		await wrapper.setProps({ when: false });
		vi.advanceTimersByTime(99);
		await wrapper.vm.$nextTick();
		expect(wrapper.find('[data-test="child"]').exists()).toBe(true);

		vi.advanceTimersByTime(1);
		await wrapper.vm.$nextTick();
		expect(wrapper.find('[data-test="child"]').exists()).toBe(false);
	});

	it("cancels teardown when the overlay reopens", async () => {
		vi.useFakeTimers();
		const wrapper = mount(LazyMount, {
			props: { when: true, retain: false, unmountDelay: 100 },
			slots: { default: '<div data-test="child" />' },
		});

		await wrapper.setProps({ when: false });
		vi.advanceTimersByTime(50);
		await wrapper.setProps({ when: true });
		vi.advanceTimersByTime(100);
		await wrapper.vm.$nextTick();

		expect(wrapper.find('[data-test="child"]').exists()).toBe(true);
	});
});
