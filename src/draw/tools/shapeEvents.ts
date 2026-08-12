import type { Point } from "fabric";
import { storeToRefs } from "pinia";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { EventBus } from "@/main";

export function exitClickShapeCreationMode(isNewShape: boolean = true) {
	const { getCanvas } = useDrawStore();
	const { shapeCreationMode } = storeToRefs(useDrawUIStore());

	const { removeEventsOfService } = useDrawEventManager();
	const { clearStackOfPolygonHistory } = useDrawHistoryManager();
	const { selectTool, selectedTool } = useToolSelection();

	const c = getCanvas();

	removeEventsOfService("shapeCreation");
	clearStackOfPolygonHistory();
	EventBus.emit("reset-shape-creation");
	shapeCreationMode.value = undefined;

	if (selectedTool === DrawTool.Select) {
		c.selection = true;
		c.skipTargetFind = false;
	}

	// `getObjects()` copies the whole scene; this only wants its last element.
	const stack = (c as any)._objects as any[];
	const lastObject = stack[stack.length - 1];

	if (isNewShape && lastObject) {
		c.fire("object:added", { target: lastObject });
		selectTool(DrawTool.Select, { skipOpenMenu: true });
		c.setActiveObject(lastObject);
	} else {
		selectTool(selectedTool, { skipOpenMenu: true });
		c.remove(lastObject);
		c.discardActiveObject();
	}
}

export function exitDragShapeCreationMode() {
	const { getCanvas } = useDrawStore();
	const { shapeCreationMode } = storeToRefs(useDrawUIStore());
	const { removeEventsOfService } = useDrawEventManager();

	const c = getCanvas();
	removeEventsOfService("shapeCreation");
	shapeCreationMode.value = undefined;

	const { selectTool, selectedTool } = useToolSelection();
	if (selectedTool === DrawTool.Select) {
		c.selection = true;
		c.skipTargetFind = false;
	} else {
		selectTool(DrawTool.Select);
	}

	const objects = (c as any)._objects as any[];
	c.setActiveObject(objects[objects.length - 1]);
}

export function findNearestPoint(
	clickPoint: Point,
	points: Point[],
	clickTolerance = 10,
): Point | undefined {
	for (const point of points) {
		const dx = clickPoint.x - point.x;
		const dy = clickPoint.y - point.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		if (distance <= clickTolerance) return point;
	}
	return undefined;
}
