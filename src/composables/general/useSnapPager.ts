import { onBeforeUnmount, onMounted, type Ref, ref } from "vue";

interface SnapPagerOptions<T extends string> {
	onChange?: (value: T) => void;
	restoreWhenVisible?: boolean;
}

/** Shared centered-snap navigation used by profile and chat preview pagers. */
export function useSnapPager<T extends string>(
	ids: readonly T[],
	active: Ref<T>,
	options: SnapPagerOptions<T> = {},
) {
	const pagerRef = ref<HTMLElement | null>(null);
	let pagerRaf = 0;
	let resizeObserver: ResizeObserver | null = null;

	function scrollToPane(index: number, smooth = true): boolean {
		const el = pagerRef.value;
		const child = el?.children[index] as HTMLElement | undefined;
		if (!el || !child || el.clientWidth === 0) return false;
		el.scrollTo({
			left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2,
			behavior: smooth ? "smooth" : "auto",
		});
		return true;
	}

	function setActive(id: T, scroll = true): void {
		if (active.value !== id) {
			active.value = id;
			options.onChange?.(id);
		}
		if (scroll) scrollToPane(ids.indexOf(id));
	}

	function onPaneClick(id: T, event: Event): void {
		if (active.value === id) return;
		event.stopPropagation();
		event.preventDefault();
		setActive(id);
	}

	function onPagerScroll(): void {
		if (pagerRaf) return;
		pagerRaf = requestAnimationFrame(() => {
			pagerRaf = 0;
			const el = pagerRef.value;
			if (!el) return;
			const center = el.scrollLeft + el.clientWidth / 2;
			let bestIndex = 0;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (let index = 0; index < el.children.length; index++) {
				const child = el.children[index] as HTMLElement;
				const distance = Math.abs(
					child.offsetLeft + child.offsetWidth / 2 - center,
				);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestIndex = index;
				}
			}
			const id = ids[bestIndex];
			if (id) setActive(id, false);
		});
	}

	onMounted(() => {
		if (!options.restoreWhenVisible || typeof ResizeObserver === "undefined") {
			return;
		}
		const el = pagerRef.value;
		if (!el) return;
		let wasVisible = el.clientWidth > 0;
		resizeObserver = new ResizeObserver(() => {
			const visible = el.clientWidth > 0;
			if (visible && !wasVisible)
				scrollToPane(ids.indexOf(active.value), false);
			wasVisible = visible;
		});
		resizeObserver.observe(el);
	});

	onBeforeUnmount(() => {
		if (pagerRaf) cancelAnimationFrame(pagerRaf);
		resizeObserver?.disconnect();
	});

	return { pagerRef, scrollToPane, setActive, onPaneClick, onPagerScroll };
}
