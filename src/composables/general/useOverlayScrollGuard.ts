import { type ActionSheetOptions, actionSheetController } from "@ionic/vue";
import {
	type InjectionKey,
	inject,
	onMounted,
	onUnmounted,
	provide,
	type Ref,
} from "vue";

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

/** Longest an overlay may hold the guard before it is force-released. */
const OVERLAY_MAX_MS = 30_000;

export function useOverlayScrollGuard(rootRef: Ref<HTMLElement | null>) {
	let scrollEl: HTMLElement | null = null;
	let overlayTimeout: ReturnType<typeof setTimeout> | null = null;
	let savedScrollTop = 0;
	let previousOverflowAnchor: string | null = null;
	let guardFrame: number | null = null;
	let guardUntil = 0;
	let releaseAnchorWhenGuardEnds = false;
	/**
	 * The user has grabbed the list during this overlay cycle. Latched until the
	 * next capture: once they are scrolling, nothing may pull them back.
	 */
	let userTookOver = false;

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
		userTookOver = false;

		savedScrollTop = el.scrollTop;
		if (previousOverflowAnchor === null) {
			previousOverflowAnchor = el.style.overflowAnchor;
			el.style.overflowAnchor = "none";
		}
		blurOverlayTrigger();

		// Safety valve for the case where the matching endOverlay() never arrives —
		// an overlay dismissed by a route change, an onDidDismiss that never
		// settles, a component torn down mid-animation. A user gesture would
		// release the guard anyway, but nothing else would, and `overflowAnchor`
		// would stay off for the life of the page. No overlay legitimately takes
		// this long to close.
		if (overlayTimeout !== null) clearTimeout(overlayTimeout);
		overlayTimeout = setTimeout(() => {
			overlayTimeout = null;
			stopScrollGuard();
		}, OVERLAY_MAX_MS);
	}

	function pinScroll() {
		if (userTookOver) return;
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
		if (releaseAnchor && overlayTimeout !== null) {
			clearTimeout(overlayTimeout);
			overlayTimeout = null;
		}
		guardUntil = 0;
		releaseAnchorWhenGuardEnds = false;
		if (releaseAnchor) releaseScrollAnchor();
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
				releaseScrollAnchor();
				if (overlayTimeout !== null) {
					clearTimeout(overlayTimeout);
					overlayTimeout = null;
				}
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
		if (userTookOver) {
			// The user already took the list; `cancelOnInteraction` released
			// everything, so re-arming would only schedule a no-op frame loop. Do
			// drop focus though: Ionic hands it back to the trigger on dismiss, and
			// a trigger that is now off-screen gets scrolled back into view — the
			// same teleport by another route, and the one case the pin is no longer
			// there to absorb.
			blurOverlayTrigger();
			return;
		}
		stopScrollGuard(false);
		guardScroll(tailMs, true);
	}

	/** Overlays whose own gestures must not be mistaken for list scrolling. */
	const OVERLAY_TAGS =
		"ion-action-sheet, ion-popover, ion-modal, ion-alert, ion-picker, ion-toast";

	/**
	 * Decide, per gesture, whether the user is driving the OVERLAY or the LIST.
	 *
	 * This used to be decided by an `overlayOpen` flag, which disabled the escape
	 * hatch during the exact window it exists for. Dismiss a sheet and flick
	 * immediately: the leave animation is still running, so the flag is still set
	 * and the gesture is ignored; `onDidDismiss` then fires `endOverlay`, whose
	 * tail guard pins scrollTop back to where the sheet was opened. The user gets
	 * teleported back up, having scrolled a real distance first.
	 *
	 * The event target is the honest signal: a touch inside a live overlay
	 * belongs to that overlay, anything else is the user taking the list.
	 */
	function cancelOnInteraction(event: Event) {
		const target = event.target as Element | null;
		if (target?.closest?.(OVERLAY_TAGS)) return;
		userTookOver = true;
		stopScrollGuard();
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

	/**
	 * Open an action sheet without losing the reader's place.
	 *
	 * Focusing the trigger is enough on its own to move the scroller: measured in
	 * an isolated ion-content, focusing a button inside a card shifted scrollTop
	 * by 70px with no overlay involved at all. A tap focuses the button, and
	 * Ionic re-focuses it when the sheet closes, so an unguarded sheet gets two
	 * chances to scroll the list to wherever that button has to be to be "in
	 * view" — upward, whenever the trigger sits above the fold.
	 *
	 * `captureOverlayScroll` blurs the trigger and pins scrollTop across the
	 * whole lifecycle, so every action sheet opened from a scrolling list should
	 * come through here rather than calling `actionSheetController` directly.
	 */
	async function presentActionSheet(options: ActionSheetOptions) {
		await captureOverlayScroll();
		const sheet = await actionSheetController.create(options);
		await sheet.present();
		guardScroll(300);
		void sheet.onDidDismiss().then(() => endOverlay());
		return sheet;
	}

	return {
		captureOverlayScroll,
		guardScroll,
		stopScrollGuard,
		endOverlay,
		presentActionSheet,
		resolveScrollEl,
	};
}

export type OverlayScrollGuard = ReturnType<typeof useOverlayScrollGuard>;

const OVERLAY_SCROLL_GUARD: InjectionKey<OverlayScrollGuard> = Symbol(
	"overlay-scroll-guard",
);

/**
 * One guard per SCROLL CONTAINER, shared with everything inside it.
 *
 * Each guard swaps `overflowAnchor` on the scroll element and restores the
 * value it found. Two guards on the same element interleave badly: the second
 * saves the first's `none` as the "original" and restores that on release,
 * leaving anchoring permanently off. Feed cards also can't own one each — that
 * is one guard per card, all fighting over the same element.
 */
export function provideOverlayScrollGuard(
	rootRef: Ref<HTMLElement | null>,
): OverlayScrollGuard {
	const guard = useOverlayScrollGuard(rootRef);
	provide(OVERLAY_SCROLL_GUARD, guard);
	return guard;
}

/** No-op stand-in for components rendered outside any guarded scroller. */
const UNGUARDED: OverlayScrollGuard = {
	captureOverlayScroll: async () => {},
	guardScroll: () => {},
	stopScrollGuard: () => {},
	endOverlay: () => {},
	presentActionSheet: async (options: ActionSheetOptions) => {
		const sheet = await actionSheetController.create(options);
		await sheet.present();
		return sheet;
	},
	resolveScrollEl: async () => null,
};

/**
 * The enclosing scroller's guard, or a no-op one.
 *
 * The fallback keeps components usable where no scroller provides a guard —
 * FeedPostCard also renders inside the profile preview surface, which is not a
 * feed and has nothing to protect.
 */
export function useOverlayScrollGuardContext(): OverlayScrollGuard {
	return inject(OVERLAY_SCROLL_GUARD, UNGUARDED);
}
