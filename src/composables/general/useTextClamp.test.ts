// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { useTextClamp } from "./useTextClamp";

/**
 * jsdom does no layout, so `scrollHeight`/`clientHeight` are always 0. Both are
 * defined here as writable properties, which lets a test say "this paragraph is
 * clipped" the same way a real clamp would.
 */
function makeParagraph(scrollHeight: number, clientHeight: number) {
	const el = document.createElement("p");
	Object.defineProperty(el, "scrollHeight", {
		value: scrollHeight,
		writable: true,
		configurable: true,
	});
	Object.defineProperty(el, "clientHeight", {
		value: clientHeight,
		writable: true,
		configurable: true,
	});
	document.body.appendChild(el);
	return el;
}

let resizeCallbacks: ResizeObserverCallback[] = [];

function mountClamp(el: HTMLElement) {
	let api!: ReturnType<typeof useTextClamp>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useTextClamp(ref(el));
				return () => h("div");
			},
		}),
	);
	return { api, wrapper };
}

describe("useTextClamp", () => {
	beforeEach(() => {
		resizeCallbacks = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(cb: ResizeObserverCallback) {
					resizeCallbacks.push(cb);
				}
				observe() {}
				disconnect() {}
			},
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
	});

	it("offers no control when the text already fits", () => {
		const { api, wrapper } = mountClamp(makeParagraph(40, 40));
		expect(api.overflowing.value).toBe(false);
		wrapper.unmount();
	});

	it("offers the control when the clamp is cutting text off", () => {
		const { api, wrapper } = mountClamp(makeParagraph(120, 40));
		expect(api.overflowing.value).toBe(true);
		wrapper.unmount();
	});

	it("keeps the control visible while expanded", async () => {
		// With the clamp off the paragraph reports that it fits, which is exactly
		// when a naive re-measure would hide the "Show less" the user needs.
		const el = makeParagraph(120, 40);
		const { api, wrapper } = mountClamp(el);

		await api.toggle();
		Object.defineProperty(el, "clientHeight", {
			value: 120,
			configurable: true,
		});

		expect(api.expanded.value).toBe(true);
		expect(api.overflowing.value).toBe(true);
		wrapper.unmount();
	});

	it("picks up text that only gets a real box later", async () => {
		// A feed card with `content-visibility: auto` that has never been on
		// screen skips layout and reports 0/0 — measuring once on mount would
		// decide "fits" and never show the control.
		const el = makeParagraph(0, 0);
		const { api, wrapper } = mountClamp(el);
		expect(api.overflowing.value).toBe(false);

		Object.defineProperty(el, "scrollHeight", {
			value: 120,
			configurable: true,
		});
		Object.defineProperty(el, "clientHeight", {
			value: 40,
			configurable: true,
		});
		for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
		await nextTick();

		expect(api.overflowing.value).toBe(true);
		wrapper.unmount();
	});
});
