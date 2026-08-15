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

	state._onMouseDownInDrawingMode = function (e: TPointerEvent) {
		this._isCurrentlyDrawing = true;
		if (this.getActiveObject()) {
			this.discardActiveObject(e);
			this.requestRenderAll();
		}
		const raw = this.getScenePoint(e);
		const pointer = asFabricPoint(
			useInstrumentStore().beginStroke({ x: raw.x, y: raw.y }),
		);
		this.freeDrawingBrush?.onMouseDown(pointer, { e, pointer });
		this._handleEvent(e, "down", { alreadySelected: false });
	};

	state._onMouseMoveInDrawingMode = function (e: TPointerEvent) {
		if (this._isCurrentlyDrawing) {
			const raw = this.getScenePoint(e);
			const pointer = asFabricPoint(
				useInstrumentStore().constrainStroke({ x: raw.x, y: raw.y }),
			);
			this.freeDrawingBrush?.onMouseMove(pointer, { e, pointer });
		}
		this.setCursor(this.freeDrawingCursor);
		this._handleEvent(e, "move");
	};

	state._onMouseUpInDrawingMode = function (e: TPointerEvent) {
		const instruments = useInstrumentStore();
		const raw = this.getScenePoint(e);
		const constrained = instruments.endStroke({ x: raw.x, y: raw.y });
		const pointer = asFabricPoint(constrained ?? raw);
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
