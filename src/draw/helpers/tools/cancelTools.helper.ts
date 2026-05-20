import { Canvas } from "fabric";
import { useEraser } from "@/draw/store/tools/eraser.store";
import { DrawTool } from "@/draw/types/draw.types";
import { ERASERS } from "@/draw/config/tools.config";
import { useToolSelection } from "@/draw/store/tools/toolSelection.store";
import { useSelect } from "@/draw/store/tools/select.store";
import * as transform from "@/draw/transform/transformController";

function cancelEraserAction(c: Canvas) {
	const { cancelErase } = useEraser();
	cancelErase();
}

function cancelSelect(c: Canvas) {
	const { unSelect } = useSelect();
	unSelect();
	transform.cancel(c);
}

export function cancelPenAction(c: Canvas) {
	const brush = c.freeDrawingBrush as any;

	if (!brush) return;

	// 1. Wipe the coordinate memory to stop the current path
	brush._points = [];

	// 2. THE CURE: Surgically remove the lingering state that Fabric's _reset() misses
	brush.oldEnd = undefined;
	brush._hasStraightLine = false;

	// 3. Run the brush's native reset for styles and shadows
	if (typeof brush._reset === "function") {
		brush._reset();
	}
	// 4. Force Fabric's canvas to drop the drawing lock.
	// This prevents lingering touchmove events from resurrecting the line
	// before the physical finger lifts.
	(c as any)._isCurrentlyDrawing = false;

	// 5. Scrub the top layer clean of any visual remnants
	if (c.contextTop) {
		c.clearContext(c.contextTop);
	}
}

export function cancelPreviousAction(c: Canvas) {
	const { selectedTool } = useToolSelection();
	if (ERASERS.includes(selectedTool)) cancelEraserAction(c);
	if (selectedTool == DrawTool.Pen) cancelPenAction(c);
	if (selectedTool == DrawTool.Select) {
		cancelSelect(c);
	}
}
