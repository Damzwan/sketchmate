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

	function resetRuntimeState() {
		isFullscreen.value = false;
		chatToastsSilenced.value = false;
	}

	return { isFullscreen, chatToastsSilenced, resetRuntimeState };
});
