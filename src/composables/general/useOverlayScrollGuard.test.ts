// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import {
	type OverlayScrollGuard,
	useOverlayScrollGuard,
} from "./useOverlayScrollGuard";

/**
 * The guard runs entirely on requestAnimationFrame, which makes it invisible to
 * any check performed in a background tab — a hidden page fires zero frames, so
 * the guard looks inert whether or not it works. These tests drive the frame
 * loop by hand instead.
 */
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function flushFrames(count = 1) {
	for (let i = 0; i < count; i++) {
		const due = [...frames.values()];
		frames = new Map();
		for (const cb of due) cb(performance.now());
	}
}

/** A stand-in ion-content whose scroll element behaves like the real one. */
function mountScroller() {
	const content = document.createElement("ion-content");
	const scrollEl = document.createElement("div");
	const inner = document.createElement("div");
	content.appendChild(scrollEl);
	scrollEl.appendChild(inner);
	document.body.appendChild(content);
	(content as any).getScrollElement = async () => scrollEl;
	return { content, scrollEl, inner };
}

function mountGuard(root: HTMLElement) {
	let guard!: OverlayScrollGuard;
	const wrapper = mount(
		defineComponent({
			setup() {
				const rootRef = ref<HTMLElement | null>(root);
				guard = useOverlayScrollGuard(rootRef);
				return () => h("div");
			},
		}),
	);
	return { guard, wrapper };
}

const pointerDownOn = (el: Element) =>
	el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

describe("useOverlayScrollGuard", () => {
	beforeEach(() => {
		frames = new Map();
		nextFrameId = 1;
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			const id = nextFrameId++;
			frames.set(id, cb);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => {
			frames.delete(id);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
	});

	it("pins the list back to where the overlay opened", async () => {
		const { scrollEl, inner } = mountScroller();
		scrollEl.scrollTop = 4000;
		const { guard, wrapper } = mountGuard(inner);

		await guard.captureOverlayScroll();
		guard.guardScroll(500);

		// Something (focus restore, a resolving card height) moves the list.
		scrollEl.scrollTop = 4600;
		flushFrames();

		expect(scrollEl.scrollTop).toBe(4000);
		wrapper.unmount();
	});

	it("stops pinning once the user grabs the list", async () => {
		// The reported bug: dismiss the sheet and flick immediately. The leave
		// animation is still running, so the gesture used to be ignored as
		// "belongs to the overlay"; onDidDismiss then fired endOverlay, whose tail
		// guard yanked scrollTop back to where the sheet was opened.
		const { scrollEl, inner } = mountScroller();
		scrollEl.scrollTop = 4000;
		const { guard, wrapper } = mountGuard(inner);

		await guard.captureOverlayScroll();
		guard.guardScroll(500);

		pointerDownOn(inner); // finger down on the list, overlay still dismissing
		scrollEl.scrollTop = 4600;
		flushFrames();
		expect(scrollEl.scrollTop).toBe(4600);

		// ...and the tail guard that runs on didDismiss must not undo it either.
		guard.endOverlay();
		flushFrames(2);
		expect(scrollEl.scrollTop).toBe(4600);
		wrapper.unmount();
	});

	it("ignores gestures that belong to the overlay itself", async () => {
		const { scrollEl, inner } = mountScroller();
		const sheet = document.createElement("ion-action-sheet");
		const button = document.createElement("button");
		sheet.appendChild(button);
		document.body.appendChild(sheet);

		scrollEl.scrollTop = 4000;
		const { guard, wrapper } = mountGuard(inner);

		await guard.captureOverlayScroll();
		guard.guardScroll(500);

		// Tapping a row inside the sheet is not the user scrolling the feed.
		pointerDownOn(button);
		scrollEl.scrollTop = 4600;
		flushFrames();

		expect(scrollEl.scrollTop).toBe(4000);
		wrapper.unmount();
	});

	it("restores scroll anchoring when the overlay is done", async () => {
		const { scrollEl, inner } = mountScroller();
		const { guard, wrapper } = mountGuard(inner);

		await guard.captureOverlayScroll();
		expect(scrollEl.style.overflowAnchor).toBe("none");

		guard.endOverlay(0);
		flushFrames();
		expect(scrollEl.style.overflowAnchor).toBe("");
		wrapper.unmount();
	});
});
