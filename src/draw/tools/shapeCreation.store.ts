import { defineStore } from "pinia";
import { ref } from "vue";

interface ShapeCreationSettings {
	stroke?: string;
	fill?: string;
	backgroundColor?: string;
	strokeWidth?: number;
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
