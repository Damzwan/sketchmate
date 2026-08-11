import { Canvas, Point } from "fabric";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BLACK, WHITE } from "@/draw/config/canvas.config";
import { penBrushMapping } from "@/draw/config/tools.config";
import { usePen } from "@/draw/tools/pen.store";
import { BrushType } from "@/draw/tools/tool.types";
import {
	hexWithOpacity,
	isColorTooLight,
	percentToAlphaHex,
} from "@/draw/utils/color.utils";

const PREVIEW_HEIGHT = 56;
const PREVIEW_FALLBACK_WIDTH = 256;

export function usePenBrushPreview() {
	const {
		brushSize,
		brushColor,
		brushType,
		opacity,
		density,
		dotWidth,
		pixelSize,
	} = storeToRefs(usePen());
	const previewCanvas = ref<HTMLCanvasElement>();
	const previewStage = ref<HTMLElement>();
	let canvas: Canvas | undefined;
	let stageObserver: ResizeObserver | null = null;

	const previewWidth = () =>
		Math.round(previewStage.value?.clientWidth || 0) || PREVIEW_FALLBACK_WIDTH;

	function renderPreview() {
		const width = previewWidth();
		if (!canvas) {
			canvas = new Canvas(previewCanvas.value!, {
				width,
				height: PREVIEW_HEIGHT,
				selection: false,
			});
		} else {
			canvas.clear();
			if (canvas.width !== width) {
				canvas.setDimensions({ width, height: PREVIEW_HEIGHT });
			}
		}

		const color = hexWithOpacity(
			brushColor.value,
			percentToAlphaHex(opacity.value),
		);
		canvas.backgroundColor = isColorTooLight(color) ? BLACK : WHITE;
		canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas);
		const brush = canvas.freeDrawingBrush as any;
		brush.color = color;
		if (brushType.value === BrushType.Spray) {
			brush.density = density.value;
			brush.dotWidth = dotWidth.value;
		}
		if (brushType.value === BrushType.Pixel) brush.pixelSize = pixelSize.value;
		brush.width = brushSize.value;

		const amplitude = 20;
		const frequency = 0.05;
		const yOffset = canvas.height! / 2;
		const wave = (x: number) => yOffset + amplitude * Math.sin(frequency * x);
		const points = [[0, yOffset]];
		for (let x = 1; x <= width; x += 10) points.push([x, wave(x)]);
		if (points.at(-1)?.[0] !== width) points.push([width, wave(width)]);
		const fabricPoints = points.map(([x, y]) => new Point(x, y));

		brush.onMouseDown(fabricPoints[0], { e: new MouseEvent("mousedown") });
		for (const point of fabricPoints.slice(1)) {
			brush.onMouseMove(point, { e: new MouseEvent("mousemove") });
		}
		brush.onMouseUp({ e: new MouseEvent("mouseup") });
		canvas.getObjects().forEach((object) => object.set("selectable", false));
		canvas.renderAll();
	}

	onMounted(() => {
		renderPreview();
		if (typeof ResizeObserver === "undefined" || !previewStage.value) return;
		stageObserver = new ResizeObserver(() => {
			if (!previewStage.value?.clientWidth) return;
			if (canvas && canvas.width === previewWidth()) return;
			renderPreview();
		});
		stageObserver.observe(previewStage.value);
	});

	onBeforeUnmount(() => {
		stageObserver?.disconnect();
		void canvas?.dispose();
		canvas = undefined;
	});

	for (const source of [
		brushSize,
		opacity,
		brushColor,
		density,
		dotWidth,
		pixelSize,
	] as const) {
		watch(source, renderPreview);
	}

	return {
		previewCanvas,
		previewStage,
		renderPreview,
	};
}
