import type { Canvas } from "fabric";
import { defineStore } from "pinia";
import { type Ref, ref, watch } from "vue";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { BASE_BRUSH_SIZE, BLACK } from "@/draw/config/canvas.config";
import { brushDisplayName, brushItemId } from "@/draw/config/paidBrushes";
import { penBrushMapping } from "@/draw/config/tools.config";
import { useBrushTrial } from "@/draw/tools/brushTrial.store";
import { updateFreeDrawingCursor } from "@/draw/tools/cursor";
import { BrushType, type ToolService } from "@/draw/tools/tool.types";
import { hexWithOpacity, percentToAlphaHex } from "@/draw/utils/color.utils";
import { useToast } from "@/service/toast.service";
import { useInventoryStore } from "@/store/inventory.store";

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
	let c: Canvas | undefined;
	const brushSize = ref(BASE_BRUSH_SIZE);
	const brushType = ref<BrushType>(BrushType.Pencil);
	const brushColor = ref(BLACK);
	const opacity = ref(100);
	const pixelSize = ref(5);

	const density = ref(20);
	const dotWidth = ref(1);

	function chargeTrialStroke() {
		const itemId = brushItemId(brushType.value);

		if (!itemId || useInventoryStore().isOwned(itemId)) return;

		const trial = useBrushTrial();
		const left = trial.consume(itemId);
		if (left > 0) return;

		// Let them KEEP the stroke they just drew — removing it would read as a
		// bug — then hand back the pencil so the next one is not a surprise.
		const name = brushDisplayName(brushType.value);
		brushType.value = BrushType.Pencil;
		// Hand the reason to the pen menu, which then opens on the unlock CTA
		// rather than leaving the user to work out why the pencil came back.
		trial.noteLockedOut(itemId);
		useToast().toast(`${name} trial used up — tap it again to unlock`, {
			color: "warning",
		});
	}

	const events: FabricEvent[] = [
		{
			on: "mouse:down",
			handler: updatePenCursor,
		},
		{
			on: "path:created",
			handler: chargeTrialStroke,
		},
		{
			on: "zoomChanged",
			handler: updatePenCursor,
		},
		{
			on: "zoomReset",
			handler: (_e: any) => {
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
		// @ts-expect-error
		c!.freeDrawingBrush.density = density.value;
		// @ts-expect-error

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
