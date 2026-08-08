import { defineStore } from "pinia";
import { computed, type InjectionKey, type MaybeRefOrGetter, ref } from "vue";
import { useMenuStore } from "@/store/menu.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";

/**
 * provide(AMBIENT_FOREGROUND, …) marks a subtree as living INSIDE the overlay
 * that's up (the shop, a preview modal) rather than behind it. Worlds/effects in
 * that subtree ignore the global pause and keep animating — they're the content
 * the user came to look at. Everything else stays frozen. Injected as `false`
 * (background) by default; survives ion-modal teleport since inject follows the
 * component render tree, not the DOM.
 *
 * The value may be a boolean, ref, or getter (consumers unwrap with `toValue`) so
 * a parent can drive it reactively — e.g. the shop provides `!previewOpen` to
 * freeze its own grid while a preview modal is up, and the preview modal
 * re-provides `true` for its own content so only the previewed item animates.
 */
export const AMBIENT_FOREGROUND: InjectionKey<MaybeRefOrGetter<boolean>> =
	Symbol("ambient-foreground");

/**
 * Single source of truth for "should ambient customization animation (ProfileWorld
 * sprites + ProfileEffect glass/shimmer/grain) freeze right now".
 *
 * The profile card, feed cards, chat toolbar etc. all animate the same worlds/
 * effects. When a big overlay covers the app — paywall, shop, what's-new, the
 * fullscreen photo swiper, or the card-doodle pad — every one of those layers is
 * invisible but was still burning rAF + WASM lottie decode + conic-blur
 * re-raster underneath. That is exactly when we want the CPU/GPU free for the
 * overlay to open and respond instantly.
 *
 * Menu-tracked overlays fold in reactively. Modals that live outside the menu
 * store (BackgroundSketchPadModal) push/pop a manual hold on present/dismiss.
 */
export const useAmbientPause = defineStore("ambientPause", () => {
	const menu = useMenuStore();
	const swiper = usePhotoSwiper();

	// Balanced hold()/release() for overlays not tracked in the menu store.
	const manualHolds = ref(0);
	const hold = () => manualHolds.value++;
	const release = () => {
		if (manualHolds.value > 0) manualHolds.value--;
	};

	const paused = computed(
		() =>
			swiper.open ||
			menu.isPaywallOpen ||
			menu.isShopOpen ||
			menu.isWhatsNewOpen ||
			menu.isCompetitionResultsOpen ||
			manualHolds.value > 0,
	);

	// A logout mid-overlay would otherwise strand a hold and freeze every
	// ambient animation for the rest of the process.
	const resetRuntimeState = () => {
		manualHolds.value = 0;
	};

	return { paused, hold, release, resetRuntimeState };
});
