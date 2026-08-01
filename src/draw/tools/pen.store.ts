import { defineStore } from "pinia";
import { ref, Ref, watch } from "vue";
import { BrushType, type ToolService } from "@/draw/tools/tool.types";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { Canvas } from "fabric";
import { hexWithOpacity, percentToAlphaHex } from "@/draw/utils/color.utils";
import { updateFreeDrawingCursor } from "@/draw/tools/cursor";
import { BASE_BRUSH_SIZE, BLACK } from "@/draw/config/canvas.config";
import { penBrushMapping } from "@/draw/config/tools.config";

interface Pen extends ToolService {
	brushSize: Ref<number>;
	density: Ref<number>;
	pixelSize: Ref<number>;
	dotWidth: Ref<number>;
	brushType: Ref<BrushType>;
	brushColor: Ref<string>;
	opacity: Ref<number>;
	updatePenCursor: () => void;
	brushColorWithOpacity: () => string;
}

export const usePen = defineStore("pen", (): Pen => {
	let c: Canvas | undefined = undefined;
	const brushSize = ref(BASE_BRUSH_SIZE);
	const brushType = ref<BrushType>(BrushType.Pencil);
	const brushColor = ref(BLACK);
	const opacity = ref(100);
	const pixelSize = ref(5);

	const density = ref(20);
	const dotWidth = ref(1);

	const events: FabricEvent[] = [
		{
			on: "mouse:down",
			handler: updatePenCursor,
		},
		{
			on: "zoomChanged",
			handler: updatePenCursor,
		},
		{
			on: "zoomReset",
			handler: (e: any) => {
				updatePenCursor();
			},
		},
	];

	function init(canvas: Canvas) {
		c = canvas;
	}

	function destroy() {
		c = undefined;
	}

	async function select() {
		c!.isDrawingMode = true;
		c!.skipTargetFind = true;

		c!.selection = false;
		c!.freeDrawingBrush = penBrushMapping[brushType.value](c!);
		c!.freeDrawingBrush.width = brushSize.value;

		// TODO think of something
		// @ts-ignore
		c!.freeDrawingBrush.density = density.value;
		// @ts-ignore

		c!.freeDrawingBrush.dotWidth = dotWidth.value;
		// c!.freeDrawingBrush.pixelSize
		// 	= dotWidth.value;

		c!.freeDrawingBrush.color = brushColorWithOpacity();
		updatePenCursor();
	}

	function brushColorWithOpacity() {
		return hexWithOpacity(
			brushColor.value.substring(0, 7),
			percentToAlphaHex(opacity.value),
		);
	}

	function updatePenCursor() {
		if (!c?.freeDrawingBrush) return;
		updateFreeDrawingCursor(c, brushSize.value, c.freeDrawingBrush.color);
	}

	watch(brushSize, () => {
		if (!c?.freeDrawingBrush) return;
		c.freeDrawingBrush.width = brushSize.value;
		updatePenCursor();
	});

	watch(brushColor, () => {
		if (!c?.freeDrawingBrush) return;
		c.freeDrawingBrush.color = brushColorWithOpacity();
		updatePenCursor();
	});

	watch(opacity, () => {
		if (!c?.freeDrawingBrush) return;
		c.freeDrawingBrush.color = brushColorWithOpacity();
		updatePenCursor();
	});

	watch(density, () => {
		if (c?.freeDrawingBrush)
			(c.freeDrawingBrush as any).density = density.value;
	});

	watch(dotWidth, () => {
		if (c?.freeDrawingBrush)
			(c.freeDrawingBrush as any).dotWidth = dotWidth.value;
	});

	watch(pixelSize, () => {
		if (c?.freeDrawingBrush)
			(c.freeDrawingBrush as any).pixelSize = pixelSize.value;
	});

	watch(brushType, () => {
		if (c) void select();
	});

	return {
		select,
		init,
		destroy,
		brushSize,
		brushType,
		brushColor,
		events,
		opacity,
		updatePenCursor,
		brushColorWithOpacity,
		density,
		dotWidth,
		pixelSize,
	};
});
