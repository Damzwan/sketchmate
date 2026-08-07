import type { PluginListenerHandle } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { onScopeDispose, ref } from "vue";
import { isNative } from "@/helper/platform.helper";

/**
 * How many CSS pixels the on-screen keyboard covers at the bottom of the
 * window. Pad a bottom-anchored panel by this and its footer sits on the
 * keyboard while everything above it stays exactly where it was.
 *
 * NATIVE uses Capacitor's reported height, not `visualViewport`.
 *
 * The visual-viewport route was tried and reverted. Making it fire on Android
 * needs `interactive-widget=resizes-visual` in the viewport meta, and that flag
 * does two things, not one: it shrinks the visual viewport (wanted) AND lets
 * the engine scroll the visual viewport to reveal the focused input (not
 * wanted) — which slides the entire page up, carrying the chat header and
 * toolbar off screen. Capacitor runs with `resize: KeyboardResize.None`
 * precisely so nothing moves on its own, and this keeps that contract.
 *
 * WEB has no Capacitor plugin, so there `visualViewport` is the only source
 * available. Without the meta flag it reports the keyboard on iOS Safari and
 * stays 0 on Android Chrome — 0 being exactly the old behaviour on web, so
 * nothing regresses and iOS gets a working footer for free.
 */
export function useKeyboardInset(opts: { onWillShow?: () => void } = {}) {
	const keyboardInset = ref(0);
	const isKeyboardOpen = ref(false);

	const handles: Promise<PluginListenerHandle>[] = [];
	let detachWeb: (() => void) | undefined;

	if (isNative()) {
		// One handler for every "the keyboard is now N px tall" signal, because
		// the keyboard's height is NOT fixed for the lifetime of a focus session:
		// switching to the emoji panel (and back), or to a suggestion strip, or
		// rotating, all resize it. Treating only the first `willShow` as the real
		// height is what left a stale gap under the composer once the taller emoji
		// panel opened — the panel was padded for the alphabetic keyboard.
		//
		// Android's plugin re-fires `keyboardDidShow` on each of those resizes, so
		// this listener must apply the new height AND re-assert "open" + re-run the
		// scroll hook, not just correct a number. Previously `didShow` only wrote
		// the height: if Android had emitted a hide/show pair around the panel
		// switch, `isKeyboardOpen` stayed false and the thread never re-pinned.
		const applyHeight = (height: number) => {
			const next = Math.round(height);
			if (next === keyboardInset.value) return;
			keyboardInset.value = next;
			isKeyboardOpen.value = next > 0;
			if (next > 0) opts.onWillShow?.();
		};

		handles.push(
			Keyboard.addListener("keyboardWillShow", (info) =>
				applyHeight(info.keyboardHeight),
			),
			// `didShow` as well: on Android the height reported by `willShow` can be
			// the pre-animation estimate, and the final value only lands here — and
			// it's the event that carries every subsequent resize.
			Keyboard.addListener("keyboardDidShow", (info) =>
				applyHeight(info.keyboardHeight),
			),
			Keyboard.addListener("keyboardWillHide", () => applyHeight(0)),
			// `didHide` too: Android does not reliably emit `willHide`, so without
			// this the inset could stay stuck at the last keyboard height after the
			// keyboard was dismissed.
			Keyboard.addListener("keyboardDidHide", () => applyHeight(0)),
		);

		// The plugin's events above only fire when the IME ANIMATES (they come
		// from a WindowInsetsAnimation callback on the native side). Switching
		// between the alphabetic keyboard and the taller emoji panel resizes the
		// IME without an animation, so the plugin never reports it and the panel
		// keeps the previous keyboard's padding. MainActivity forwards every
		// OnApplyWindowInsets change as this window event, animated or not —
		// making it the authoritative height; the plugin listeners above now
		// mostly matter for firing `willShow` early enough to pre-scroll.
		const onNativeInset = (e: Event) => {
			const height = (e as CustomEvent<{ height: number }>).detail?.height;
			if (typeof height === "number") applyHeight(height);
		};
		window.addEventListener("nativeImeInset", onNativeInset);
		detachWeb = () =>
			window.removeEventListener("nativeImeInset", onNativeInset);
	} else if (typeof window !== "undefined" && window.visualViewport) {
		const vv = window.visualViewport;
		// Sub-pixel jitter is normal while the viewport animates; anything under a
		// few px is not a keyboard and must not push the layout around.
		const MIN_INSET = 24;
		const measure = () => {
			const occluded = window.innerHeight - (vv.height + vv.offsetTop);
			const next = occluded > MIN_INSET ? Math.round(occluded) : 0;
			if (next === keyboardInset.value) return;
			keyboardInset.value = next;
			isKeyboardOpen.value = next > 0;
			if (next > 0) opts.onWillShow?.();
		};
		vv.addEventListener("resize", measure);
		vv.addEventListener("scroll", measure);
		detachWeb = () => {
			vv.removeEventListener("resize", measure);
			vv.removeEventListener("scroll", measure);
		};
	}

	onScopeDispose(() => {
		// Scoped handles, NOT Keyboard.removeAllListeners() — that tears down every
		// listener the whole app registered on the plugin, including ones this
		// composable never owned.
		handles.forEach((h) => h.then((l) => l.remove()).catch(() => {}));
		detachWeb?.();
	});

	return { keyboardInset, isKeyboardOpen };
}
