import * as fabric from "fabric";
import { FabricObject, FabricObjectProps, Group } from "fabric";
import { HistoryAction, HistoryEvent } from "@/draw/types/drawHistory.types";
import { HistoryContext } from "@/draw/config/drawHistory.config";
import { drawActionMapping } from "@/draw/config/action.config";
import { DrawAction } from "@/draw/types/draw.types";
import { toObjectsIds } from "@/draw/helpers/object.helper";
import { Rect } from "@/draw/utils/QuadTree";

// --- Utility ---
export function applyObjectModification(
	ctx: HistoryContext,
	obj: FabricObject,
	diff: any,
): void {
	const targetObject = ctx.getObjectById((obj as any).id);
	if (!targetObject) return;

	// @ts-ignore
	const oldRect = targetObject.getBoundingRect(true, true);

	targetObject.set({
		left: (targetObject.left ?? 0) - diff.left,
		top: (targetObject.top ?? 0) - diff.top,
		scaleX: (targetObject.scaleX ?? 1) - diff.scaleX,
		scaleY: (targetObject.scaleY ?? 1) - diff.scaleY,
		angle: (targetObject.angle ?? 0) - diff.angle,
	});

	targetObject.setCoords();
	// ctx.updateQuadTree(targetObject)

	const canvas = targetObject.canvas;
	if (canvas) {
		canvas.fire("render:patchModifiedObject", {
			target: targetObject,
			oldRect: {
				x: oldRect.left,
				y: oldRect.top,
				w: oldRect.width,
				h: oldRect.height,
			},
		} as any);
	}
}

// --- Redo Helpers ---

export async function redoObjectAdded(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectAdded>,
) {
	const objectsToRedo = action.params.objectJSON;
	if (!objectsToRedo) return action;

	const [enlivened] = await fabric.util.enlivenObjects<FabricObject>([
		objectsToRedo,
	]);
	ctx.canvas.add(enlivened);

	return action;
}

export async function redoObjectsAdded(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsAdded>,
) {
	const objectsToRedo = action.params.objectsJSON;
	if (!objectsToRedo?.length) return action;

	const enlivened =
		await fabric.util.enlivenObjects<FabricObject>(objectsToRedo);

	enlivened.forEach((obj) => {
		if (
			(obj as any).insertedIndex !== undefined &&
			(obj as any).insertedIndex !== null
		) {
			ctx.canvas.insertAt((obj as any).insertedIndex, obj);
		} else {
			ctx.canvas.add(obj);
		}
	});

	return action;
}

export async function redoObjectModified(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectModified>,
) {
	action.params.changes.forEach(({ id, backward }) => {
		const obj = ctx.getObjectById(id);
		if (!obj) return;
		applyObjectModification(ctx, obj, backward);
	});

	return action;
}

export async function redoObjectsCopied(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsCopied>,
) {
	const enlivened = await fabric.util.enlivenObjects<FabricObject>(
		action.params.objectsJSON,
	);
	ctx.canvas.add(...enlivened);
	return action;
}

export async function redoObjectsDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsDeleted>,
) {
	const objects = ctx.getObjectsById(
		action.params.objectsJSON.map((item) => item.id),
	);
	ctx.canvas.remove(...objects);
	return action;
}

export async function redoObjectStyle(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectStyleChanged>,
) {
	const { canvas, getObjectsById } = ctx;
	const prevStyles = action.params.prevStyles;
	const canvasObjects = getObjectsById(action.params.objectIds);

	const newPrevStyles = canvasObjects.map((item) => {
		const style: any = {};
		Object.keys(prevStyles[0]).forEach(
			(key) => (style[key] = (item as any)[key]),
		);
		return style;
	});

	canvasObjects.forEach((obj, i) => obj?.set(prevStyles[i]));
	canvas.requestRenderAll();
	return { ...action, params: { ...action.params, prevStyles: newPrevStyles } };
}

// --- Undo Helpers ---

export async function undoObjectAdded(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectAdded>,
) {
	const object = ctx.getObjectById(action.params.objectJSON.id);
	if (object) {
		ctx.canvas.remove(object);
	}
	return action;
}

export async function undoObjectsAdded(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsAdded>,
) {
	// ctx.unSelect() TODO was this necessary?
	action.params.objectsJSON?.forEach((obj) => {
		const canvasObj = ctx.getObjectById(obj.id);
		if (canvasObj) ctx.canvas.remove(canvasObj);
	});

	return action;
}

export async function undoObjectModified(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectModified>,
) {
	action.params.changes.forEach(({ id, forward }) => {
		const obj = ctx.getObjectById(id);
		if (!obj) return;
		applyObjectModification(ctx, obj, forward);
	});

	return action;
}

export async function undoObjectsDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsDeleted>,
) {
	const enlivened = await fabric.util.enlivenObjects<FabricObject>(
		action.params.objectsJSON,
	);
	ctx.canvas.add(...enlivened);
	return action;
}

