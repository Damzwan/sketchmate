import { defineStore } from "pinia";
import {
	DrawTool,
	type PenMenuTool,
	type SelectTool,
} from "@/draw/tools/tool.types";
import { PENMENUTOOLS, SELECTMENUTOOLS } from "@/draw/config/tools.config";
import { useMenuStore } from "@/store/menu.store";
import { createToolsMapping } from "@/draw/tools/toolRegistry";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { ref, watch } from "vue";
import { Canvas } from "fabric";

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
