import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { DrawTool } from "@/draw/tools/tool.types";
import { EventBus } from "@/main";
import { Point } from "fabric";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { storeToRefs } from "pinia";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { useToolSelection } from "@/draw/tools/toolSelection.store";

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

	const lastObject = c.getObjects().at(-1)!;

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

	c.setActiveObject(c.getObjects().at(-1)!);
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
