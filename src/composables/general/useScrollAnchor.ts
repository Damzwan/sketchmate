import { nextTick, type Ref } from "vue";

// How long to keep re-pinning to the bottom after the initial scroll, and how
// many consecutive stable frames end it early. ~600ms covers the slow cases
// (webfont swap re-flowing bubble text, content-visibility rows resolving their
// real height) without being long enough to trap a user who starts scrolling.
const SETTLE_MS = 600;
const STABLE_FRAMES = 3;

export function useScrollAnchor(containerRef: Ref<HTMLElement | null>) {
	// Cancels an in-flight settle when a newer scroll request supersedes it.
	let settleToken = 0;

	/**
	 * Keep the view pinned to the bottom while the content is still growing.
	 *
	 * A single `scrollTo(scrollHeight)` is not enough here. The message list uses
	 * `content-visibility: auto`, so rows that have never been rendered report
	 * their `contain-intrinsic-size` estimate rather than their true height —
	 * `scrollHeight` is therefore an UNDER-estimate at the moment we scroll, and
	 * grows as rows resolve. Webfont swap moves it too. One scroll lands short of
	 * the newest message; re-pinning until the height stops changing lands on it.
	 */
	function settleAtBottom(el: HTMLElement) {
		const token = ++settleToken;
		const deadline = performance.now() + SETTLE_MS;
		let lastHeight = -1;
		let stable = 0;

		const step = () => {
			// A newer scroll request, an unmounted container, or a swapped element
			// all mean this settle is stale.
			if (token !== settleToken || containerRef.value !== el) return;

			const height = el.scrollHeight;
			if (height !== lastHeight) {
				lastHeight = height;
				stable = 0;
				el.scrollTop = height;
			} else if (++stable >= STABLE_FRAMES) {
				return;
			}

			if (performance.now() >= deadline) return;
			requestAnimationFrame(step);
		};

		requestAnimationFrame(step);
	}

	async function scrollToBottom(instant = false) {
		await nextTick();
		const el = containerRef.value;
		if (!el) return;

		el.scrollTo({
			top: el.scrollHeight,
			behavior: instant ? "auto" : "smooth",
		});

		// Only chase the bottom on instant scrolls. A smooth scroll is an animation
		// the user can see and interrupt; writing `scrollTop` underneath it would
		// fight both the animation and them.
		if (instant) settleAtBottom(el);
	}

	function captureScrollState() {
		const el = containerRef.value;
		return el
			? { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
			: null;
	}

	function restoreScrollState(snapshot: {
		scrollHeight: number;
		scrollTop: number;
	}) {
		const el = containerRef.value;
		if (!el) return;
		// Restoring an anchor after a prepend is the opposite intent to pinning at
		// the bottom — make sure a settle from an earlier call can't overwrite it.
		settleToken++;
		el.scrollTo({
			top: snapshot.scrollTop + (el.scrollHeight - snapshot.scrollHeight),
			behavior: "auto",
		});
	}

	return { scrollToBottom, captureScrollState, restoreScrollState };
}
