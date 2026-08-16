import type { Canvas } from "fabric";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { PENMENUTOOLS, SELECTMENUTOOLS } from "@/draw/config/tools.config";
import { resetSelectionScope } from "@/draw/layers/selectionScope";
import {
	DrawTool,
	type PenMenuTool,
	type SelectTool,
} from "@/draw/tools/tool.types";
import { createToolsMapping } from "@/draw/tools/toolRegistry";
import { useMenuStore } from "@/store/menu.store";

type SelectToolOption = {
	skipOpenMenu?: boolean;
	e?: any;
};

export const useToolSelection = defineStore("toolSelection", () => {
	const selectedTool = ref(DrawTool.MobileEraser);
	const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen);
	const lastSelectedSelectTool = ref<SelectTool>(DrawTool.Select);

	const { openToolMenu } = useMenuStore();
	const drawEventManager = useDrawEventManager();
	const toolsMapping = createToolsMapping();

	function init(c: Canvas) {
		for (const [, tool] of Object.entries(toolsMapping)) {
			tool.init(c);
		}
	}

	function destroy() {
		for (const tool of Object.values(toolsMapping)) tool.destroy?.();
		drawEventManager.removeEventsOfService("tool");
	}

	function selectTool(newTool: DrawTool, options?: SelectToolOption) {
		if (selectedTool.value === newTool && !options?.skipOpenMenu) {
			openToolMenu(newTool, options?.e);
			return;
		}

		selectedTool.value = newTool;
		toolsMapping[newTool].select();
		drawEventManager.switchToolEvents(toolsMapping[newTool]);
	}

	watch(selectedTool, () => {
		if (PENMENUTOOLS.includes(selectedTool.value)) {
			lastSelectedPenMenuTool.value = selectedTool.value as PenMenuTool;
		} else if (SELECTMENUTOOLS.includes(selectedTool.value)) {
			lastSelectedSelectTool.value = selectedTool.value as SelectTool;
		}
		// Cross-layer selection lasts only as long as the user is selecting.
		// Switching BETWEEN Select and Lasso keeps it — they are two ways to do
		// the same thing, and having them disagree would be the surprise this
		// switch exists to remove. Leaving for a brush or the eraser drops it.
		if (!SELECTMENUTOOLS.includes(selectedTool.value)) resetSelectionScope();
	});

	return {
		selectedTool,
		lastSelectedPenMenuTool,
		lastSelectedSelectTool,
		selectTool,
		init,
		destroy,
	};
});
