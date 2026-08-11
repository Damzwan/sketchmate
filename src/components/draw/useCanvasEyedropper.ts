import { popoverController } from "@ionic/vue";
import { storeToRefs } from "pinia";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import type { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { ERASERS, PENMENUTOOLS } from "@/draw/config/tools.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { exitColorPickerMode } from "@/draw/tools/colorActions";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { isMobile } from "@/helper/platform.helper";

type SelectColor = (color: string) => void | Promise<void>;

export function useCanvasEyedropper(
	selectColor: SelectColor,
	colorPickerAction: MaybeRefOrGetter<DrawAction | undefined>,
) {
	function pickColor() {
		const { getCanvas, selectAction } = useDrawStore();
		const { activateExclusiveEvents } = useDrawEventManager();
		const { selectedTool } = useToolSelection();
		const { colorPickerMode } = storeToRefs(useDrawUIStore());
		const canvas = getCanvas();
		const lastSelectedObject = canvas.getActiveObject();

		colorPickerMode.value = true;
		canvas.selection = false;
		canvas.skipTargetFind = true;
		if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
			canvas.isDrawingMode = false;
		}

		activateExclusiveEvents([
			{
				on: "mouse:up",
				handler: (options: any) => {
					exitColorPickerMode({ lastSelectedObjectRef: lastSelectedObject });
					const color = colorAtPointer(canvas, options);
					void selectColor(color);
					const action = toValue(colorPickerAction);
					if (action) selectAction(action, { color });
					canvas.freeDrawingCursor = "default";
					canvas.contextTop?.clearRect(0, 0, canvas.width, canvas.height);
				},
			},
			{
				on: "mouse:move",
				handler: (options: any) => {
					const pixel = pixelAtPointer(canvas, options);
					const color = `rgba(${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3] / 255})`;
					updateColorIndicator(canvas, color, options);
				},
			},
		]);

		void popoverController.dismiss();
	}

	return { pickColor };
}

function pixelAtPointer(canvas: any, options: any): Uint8ClampedArray {
	const pointer = canvas.getViewportPoint(options.e);
	const dpr = window.devicePixelRatio || 1;
	return canvas
		.getContext()
		.getImageData(pointer.x * dpr, pointer.y * dpr, 1, 1).data;
}

function colorAtPointer(canvas: any, options: any): string {
	const pixel = pixelAtPointer(canvas, options);
	return (
		"#" +
		((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
			.toString(16)
			.slice(1)
			.toUpperCase() +
		pixel[3].toString(16).toUpperCase().padStart(2, "0")
	);
}

function updateColorIndicator(
	canvas: any,
	color: string,
	event?: any,
	size = isMobile() ? 80 : 32,
) {
	const zoom = canvas.getZoom();
	const adjustedSize = size * zoom;
	if (isMobile() && event) {
		drawMobileIndicator(canvas, event.pointer, color, adjustedSize, zoom);
		return;
	}
	if (isMobile()) return;

	const cursorCanvas = document.createElement("canvas");
	cursorCanvas.width = adjustedSize;
	cursorCanvas.height = adjustedSize;
	const context = cursorCanvas.getContext("2d");
	if (!context) return;
	const center = adjustedSize / 2;
	const radius = center - 1;

	context.beginPath();
	context.arc(center, center, radius, 0, Math.PI * 2);
	context.fillStyle = color;
	context.fill();
	context.strokeStyle = "#000";
	context.lineWidth = 2;
	context.stroke();
	drawCrosshair(context, center, adjustedSize, "#000", 2);
	drawCrosshair(context, center, adjustedSize, "#fff", 1);

	canvas.freeDrawingCursor = `url(${cursorCanvas.toDataURL("image/png")}) ${center} ${center}, crosshair`;
	canvas.setCursor(canvas.freeDrawingCursor);
}

function drawCrosshair(
	context: CanvasRenderingContext2D,
	center: number,
	size: number,
	color: string,
	width: number,
) {
	context.lineWidth = width;
	context.strokeStyle = color;
	context.beginPath();
	context.moveTo(center, 0);
	context.lineTo(center, size);
	context.moveTo(0, center);
	context.lineTo(size, center);
	context.stroke();
}

function drawMobileIndicator(
	canvas: any,
	pointer: { x: number; y: number },
	color: string,
	size: number,
	zoom: number,
) {
	const context = canvas.contextTop;
	context.clearRect(0, 0, canvas.width, canvas.height);
	const centerX = pointer.x;
	const centerY = pointer.y - 60 * zoom;
	const radius = size / 2;

	for (const [stroke, width] of [
		["#000", 3],
		["#fff", 1.5],
	] as const) {
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, Math.PI * 2);
		context.strokeStyle = stroke;
		context.lineWidth = width;
		context.stroke();
	}
	context.beginPath();
	context.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
	context.fillStyle = color;
	context.fill();
}
