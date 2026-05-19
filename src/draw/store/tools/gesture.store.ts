import { defineStore } from "pinia";
import { ref } from "vue";

export const useGestureStore = defineStore("gestureStore", () => {
	const renderedVpt = ref<number[]>([1, 0, 0, 1, 0, 0]);

	const isGesturing = ref(false);

	const minZoom = ref(0.2);
	const maxZoom = ref(50);

	function setRenderedVpt(vpt: number[]) {
		renderedVpt.value = [...vpt];
	}

	return {
		renderedVpt,
		isGesturing,
		minZoom,
		maxZoom,
		setRenderedVpt,
	};
});
