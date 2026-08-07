import type { FabricObject } from "fabric";
import { storeToRefs } from "pinia";
import type {
	DrawAction,
	DrawActionParams,
} from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { ERASERS } from "@/draw/config/tools.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { usePen } from "@/draw/tools/pen.store";
import { useSelect } from "@/draw/tools/select.store";
import { exitEditing, isText } from "@/draw/tools/textEditing";
import { DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";

export async function setCanvasBackground(
	params: DrawActionParams[DrawAction.SetCanvasBackground],
) {
	const { getCanvas } = useDrawStore();
	const { backgroundColor } = storeToRefs(useDrawStore());

	const c = getCanvas();
	const previousColour = c.backgroundColor as string;

	backgroundColor.value = params.color;
	c.backgroundColor = backgroundColor.value;
	c.fire("backgroundColorChanged", {
		previousColor: previousColour,
		color: params.color,
	});
}

type StyleOptions<T extends FabricObject = FabricObject> = {
	style: Partial<T>;
};

function applyStyle<T extends FabricObject = FabricObject>(
	options: StyleOptions<T>,
) {
	const { getCanvas } = useDrawStore();
	const canvas = getCanvas();
	const { selectedObjectsRef } = useSelect();
	const { style } = options;

	if (!selectedObjectsRef.length) return;

	// Save previous styles for event
	const prevStyles: Partial<T>[] = selectedObjectsRef.map((obj) => {
		const saved: Partial<T> = {};
		for (const key in style) {
			// @ts-expect-error
			saved[key as keyof T] = obj[key as keyof T];
		}
		return saved;
	});

	// Exit text edit mode if needed
	if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0]);

	// Apply style to each object
	selectedObjectsRef.forEach((obj) => {
		for (const key in style) {
			obj.set(key, style[key as keyof T]);
		}
	});

	// Fire Fabric event
	canvas.fire("objectStyleChanged", {
		target: selectedObjectsRef,
		prevStyles,
		style: style,
	});
}

export function setStrokeColor(
	params: DrawActionParams[DrawAction.SetObjectStrokeColor],
) {
	const color = params.color;
	applyStyle({ style: { stroke: color } });
}

export function setFillColor(
	params: DrawActionParams[DrawAction.SetObjectFillColor],
) {
	const color = params.color;
	applyStyle({ style: { fill: color } });
}

export function setBackgroundColor(
	params: DrawActionParams[DrawAction.SetObjectBackgroundColor],
) {
	const color = params.color;
	applyStyle({
		style: { backgroundColor: color },
	});
}

export function changeStrokeWidth(
	params: DrawActionParams[DrawAction.ChangeStrokeWidth],
) {
	const strokeWidth = params.strokeWidth;
	applyStyle({ style: { strokeWidth } });
}

export function exitColorPickerMode(
	params: DrawActionParams[DrawAction.ExitColorPickerMode],
) {
	const { colorPickerMode } = storeToRefs(useDrawUIStore());
	const { getCanvas } = useDrawStore();
	const { selectedTool } = useToolSelection();
	const { updatePenCursor } = usePen();
	const { deActivateExclusiveEvents } = useDrawEventManager();
	colorPickerMode.value = false;
	deActivateExclusiveEvents();

	const c = getCanvas();

	if (selectedTool === DrawTool.Pen || ERASERS.includes(selectedTool)) {
		c.isDrawingMode = true;
		if (selectedTool === DrawTool.Pen) {
			updatePenCursor();
		}
	} else if (selectedTool === DrawTool.Select) {
		c.selection = true;
		c.skipTargetFind = false;

		if (params.lastSelectedObjectRef)
			c.setActiveObject(params.lastSelectedObjectRef);
	}
}
