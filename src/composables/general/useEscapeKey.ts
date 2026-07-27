import { toValue, type MaybeRefOrGetter } from "vue";
import { useEventListener } from "@vueuse/core";

interface EscapeKeyOptions {
	enabled?: MaybeRefOrGetter<boolean>;
}

/**
 * Gives custom overlays the Escape behavior Ionic overlays provide.
 * The listener is lifecycle-scoped and automatically removed on unmount.
 */
export function useEscapeKey(
	onEscape: (event: KeyboardEvent) => void,
	options: EscapeKeyOptions = {},
) {
	useEventListener(window, "keydown", (event) => {
		if (
			event.key !== "Escape" ||
			event.defaultPrevented ||
			event.repeat ||
			event.isComposing ||
			(options.enabled !== undefined && !toValue(options.enabled))
		)
			return;

		event.preventDefault();
		event.stopPropagation();
		onEscape(event);
	});
}
