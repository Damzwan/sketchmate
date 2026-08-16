import { type Canvas, Point, type TPointerEvent } from "fabric";
import { useInstrumentStore } from "@/draw/tools/instruments/instrument.store";

function asFabricPoint(point: { x: number; y: number }): Point {
	return new Point(point.x, point.y);
}

/**
 * Route Fabric's free-drawing points through the active instrument without
 * changing the selected brush. Fabric still owns stroke lifecycle and events;
 * only the scene-space coordinates handed to the brush are replaced.
 */
export function installInstrumentDrawing(canvas: Canvas): void {
	const state = canvas as any;
	// Resolved ONCE per canvas, not per pointer sample. These handlers replace
	// fabric's own and run on every move of every stroke — the common case by far
	// being no instrument at all — so the hook has to cost nothing when idle.
	const instruments = useInstrumentStore();

	state._onMouseDownInDrawingMode = function (e: TPointerEvent) {
		this._isCurrentlyDrawing = true;
		if (this.getActiveObject()) {
			this.discardActiveObject(e);
			this.requestRenderAll();
		}
		const raw = this.getScenePoint(e);
		const constrained = instruments.beginStroke({ x: raw.x, y: raw.y });
		const pointer = instruments.hasConstraint()
			? asFabricPoint(constrained)
			: raw;
		this.freeDrawingBrush?.onMouseDown(pointer, { e, pointer });
		this._handleEvent(e, "down", { alreadySelected: false });
	};

	state._onMouseMoveInDrawingMode = function (e: TPointerEvent) {
		if (this._isCurrentlyDrawing) {
			const raw = this.getScenePoint(e);
			// Unconstrained strokes hand fabric its own point straight back: no
			// wrapper object, no `new Point`, no work at all.
			const pointer = instruments.hasConstraint()
				? asFabricPoint(instruments.constrainStroke({ x: raw.x, y: raw.y }))
				: raw;
			this.freeDrawingBrush?.onMouseMove(pointer, { e, pointer });
		}
		this.setCursor(this.freeDrawingCursor);
		this._handleEvent(e, "move");
	};

	state._onMouseUpInDrawingMode = function (e: TPointerEvent) {
		const raw = this.getScenePoint(e);
		let pointer: Point = raw;
		if (instruments.hasConstraint()) {
			const constrained = instruments.endStroke({ x: raw.x, y: raw.y });
			if (constrained) pointer = asFabricPoint(constrained);
		} else {
			instruments.endStroke();
		}
		if (this.freeDrawingBrush) {
			this._isCurrentlyDrawing = !!this.freeDrawingBrush.onMouseUp({
				e,
				pointer,
			});
		} else {
			this._isCurrentlyDrawing = false;
		}
		this._handleEvent(e, "up");
	};
}
