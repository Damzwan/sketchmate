import { nextTick, onBeforeUnmount, onMounted, type Ref, ref } from "vue";

/**
 * Line-clamped text with a "see more" affordance that only appears when there
 * is actually something more to see.
 *
 * Measuring once on mount is not enough for feed cards: they use
 * `content-visibility: auto`, so a card that has never been on screen skips
 * layout entirely and reports `scrollHeight === clientHeight === 0`. The web
 * font swapping in re-flows the text too. A ResizeObserver catches both — it
 * fires when the element first gets a real box, and again whenever the box
 * changes.
 */
export function useTextClamp(element: Ref<HTMLElement | null>) {
	const expanded = ref(false);
	/**
	 * Sticky once true. While expanded the clamp is off, so a fresh measurement
	 * always reports "fits" — dropping the flag there would make the control
	 * vanish the moment it was used.
	 */
	const overflowing = ref(false);

	function measure() {
		const el = element.value;
		if (!el || expanded.value) return;
		overflowing.value = el.scrollHeight - el.clientHeight > 1;
	}

	async function toggle() {
		expanded.value = !expanded.value;
		if (!expanded.value) {
			// Re-check after the clamp is reapplied: the text may now fit (the card
			// could have been made wider while it was open).
			await nextTick();
			measure();
		}
	}

	let observer: ResizeObserver | null = null;

	onMounted(() => {
		measure();
		if (typeof ResizeObserver === "undefined") return;
		observer = new ResizeObserver(measure);
		if (element.value) observer.observe(element.value);
	});

	onBeforeUnmount(() => observer?.disconnect());

	return { expanded, overflowing, toggle };
}
