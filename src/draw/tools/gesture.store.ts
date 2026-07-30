import { defineStore } from "pinia";
import { ref } from "vue";

export const useGestureStore = defineStore("gestureStore", () => {
	const renderedVpt = ref<number[]>([1, 0, 0, 1, 0, 0]);

	const isGesturing = ref(false);

	function setRenderedVpt(vpt: number[]) {
		renderedVpt.value = [...vpt];
	}

	return {
		renderedVpt,
		isGesturing,
		setRenderedVpt,
	};
});
