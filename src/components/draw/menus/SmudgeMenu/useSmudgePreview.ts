import { Canvas, Point, Rect } from "fabric";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSmudge } from "@/draw/tools/smudge.store";
import { SmudgeBrush } from "@/draw/utils/brushes/SmudgeBrush";

const PREVIEW_HEIGHT = 76;
const PREVIEW_FALLBACK_WIDTH = 256;
const PREVIEW_INTERVAL_MS = 1000 / 20;

/**
 * Two fields, one seam, one stroke through the middle of it.
 *
 * The first version of this preview reused the brush stage from the pen menu:
 * five colour bands and a wavy stroke. It taught nothing — the bands read as
 * random noise and a smear inside noise is invisible.
 *
 * A smudge is only legible against something it CHANGED, so the demo has to
 * show the before and the after at the same time. Two flat colours meeting at a
 * hard vertical edge give the "before" for free: the edge stays crisp above and
 * below the stroke, and the band the tool passed through is the "after". Same
 * picture, both states, no labels needed.
 */
const LEFT_FIELD = "#F97316";
const RIGHT_FIELD = "#2563EB";

export function useSmudgePreview() {
	const { size, strength, mode } = storeToRefs(useSmudge());
	const previewCanvas = ref<HTMLCanvasElement>();
	const previewStage = ref<HTMLElement>();
	let canvas: Canvas | undefined;
	let stageObserver: ResizeObserver | null = null;
	let previewFrame: number | null = null;
	let previewTimer: ReturnType<typeof setTimeout> | null = null;
	let lastPreviewAt = 0;

	const previewWidth = () =>
		Math.round(previewStage.value?.clientWidth || 0) || PREVIEW_FALLBACK_WIDTH;

	function renderPreview() {
		if (!previewCanvas.value) return;
		const width = previewWidth();

		if (!canvas) {
			canvas = new Canvas(previewCanvas.value, {
				width,
				height: PREVIEW_HEIGHT,
				selection: false,
				renderOnAddRemove: false,
			});
		} else {
			canvas.clear();
			if (canvas.width !== width) {
				canvas.setDimensions({ width, height: PREVIEW_HEIGHT });
			}
		}

		const seam = width / 2;
		canvas.backgroundColor = "#FAF8F5";
		for (const [left, fill] of [
			[0, LEFT_FIELD],
			[seam, RIGHT_FIELD],
		] as const) {
			canvas.add(
				new Rect({
					left: left as number,
					top: 0,
					width: seam + 1,
					height: PREVIEW_HEIGHT,
					fill: fill as string,
					selectable: false,
					evented: false,
				}),
			);
		}
		// FLUSH before the brush runs: it samples pixels off the canvas element,
		// so anything still sitting unrendered in the object list does not exist
		// as far as it is concerned.
		canvas.renderAll();

		const brush = new SmudgeBrush(canvas);
		// Clamped, not taken raw: a 2px tip is invisible at this size and a 120px
		// one covers the whole stage, and in both cases the preview stops showing
		// the difference between the modes, which is its only job.
		brush.width = Math.max(14, Math.min(size.value, PREVIEW_HEIGHT * 0.55));
		brush.smudgeStrength = strength.value;
		brush.smudgeMode = mode.value;
		canvas.freeDrawingBrush = brush;

		// One straight drag across the seam, left to right, through the middle.
		const y = PREVIEW_HEIGHT / 2;
		const from = seam - width * 0.3;
		const to = seam + width * 0.3;
		brush.onMouseDown(new Point(from, y));
		for (let x = from; x <= to; x += 6) brush.onMouseMove(new Point(x, y));
		brush.onMouseMove(new Point(to, y));
		brush.onMouseUp();

		for (const object of canvas.getObjects()) object.set("selectable", false);
		canvas.renderAll();
		lastPreviewAt = performance.now();
	}

	function schedulePreview() {
		if (previewFrame !== null || previewTimer !== null) return;
		const delay = Math.max(
			0,
			PREVIEW_INTERVAL_MS - (performance.now() - lastPreviewAt),
		);
		previewTimer = setTimeout(() => {
			previewTimer = null;
			previewFrame = requestAnimationFrame(() => {
				previewFrame = null;
				renderPreview();
			});
		}, delay);
	}

	onMounted(() => {
		renderPreview();
		if (typeof ResizeObserver === "undefined" || !previewStage.value) return;
		stageObserver = new ResizeObserver(() => {
			if (!previewStage.value?.clientWidth) return;
			if (canvas && canvas.width === previewWidth()) return;
			schedulePreview();
		});
		stageObserver.observe(previewStage.value);
	});

	onBeforeUnmount(() => {
		if (previewFrame !== null) cancelAnimationFrame(previewFrame);
		previewFrame = null;
		if (previewTimer !== null) clearTimeout(previewTimer);
		previewTimer = null;
		stageObserver?.disconnect();
		void canvas?.dispose();
		canvas = undefined;
	});

	for (const source of [size, strength, mode] as const) {
		watch(source, schedulePreview);
	}

	return { previewCanvas, previewStage, renderPreview };
}
