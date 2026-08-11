import { onLongPress, useEventListener } from "@vueuse/core";
import type { Ref } from "vue";
import { ref } from "vue";
import { playSelectionTick } from "@/config/post.config";

interface GestureOptions {
	swiper: Ref<any>;
	config: Ref<any>;
	currItem: Ref<any>;
	commentDrawerOpen: Ref<boolean>;
	followerDrawerOpen: Ref<boolean>;
	closeViewer: () => void;
	react: (type: string) => void;
}

export function usePhotoSwiperGestures(options: GestureOptions) {
	const chromeVisible = ref(true);
	const chromeAnimated = ref(false);
	const artSurface = ref<HTMLElement | null>(null);
	const longPressPopoverOpen = ref(false);
	const longPressEvent = ref<Event | null>(null);
	const activePointers = new Set<number>();
	let tapTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressNextTap = false;

	function onSwiperTap() {
		if (options.commentDrawerOpen.value || options.followerDrawerOpen.value)
			return;
		if (suppressNextTap) {
			suppressNextTap = false;
			return;
		}
		if (longPressPopoverOpen.value) return;
		if (tapTimer) clearTimeout(tapTimer);
		tapTimer = setTimeout(() => {
			chromeAnimated.value = true;
			chromeVisible.value = !chromeVisible.value;
			tapTimer = null;
		}, 260);
	}

	function onSwiperDoubleTap() {
		if (!tapTimer) return;
		clearTimeout(tapTimer);
		tapTimer = null;
	}

	function keyboardListener(event: KeyboardEvent) {
		event.stopPropagation();
		if (options.commentDrawerOpen.value || options.followerDrawerOpen.value)
			return;
		if (event.key === "Escape") options.closeViewer();
		else if (event.key === "ArrowRight")
			options.swiper.value?.swiper?.slideNext();
		else if (event.key === "ArrowLeft")
			options.swiper.value?.swiper?.slidePrev();
	}

	function resetGestures() {
		if (tapTimer) clearTimeout(tapTimer);
		tapTimer = null;
		chromeVisible.value = true;
		chromeAnimated.value = false;
		longPressPopoverOpen.value = false;
		suppressNextTap = false;
		activePointers.clear();
	}

	function closeLongPressPopover() {
		longPressPopoverOpen.value = false;
		suppressNextTap = false;
	}

	function onLongPressReaction(type: string) {
		closeLongPressPopover();
		options.react(type);
	}

	const trackPointer = (event: PointerEvent) =>
		activePointers.add(event.pointerId);
	const releasePointer = (event: PointerEvent) =>
		activePointers.delete(event.pointerId);
	useEventListener(artSurface, "pointerdown", trackPointer, { passive: true });
	useEventListener(artSurface, "pointerup", releasePointer, { passive: true });
	useEventListener(artSurface, "pointercancel", releasePointer, {
		passive: true,
	});

	onLongPress(
		artSurface,
		(event: PointerEvent) => {
			if (options.config.value.type !== "post" || !options.currItem.value)
				return;
			if (options.commentDrawerOpen.value || options.followerDrawerOpen.value)
				return;
			const zoom = options.swiper.value?.swiper?.zoom?.scale ?? 1;
			if (activePointers.size > 1 || zoom > 1.01) return;
			if (tapTimer) clearTimeout(tapTimer);
			tapTimer = null;
			suppressNextTap = true;
			playSelectionTick();

			const { clientX: x = 0, clientY: y = 0 } = event;
			longPressEvent.value = {
				target: {
					getBoundingClientRect: () => ({
						left: x,
						top: y - 20,
						right: x,
						bottom: y,
						width: 0,
						height: 0,
					}),
				},
			} as unknown as Event;
			longPressPopoverOpen.value = true;
		},
		{ delay: 650, distanceThreshold: 10 },
	);

	return {
		chromeVisible,
		chromeAnimated,
		artSurface,
		longPressPopoverOpen,
		longPressEvent,
		onSwiperTap,
		onSwiperDoubleTap,
		keyboardListener,
		resetGestures,
		closeLongPressPopover,
		onLongPressReaction,
	};
}
