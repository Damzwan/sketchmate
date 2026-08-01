import { Canvas } from "fabric";
import {
	applyRenderDpr,
	configureFabric,
	createCanvasOptions,
} from "@/draw/canvas/fabricSetup";
import {
	overrideFindTarget,
	overrideHandleSelection,
	overrideMouseDown,
	overrideMouseUp,
	overrideTransform,
} from "@/draw/canvas/fabricInteractions";
import {
	getDefaultZoom,
	initViewport,
	resetZoom,
} from "@/draw/canvas/viewport";
import { BACKGROUND, CANVAS_SIZE } from "@/draw/config/canvas.config";
import { ref } from "vue";
import { loadFonts } from "@/draw/tools/textEditing";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";

function createCanvasController() {
	let c: Canvas | null = null;
	const backgroundColor = ref(BACKGROUND);

	function getCanvas(): Canvas {
		return c!;
	}

	function destroyCanvas() {
		if (c) {
			try {
				c.dispose?.(); // fabric >= x may have dispose
				c.destroy();
				c = null;
			} catch (e) {
				// ignore
			}
		}
	}

	function createCanvas(canvasEl: HTMLCanvasElement): Canvas {
		destroyCanvas();

		// BEFORE `new Canvas`: fabric sizes the lower/upper backing stores in the
		// constructor from config.devicePixelRatio, so capping it afterwards (which
		// is where configureFabric runs) would be too late and leave both
		// canvases at full device resolution. See renderQuality.config.ts.
		applyRenderDpr();

		const bbox = canvasEl.getBoundingClientRect();
		c = new Canvas(canvasEl, createCanvasOptions(bbox.width, bbox.height));

		// c.skipOffscreen = false TODO needed for rotations
		configureFabric();
		overrideFindTarget(c);
		overrideTransform(c);
		overrideMouseUp(c);
		overrideMouseDown(c);
		overrideHandleSelection(c);
		initViewport(c);
		loadFonts();

		const z = 2;
		const initX = (c.width - CANVAS_SIZE * z) / 2;
		const initY = (c.height - CANVAS_SIZE * z) / 2;
		c.setViewportTransform([z, 0, 0, z, initX, initY]);

		return c;
	}

	function resetCanvas() {
		if (!c) return;
		const mgr = useDrawObjectManager();
		mgr.clearAllObjects();
		c.discardActiveObject();
		(c as any)._objects.length = 0;

		c.backgroundColor = BACKGROUND;
		backgroundColor.value = BACKGROUND;
		const initX = (c.width - CANVAS_SIZE) / 2;
		const initY = (c.height - CANVAS_SIZE) / 2;
		c.setViewportTransform([1, 0, 0, 1, initX, initY]);
	}

	return {
		getCanvas,
		createCanvas,
		destroyCanvas,
		resetCanvas,
		backgroundColor,
	};
}

/**
 * ONE controller for the whole app.
 *
 * This used to be a plain factory, so every `useCanvasController()` call built a
 * fresh closure with `c = null`. Only the first caller (draw.store) ever held
 * the real canvas; everyone else silently got a controller whose `getCanvas()`
 * returns null — and since it is typed `Canvas` (via `c!`), nothing warned. Any
 * feature that reached for the canvas this way just quietly did nothing.
 */
let canvasController: CanvasController | undefined;

export type CanvasController = ReturnType<typeof createCanvasController>;

export function useCanvasController(): CanvasController {
	return (canvasController ??= createCanvasController());
}
