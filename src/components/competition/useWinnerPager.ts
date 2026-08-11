import { ref } from "vue";

export function useWinnerPager() {
	const pager = ref<HTMLElement | null>(null);
	const activeSlide = ref(0);

	function syncActiveSlide() {
		if (!pager.value) return;
		const center =
			pager.value.getBoundingClientRect().left + pager.value.clientWidth / 2;
		let closest = 0;
		let distance = Number.POSITIVE_INFINITY;
		for (const [index, slide] of Array.from(pager.value.children).entries()) {
			const rect = (slide as HTMLElement).getBoundingClientRect();
			const nextDistance = Math.abs(rect.left + rect.width / 2 - center);
			if (nextDistance < distance) {
				distance = nextDistance;
				closest = index;
			}
		}
		activeSlide.value = closest;
	}

	function goToSlide(index: number) {
		activeSlide.value = index;
		(pager.value?.children[index] as HTMLElement | undefined)?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}

	function activateSlide(index: number, event: MouseEvent) {
		if (index === activeSlide.value) return;
		event.preventDefault();
		event.stopPropagation();
		goToSlide(index);
	}

	return { pager, activeSlide, syncActiveSlide, goToSlide, activateSlide };
}
