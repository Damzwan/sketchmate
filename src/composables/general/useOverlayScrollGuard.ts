import { onMounted, onUnmounted, type Ref } from "vue";

/**
 * Keep a scrolling list where the user left it while an overlay opens and
 * closes on top of it.
 *
 * Three things move the scroll position out from under a card list when a
 * popover, modal, action sheet or fullscreen viewer is dismissed:
 *
 *   1. Ionic restores focus to the element that opened the overlay, and the
 *      browser scrolls that element into view.
 *   2. Cards using `content-visibility: auto` resolve their real height as they
 *      re-enter the viewport, so `scrollHeight` moves during the animation.
 *   3. Chromium's own scroll anchoring picks a new anchor mid-change and
 *      "corrects" toward it.
 *
 * The guard answers all three: capture `scrollTop` before opening, disable
 * scroll anchoring for the overlay's lifetime, and re-pin every frame across
 * the dismissal until the layout stops moving. Any real scroll intent from the
 * user (pointer, touch, wheel) cancels it immediately, so it can never trap
 * someone who wants to scroll away.
 *
 * `rootRef` is any element inside the `ion-content` being guarded.
 */
export function useOverlayScrollGuard(rootRef: Ref<HTMLElement | null>) {
	let scrollEl: HTMLElement | null = null;
	let savedScrollTop = 0;
	let previousOverflowAnchor: string | null = null;
	let guardFrame: number | null = null;
	let guardUntil = 0;
	let releaseAnchorWhenGuardEnds = false;
	/** While true, user scroll intent does NOT cancel the guard — an overlay is
	 *  still on screen, so any "scroll" is the overlay's own, not the list's. */
	let overlayOpen = false;

	async function resolveScrollEl(): Promise<HTMLElement | null> {
		if (scrollEl?.isConnected) return scrollEl;
		const content = rootRef.value?.closest("ion-content") as any;
		scrollEl = content?.getScrollElement
			? await content.getScrollElement()
			: null;
		return scrollEl;
	}

	function blurOverlayTrigger() {
		const active = document.activeElement;
		if (active instanceof HTMLElement && active !== document.body)
			active.blur();
	}

	/** Call immediately before presenting an overlay. */
	async function captureOverlayScroll(): Promise<void> {
		const el = await resolveScrollEl();
		if (!el) return;

		if (guardFrame !== null) cancelAnimationFrame(guardFrame);
		guardFrame = null;
		guardUntil = 0;
		releaseAnchorWhenGuardEnds = false;
		overlayOpen = true;

		savedScrollTop = el.scrollTop;
		if (previousOverflowAnchor === null) {
			previousOverflowAnchor = el.style.overflowAnchor;
			el.style.overflowAnchor = "none";
		}
		blurOverlayTrigger();
	}

	function pinScroll() {
		if (
			scrollEl?.isConnected &&
			Math.abs(scrollEl.scrollTop - savedScrollTop) > 2
		)
			scrollEl.scrollTop = savedScrollTop;
	}

	function releaseScrollAnchor() {
		if (scrollEl?.isConnected && previousOverflowAnchor !== null) {
			scrollEl.style.overflowAnchor = previousOverflowAnchor;
		}
		previousOverflowAnchor = null;
	}

	function stopScrollGuard(releaseAnchor = true) {
		if (guardFrame !== null) cancelAnimationFrame(guardFrame);
		guardFrame = null;
		guardUntil = 0;
		releaseAnchorWhenGuardEnds = false;
		if (releaseAnchor) {
			overlayOpen = false;
			releaseScrollAnchor();
		}
	}

	/** Re-pin for `duration` ms. `releaseAnchorAfter` ends the overlay lifetime. */
	function guardScroll(duration = 500, releaseAnchorAfter = false) {
		guardUntil = Math.max(guardUntil, performance.now() + duration);
		releaseAnchorWhenGuardEnds ||= releaseAnchorAfter;
		if (guardFrame !== null) return;

		const tick = () => {
			pinScroll();
			if (performance.now() < guardUntil) {
				guardFrame = requestAnimationFrame(tick);
				return;
			}

			guardFrame = null;
			if (releaseAnchorWhenGuardEnds) {
				overlayOpen = false;
				releaseScrollAnchor();
			}
			releaseAnchorWhenGuardEnds = false;
		};
		guardFrame = requestAnimationFrame(tick);
	}

	/**
	 * The overlay has finished dismissing. Cover only the remaining
	 * focus-restoration frames, then hand scrolling back to the user.
	 */
	function endOverlay(tailMs = 48) {
		stopScrollGuard(false);
		guardScroll(tailMs, true);
	}

	function cancelOnInteraction() {
		if (!overlayOpen) stopScrollGuard();
	}

	const listenerOptions: AddEventListenerOptions = {
		capture: true,
		passive: true,
	};

	onMounted(() => {
		// Warm the handle so the first overlay can read/pin scroll synchronously.
		void resolveScrollEl();

		// Ionic overlays sit above the list during their leave animation. Listen at
		// document capture level so the first touch after close cancels the guard
		// even when that fading overlay, not the list, receives it.
		for (const event of ["pointerdown", "touchstart", "wheel"] as const) {
			document.addEventListener(event, cancelOnInteraction, listenerOptions);
		}
	});

	onUnmounted(() => {
		for (const event of ["pointerdown", "touchstart", "wheel"] as const) {
			document.removeEventListener(event, cancelOnInteraction, listenerOptions);
		}
		stopScrollGuard();
	});

	return {
		captureOverlayScroll,
		guardScroll,
		stopScrollGuard,
		endOverlay,
		resolveScrollEl,
		/** Tell the guard an overlay is on screen without re-capturing scroll. */
		markOverlayOpen: (open: boolean) => {
			overlayOpen = open;
		},
	};
}
