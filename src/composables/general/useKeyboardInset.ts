import { onScopeDispose, ref } from "vue";
import { Keyboard } from "@capacitor/keyboard";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNative } from "@/helper/general.helper";

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
		handles.push(
			Keyboard.addListener("keyboardWillShow", (info) => {
				keyboardInset.value = info.keyboardHeight;
				isKeyboardOpen.value = true;
				opts.onWillShow?.();
			}),
			// `didShow` as well: on Android the height reported by `willShow` can be
			// the pre-animation estimate, and the final value only lands here. Same
			// number in the common case, so this is a cheap correction rather than a
			// second layout pass.
			Keyboard.addListener("keyboardDidShow", (info) => {
				keyboardInset.value = info.keyboardHeight;
			}),
			Keyboard.addListener("keyboardWillHide", () => {
				keyboardInset.value = 0;
				isKeyboardOpen.value = false;
			}),
		);
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