export async function undoMerge(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.Merge>,
) {
	const objects = ctx.getObjectsById(action.params.objectIds);
	const mergedObject = objects[0] as Group;
	if (!mergedObject) return action;

	const index = ctx.canvas.getObjects().indexOf(mergedObject);
	const newIds: string[] = [];

	ctx.canvas.remove(mergedObject);
	mergedObject.forEachObject((obj, i) => {
		mergedObject.remove(obj);
		ctx.canvas.insertAt(index + i, obj);
		obj.setCoords();
		newIds.push((obj as any).id);
	});

	return {
		...action,
		params: {
			...action.params,
			group: mergedObject.toJSON(),
			objectIds: newIds,
		},
	};
}

export async function redoMerge(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.Merge>,
) {
	const canvasObjects = ctx.getObjectsById(action.params.objectIds);
	const [enlivenedGroup] = await fabric.util.enlivenObjects<Group>([
		action.params.group,
	]);

	const highestIndex = Math.max(
		...canvasObjects.map((obj) => ctx.canvas.getObjects().indexOf(obj)),
	);
	ctx.canvas.insertAt(highestIndex - canvasObjects.length + 1, enlivenedGroup);

	canvasObjects.forEach((obj) => {
		ctx.canvas.remove(obj);
		enlivenedGroup.add(obj);
	});

	ctx.canvas.setActiveObject(enlivenedGroup);

	return {
		...action,
		params: { ...action.params, objectIds: [(enlivenedGroup as any).id] },
	};
}

export async function redoFlipX(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FlipX>,
): Promise<HistoryAction<HistoryEvent.FlipX>> {
	const objects = ctx.getObjectsById(action.params.objectIds);

	// Use the central drawActionMapping to perform the actual canvas flip
	drawActionMapping[DrawAction.FlipX]({ objects });

	return action;
}

export async function redoFlipY(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FlipY>,
): Promise<HistoryAction<HistoryEvent.FlipY>> {
	const objects = ctx.getObjectsById(action.params.objectIds);
	drawActionMapping[DrawAction.FlipY]({ objects });

	return action;
}

export async function undoFlipX(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FlipX>,
): Promise<HistoryAction<HistoryEvent.FlipX>> {
	const objects = ctx.getObjectsById(action.params.objectIds);
	drawActionMapping[DrawAction.FlipX]({ objects });

	return action;
}

export async function undoFlipY(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FlipY>,
): Promise<HistoryAction<HistoryEvent.FlipY>> {
	const objects = ctx.getObjectsById(action.params.objectIds);
	drawActionMapping[DrawAction.FlipY]({ objects });

	return action;
}

// --- Copy & Style Helpers ---

export async function undoObjectsCopied(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsCopied>,
): Promise<HistoryAction<HistoryEvent.ObjectsCopied>> {
	const { canvas, getObjectsById, unSelect } = ctx;

	unSelect(); // TODO necessary?

	const ids = toObjectsIds(action.params.objectsJSON as FabricObject[]);
	const canvasObjects = getObjectsById(ids);

	canvas.remove(...canvasObjects);
	canvas.requestRenderAll();

	return action;
}

export async function undoObjectStyle(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectStyleChanged>,
): Promise<HistoryAction<HistoryEvent.ObjectStyleChanged>> {
	const { canvas, getObjectsById } = ctx;

	const prevStyles = action.params.prevStyles;
	const canvasObjects = getObjectsById(action.params.objectIds);

	// Capture current state to swap into redo
	const nextPrevStyles = canvasObjects.map((item) => {
		const currentStyle: any = {};
		// Use the first style object keys to know what properties to swap
		Object.keys(prevStyles[0]).forEach((key) => {
			currentStyle[key] = (item as any)[key];
		});
		return currentStyle;
	});

	// Apply the historical styles
	canvasObjects.forEach((obj, i) => {
		if (obj) {
			obj.set(prevStyles[i]);
		}
	});

	canvas.requestRenderAll();

	return {
		...action,
		params: { ...action.params, prevStyles: nextPrevStyles },
	};
}

export function getObjectDiff(
	obj: Partial<FabricObjectProps>,
	original: Partial<FabricObjectProps>,
	reverse = false,
): Partial<FabricObjectProps> {
	const diff = {
		left: (obj.left ?? 0) - (original.left ?? 0),
		top: (obj.top ?? 0) - (original.top ?? 0),
		scaleX: (obj.scaleX ?? 1) - (original.scaleX ?? 1),
		scaleY: (obj.scaleY ?? 1) - (original.scaleY ?? 1),
		angle: (obj.angle ?? 0) - (original.angle ?? 0),
	};

	if (reverse) {
		(Object.keys(diff) as (keyof typeof diff)[]).forEach((key) => {
			diff[key] = -diff[key];
		});
	}

	return diff;
}
