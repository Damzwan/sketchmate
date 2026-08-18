import { popoverController } from "@ionic/vue";
import { storeToRefs } from "pinia";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import type { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { resolveFabricViewportPoint } from "@/draw/canvas/fabricPointer";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { ERASERS, PENMENUTOOLS } from "@/draw/config/tools.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { exitColorPickerMode } from "@/draw/tools/colorActions";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { readCanvasPixel } from "@/draw/utils/canvasPixelRead";

type SelectColor = (color: string) => void | Promise<void>;

/**
 * The picking session that is currently armed, so the overlay's Cancel control
 * (and the hardware back button) can end it without owning any of this state.
 * At most one can exist: `activateExclusiveEvents` is a single slot.
 */
let activeSession: { cancel: () => void } | null = null;

/** Newest un-sampled move, and the frame that will sample it. See scheduleProbe. */
let pendingProbeOptions: any = null;
let probeFrame = 0;

/** Abandon the armed picking session, if any, restoring the previous tool. */
export function cancelColorPicking(): void {
	activeSession?.cancel();
}

export function useCanvasEyedropper(
	selectColor: SelectColor,
	colorPickerAction: MaybeRefOrGetter<DrawAction | undefined>,
) {
	function pickColor() {
		const { getCanvas, selectAction } = useDrawStore();
		const { activateExclusiveEvents } = useDrawEventManager();
		const { selectedTool } = useToolSelection();
		const { colorPickerMode, colorPickerProbe } = storeToRefs(useDrawUIStore());
		const canvas = getCanvas();
		if (!canvas) return;
		const lastSelectedObject = canvas.getActiveObject();
		const previousCursor = canvas.defaultCursor;

		activeSession?.cancel();

		colorPickerMode.value = true;
		colorPickerProbe.value = null;
		canvas.selection = false;
		canvas.skipTargetFind = true;
		if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
			canvas.isDrawingMode = false;
		}
		// A crosshair, plus the overlay banner. The old cursor was a generated
		// data-URL swatch, which said nothing on touch — where there is no cursor
		// at all — so on a phone the mode was completely invisible.
		canvas.defaultCursor = "crosshair";
		canvas.setCursor("crosshair");

		function finish() {
			activeSession = null;
			if (probeFrame) {
				cancelAnimationFrame(probeFrame);
				probeFrame = 0;
			}
			pendingProbeOptions = null;
			colorPickerProbe.value = null;
			canvas.defaultCursor = previousCursor;
			canvas.freeDrawingCursor = "default";
			exitColorPickerMode({ lastSelectedObjectRef: lastSelectedObject });
		}

		activeSession = { cancel: finish };

		/** Sample under the pointer and publish it for the loupe overlay. */
		function probe(options: any): string | null {
			const point = resolveFabricViewportPoint(canvas as any, options);
			if (!point) return null;
			const hex = colorAt(canvas, point.x, point.y);
			colorPickerProbe.value = hex ? { x: point.x, y: point.y, hex } : null;
			return hex;
		}

		/**
		 * Coalesce move sampling to one read per FRAME.
		 *
		 * Every probe is a `getImageData`, i.e. a GPU→CPU readback with a driver
		 * fence on the composited canvas. `mouse:move` fires several times per
		 * frame on a dragging finger, and the loupe can only show the newest
		 * sample anyway — so the extra reads bought nothing and produced a burst of
		 * sync objects per second on exactly the Adreno/Mali stacks that show up in
		 * the `gsl_syncobj_destroy` crashes.
		 */
		function scheduleProbe(options: any): void {
			pendingProbeOptions = options;
			if (probeFrame) return;
			probeFrame = requestAnimationFrame(() => {
				probeFrame = 0;
				const queued = pendingProbeOptions;
				pendingProbeOptions = null;
				// The session may have ended between the schedule and the frame.
				if (queued && activeSession) probe(queued);
			});
		}

		activateExclusiveEvents([
			// down as well as move: on touch there is no hover, so without this the
			// loupe would only ever appear once the finger had already travelled.
			{ on: "mouse:down", handler: (options: any) => void probe(options) },
			{ on: "mouse:move", handler: (options: any) => scheduleProbe(options) },
			{
				on: "mouse:up",
				handler: (options: any) => {
					// The committed pick reads immediately — the frame-coalesced sample
					// may be one move behind, and this is the value the user keeps.
					const hex = probe(options) ?? colorPickerProbe.value?.hex ?? null;
					finish();
					if (!hex) return;
					void selectColor(hex);
					const action = toValue(colorPickerAction);
					if (action) selectAction(action, { color: hex });
				},
			},
		]);

		void popoverController.dismiss();
	}

	return { pickColor };
}

const clamp = (value: number, max: number) =>
	Math.max(0, Math.min(Math.round(value), max));

/**
 * The composited pixel under a VIEWPORT point, as `#RRGGBBAA`.
 *
 * `getRenderDpr()`, never `window.devicePixelRatio`: the backing store is sized
 * from fabric's `config.devicePixelRatio`, which the engine caps at
 * MAX_RENDER_SCALE. On a 3x phone the raw ratio reads 1.5x past the intended
 * pixel — usually straight off the backing store, which answers transparent
 * black. That is what "the picker stopped working" was.
 */
function colorAt(canvas: any, viewportX: number, viewportY: number) {
	const element: HTMLCanvasElement | undefined = canvas.getElement?.();
	const context = canvas.getContext?.();
	if (!element || !context) return null;

	const dpr = getRenderDpr();
	const x = clamp(viewportX * dpr, element.width - 1);
	const y = clamp(viewportY * dpr, element.height - 1);

	let pixel: Uint8ClampedArray | null = readCanvasPixel(element, x, y);
	if (!pixel) {
		try {
			// Scratch unavailable or tainted. The direct read is the same pixel; if
			// the drawing itself is tainted this throws too, and there is nothing to
			// pick and nothing the user can do about it.
			pixel = context.getImageData(x, y, 1, 1).data;
		} catch {
			return null;
		}
	}
	if (!pixel) return null;

	// Nothing painted here — the engine composites the background itself, so a
	// hole means genuinely empty. Answer the background rather than black.
	if (!pixel[3]) {
		const background = canvas.backgroundColor;
		return typeof background === "string" && /^#[\da-f]{6}/i.test(background)
			? `${background.slice(0, 7).toUpperCase()}FF`
			: null;
	}

	return (
		"#" +
		((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
			.toString(16)
			.slice(1)
			.toUpperCase() +
		pixel[3].toString(16).toUpperCase().padStart(2, "0")
	);
}
