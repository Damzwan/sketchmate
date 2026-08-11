import { onBeforeUnmount, type Ref, ref, watch } from "vue";
import { useChatWidgetStore } from "@/store/chatWidget.store";

export function useChatWidgetSheet(
	isExpanded: Ref<boolean>,
	customizationOpen: Ref<boolean>,
	onPresent: () => void,
) {
	const chatWidget = useChatWidgetStore();
	const contentMounted = ref(isExpanded.value);
	const customizationLoaded = ref(customizationOpen.value);
	const sheetOffset = ref(0);
	const isDragging = ref(false);
	let releaseTimer: ReturnType<typeof setTimeout> | undefined;
	let dragStartY = 0;
	let dragStartTime = 0;
	const lowEnd =
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("low-end");

	watch(customizationOpen, (open) => {
		if (open) customizationLoaded.value = true;
	});
	watch(
		isExpanded,
		(expanded) => {
			clearTimeout(releaseTimer);
			if (expanded) {
				contentMounted.value = true;
				sheetOffset.value = 0;
				onPresent();
				return;
			}
			releaseTimer = setTimeout(
				() => (contentMounted.value = false),
				lowEnd ? 3_000 : 20_000,
			);
		},
		{ immediate: true },
	);

	function onDragStart(event: PointerEvent) {
		dragStartY = event.clientY;
		dragStartTime = performance.now();
		isDragging.value = true;
		(event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
	}
	function onDragMove(event: PointerEvent) {
		if (isDragging.value)
			sheetOffset.value = Math.max(0, event.clientY - dragStartY);
	}
	function onDragEnd(event: PointerEvent) {
		if (!isDragging.value) return;
		isDragging.value = false;
		const handle = event.currentTarget as HTMLElement | null;
		if (handle?.hasPointerCapture(event.pointerId))
			handle.releasePointerCapture(event.pointerId);

		const distance = sheetOffset.value;
		const velocity = distance / Math.max(1, performance.now() - dragStartTime);
		if (distance > 150 || velocity > 0.5) {
			chatWidget.closePanel();
			setTimeout(() => (sheetOffset.value = 0), 250);
		} else {
			sheetOffset.value = 0;
		}
	}

	onBeforeUnmount(() => clearTimeout(releaseTimer));
	return {
		contentMounted,
		customizationLoaded,
		sheetOffset,
		isDragging,
		onDragStart,
		onDragMove,
		onDragEnd,
	};
}
