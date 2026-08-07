import type { HistoryAction, HistoryEvent } from "@/draw/history/history.types";
import type { HistoryContext } from "@/draw/history/historyActions";
import { EventBus } from "@/main";

export async function redoPolygonCreation(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.PolygonCreation>,
): Promise<HistoryAction<HistoryEvent.PolygonCreation>> {
	const { canvas, getObjectById } = ctx;

	// Find the object currently being created on the canvas
	const shape: any = canvas.getObjects().find((obj: any) => !!obj.isCreating);
	if (!shape) return action;

	const currObj: any = getObjectById(shape.id);
	if (!currObj || !currObj.points) return action;

	// Restore the point from history
	const points = [...currObj.points];
	const lastPoint = action.params.lastPoint;
	points.push(lastPoint);

	currObj.set({ points });
	currObj.dirty = true;

	// Notify UI that the polygon points have changed
	EventBus.emit("rerenderPolygon");

	return action;
}

export async function undoPolygonCreation(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.PolygonCreation>,
): Promise<HistoryAction<HistoryEvent.PolygonCreation>> {
	const { canvas, getObjectById } = ctx;

	const shape: any = canvas.getObjects().find((obj: any) => !!obj.isCreating);
	if (!shape) return action;

	const currObj: any = getObjectById(shape.id);
	if (!currObj || !currObj.points || currObj.points.length === 0) return action;

	// Remove the last point and save it into the action for redo
	const points = [...currObj.points];
	const lastPoint = points.pop();

	currObj.set({ points });
	currObj.dirty = true;

	// Store the popped point so Redo knows what to put back
	action.params.lastPoint = lastPoint;

	EventBus.emit("rerenderPolygon");

	return action;
}
