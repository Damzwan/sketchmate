import { defineStore } from "pinia";
import { ref } from "vue";

interface ShapeCreationSettings {
	stroke?: string;
	fill?: string;
	backgroundColor?: string;
	/** Always set — shapes cannot be created without a stroke width. */
	strokeWidth: number;
}

export const useShapeCreation = defineStore("shapeCreation", () => {
	const shapeCreationSettings = ref<ShapeCreationSettings>({
		stroke: "#000000",
		fill: undefined,
		backgroundColor: undefined,
		strokeWidth: 2,
	});

	return { shapeCreationSettings };
});
