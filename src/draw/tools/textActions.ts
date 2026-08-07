import { type Canvas, IText, type Point } from "fabric";
import { storeToRefs } from "pinia";
import type {
	DrawAction,
	DrawActionParams,
} from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { BLACK } from "@/draw/config/canvas.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { useSelect } from "@/draw/tools/select.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

export function addText() {
	const { getCanvas } = useDrawStore();
	const { prevDrawingMode } = storeToRefs(useDrawStore());
	const { activateExclusiveEvents, deActivateExclusiveEvents } =
		useDrawEventManager();
	const { addTextMode } = storeToRefs(useDrawUIStore());

	const c = getCanvas();
	if (!c) return;

	addTextMode.value = true;
	prevDrawingMode.value = c.isDrawingMode;
	c.isDrawingMode = false;

	activateExclusiveEvents([
		{
			on: "mouse:down",
			handler: (options: any) => {
				addTextMode.value = false;
				deActivateExclusiveEvents();
				const pointer = c.getScenePoint(options.e);
				void addTextHelper(c, pointer as Point);
			},
		},
	]);
}

async function addTextHelper(c: Canvas, location: Point) {
	const { selectTool, selectedTool } = useToolSelection();

	const text = new IText("", {
		left: location.x,
		top: location.y,
		fontFamily: "Arial",
		lineHeight: 0.9,
		originX: "center",
		originY: "center",
		fill: BLACK,
		editable: false,
		init: true,
	});

	if (selectedTool !== DrawTool.Select) selectTool(DrawTool.Select);
	c.setActiveObject(text);

	useMenuStore().openMenu(Menu.TextEditMenu);
}

/**
 * Apply a layout-affecting text style and re-measure BEFORE anyone reads the
 * object's bounds.
 *
 * Fabric re-runs `initDimensions()` from `_set` for these properties, but the
 * renderer's invalidation is only as correct as `width`/`height` are at the
 * moment `textStyleChanged` is handled: the handler unions the object's OLD
 * cached footprint with its new one, and a stale measurement there leaves the
 * vacated pixels baked into the tiles — the leftover ghost of the previous font.
 * Measuring explicitly makes that independent of fabric's internals.
 */
function applyTextStyle(
	textObj: IText,
	prevStyle: Record<string, unknown>,
	newStyle: Record<string, unknown>,
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	textObj.set(newStyle as any);
	textObj.initDimensions?.();
	textObj.setCoords();
	c.fire("textStyleChanged", { target: [textObj], prevStyle, style: newStyle });
}

export async function changeFont(
	params: DrawActionParams[DrawAction.ChangeFont],
) {
	const font = params.font;
	const { selectedObjectsRef } = useSelect();

	// TODO should no longer be necessary, we preload now
	const textObj = selectedObjectsRef[0] as IText;
	// const fontFaceObserver = new FontFaceObserver(font)
	// await fontFaceObserver.load()

	applyTextStyle(
		textObj,
		{ fontFamily: textObj.fontFamily },
		{ fontFamily: font },
	);
}

export async function changeFontWeight(
	params: DrawActionParams[DrawAction.ChangeFontWeight],
) {
	const { selectedObjectsRef } = useSelect();
	const weight = params.weight;

	const textObj = selectedObjectsRef[0] as IText;

	applyTextStyle(
		textObj,
		{ fontWeight: textObj.fontWeight },
		{ fontWeight: weight },
	);
}

export async function changeTextAlign(
	params: DrawActionParams[DrawAction.ChangeTextAlign],
) {
	const { selectedObjectsRef } = useSelect();
	const align = params.align;

	const textObj = selectedObjectsRef[0] as IText;

	applyTextStyle(
		textObj,
		{ textAlign: textObj.textAlign },
		{ textAlign: align },
	);
}

export async function changeFontStyle(
	params: DrawActionParams[DrawAction.ChangeFontStyle],
) {
	const { selectedObjectsRef } = useSelect();
	const fontStyle = params.fontStyle;

	const textObj = selectedObjectsRef[0] as IText;

	applyTextStyle(
		textObj,
		{ fontStyle: textObj.fontStyle },
		{ fontStyle: fontStyle },
	);
}

export function exitTextAddingMode() {
	const { getCanvas, prevDrawingMode } = useDrawStore();
	const { deActivateExclusiveEvents } = useDrawEventManager();
	const { addTextMode } = storeToRefs(useDrawUIStore());

	const c = getCanvas();

	c.isDrawingMode = prevDrawingMode;
	addTextMode.value = false;

	deActivateExclusiveEvents();
}
