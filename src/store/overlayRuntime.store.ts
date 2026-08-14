import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Tiny cross-feature UI state.
 *
 * Global overlays may import this store without pulling Fabric or any drawing
 * engine modules into their chunk. The draw UI store re-exports the same refs
 * for existing drawing components.
 */
export const useOverlayRuntimeStore = defineStore("overlayRuntime", () => {
	const isFullscreen = ref(false);
	const chatToastsSilenced = ref(false);

	// The app shell only needs to know whether these lazy overlays should mount.
	// Keeping their visibility here prevents App.vue from importing each feature
	// store (and, transitively, chat, RevenueCat, social APIs, and drawing code)
	// during cold start. Feature stores share these refs as their public flags.
	const chatPanelOpen = ref(false);
	const parentalControlsOpen = ref(false);
	const confettiVisible = ref(false);
	const balloonVisible = ref(false);
	const shareToastsVisible = ref(false);

	function resetRuntimeState() {
		isFullscreen.value = false;
		chatToastsSilenced.value = false;
		chatPanelOpen.value = false;
		parentalControlsOpen.value = false;
		confettiVisible.value = false;
		balloonVisible.value = false;
		shareToastsVisible.value = false;
	}

	return {
		isFullscreen,
		chatToastsSilenced,
		chatPanelOpen,
		parentalControlsOpen,
		confettiVisible,
		balloonVisible,
		shareToastsVisible,
		resetRuntimeState,
	};
});
