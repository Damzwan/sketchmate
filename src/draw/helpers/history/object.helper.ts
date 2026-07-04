import * as fabric from 'fabric'
import { FabricObject, FabricObjectProps, Group } from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { drawActionMapping } from '@/draw/config/action.config'
import { DrawAction } from '@/draw/types/draw.types'
import { toObjectsIds } from '@/draw/helpers/object.helper'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

/** Coalesce N add/remove invalidations into one pass. Single object skips the
 *  batch so it keeps the immediate sync-rebuild path. */
function runBatched(count: number, fn: () => void): void {
	const mgr = useDrawObjectManager();
	if (count > 1) mgr.beginBatch();
	try {
		fn();
	} finally {
		if (count > 1) mgr.endBatch();
	}
}

export function applyObjectModificationsBulk(
	ctx: HistoryContext,
	changes: { id: string; diff: any }[],
): void {
	const mgr = useDrawObjectManager();
	let count = 0;

	// OLD and NEW footprints tracked separately: one union rect of a long move
	// spans mostly-empty space between the two spots and invalidates tiles
	// nothing touched.
	let oMinX = Infinity, oMinY = Infinity, oMaxX = -Infinity, oMaxY = -Infinity;
	let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity;

	changes.forEach(({ id, diff }) => {
		const obj = ctx.getObjectById(id);
		if (!obj) return;
		count++;

		// Signature-cached bounds: getBoundingRect used to run three times per
		// object here (old measure, new measure, quadtree) — now at most once
		// per state via the manager's cache.
		const ob = mgr.getObjectBounds(obj);
		if (isFinite(ob.x)) {
			oMinX = Math.min(oMinX, ob.x);
			oMinY = Math.min(oMinY, ob.y);
			oMaxX = Math.max(oMaxX, ob.x + ob.w);
			oMaxY = Math.max(oMaxY, ob.y + ob.h);
		}

		obj.set({
			left: (obj.left ?? 0) - diff.left,
			top: (obj.top ?? 0) - diff.top,
			scaleX: (obj.scaleX ?? 1) - diff.scaleX,
			scaleY: (obj.scaleY ?? 1) - diff.scaleY,
			angle: (obj.angle ?? 0) - diff.angle,
		});

		obj.setCoords();
		mgr.updateQuadTree(obj); // computes + caches the new bounds once
		const nb = mgr.getObjectBounds(obj); // cache hit
		if (isFinite(nb.x)) {
			nMinX = Math.min(nMinX, nb.x);
			nMinY = Math.min(nMinY, nb.y);
			nMaxX = Math.max(nMaxX, nb.x + nb.w);
			nMaxY = Math.max(nMaxY, nb.y + nb.h);
		}
	});

	if (count === 0) return;

	const PAD = 8;
	const oldRect =
		oMinX !== Infinity
			? { x: oMinX - PAD, y: oMinY - PAD, w: oMaxX - oMinX + PAD * 2, h: oMaxY - oMinY + PAD * 2 }
			: null;
	const newRect =
		nMinX !== Infinity
			? { x: nMinX - PAD, y: nMinY - PAD, w: nMaxX - nMinX + PAD * 2, h: nMaxY - nMinY + PAD * 2 }
			: null;

	// Inside undo()/redo() these are batch-absorbed and coalesce into ONE
	// invalidateRegions pass at endBatch. Overlapping rects (short move)
	// collapse to their union so an unbatched caller doesn't rebuild the
	// shared tiles twice.
	if (oldRect && newRect && rectsOverlap(oldRect, newRect)) {
		mgr.patchRectSync(unionOf(oldRect, newRect));
	} else {
		if (oldRect) mgr.patchRectSync(oldRect);
		if (newRect) mgr.patchRectSync(newRect);
	}
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
	return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function unionOf(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
	const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
	const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
	return { x, y, w: x2 - x, h: y2 - y };
}


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

	runBatched(enlivened.length, () => {
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
	});

	return action;
}

export async function redoObjectModified(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectModified>,
) {
	const changes = action.params.changes.map((c) => ({
		id: c.id,
		diff: c.backward,
	}));

	applyObjectModificationsBulk(ctx, changes);

	return action;
}

export async function redoObjectsCopied(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsCopied>,
) {
	const enlivened = await fabric.util.enlivenObjects<FabricObject>(
		action.params.objectsJSON,
	);
	runBatched(enlivened.length, () => ctx.canvas.add(...enlivened));
	return action;
}

export async function redoObjectsDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsDeleted>,
) {
	const objects = ctx.getObjectsById(
		action.params.objectsJSON.map((item) => item.id),
	);
	runBatched(objects.length, () => ctx.canvas.remove(...objects));
	return action;
}

function patchObjectsAppearance(objects: FabricObject[]): void {
  const mgr = useDrawObjectManager();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    if (!obj) continue;
    mgr.updateQuadTree(obj); // strokeWidth etc. can shift bounds slightly
    // @ts-ignore
    const b = obj.getBoundingRect(true, true);
    if (!b || !isFinite(b.left)) continue;
    minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.left + b.width); maxY = Math.max(maxY, b.top + b.height);
  }
  if (minX === Infinity) return;
  const PAD = 8;
  mgr.patchRectSync({ x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 });
}

export async function redoObjectStyle(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ObjectStyleChanged>,
) {
  const { getObjectsById } = ctx;
  const prevStyles = action.params.prevStyles;
  const canvasObjects = getObjectsById(action.params.objectIds);

  const newPrevStyles = canvasObjects.map((item) => {
    const style: any = {};
    Object.keys(prevStyles[0]).forEach((key) => (style[key] = (item as any)[key]));
    return style;
  });

  canvasObjects.forEach((obj, i) => obj?.set(prevStyles[i]));
  patchObjectsAppearance(canvasObjects);
  return { ...action, params: { ...action.params, prevStyles: newPrevStyles } };
}

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
	const toRemove = (action.params.objectsJSON ?? [])
		.map((obj) => ctx.getObjectById(obj.id))
		.filter(Boolean) as FabricObject[];
	runBatched(toRemove.length, () => ctx.canvas.remove(...toRemove));

	return action;
}

export async function undoObjectModified(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectModified>,
) {
	const changes = action.params.changes.map((c) => ({
		id: c.id,
		diff: c.forward,
	}));

	applyObjectModificationsBulk(ctx, changes);

	return action;
}


export async function undoObjectsDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.ObjectsDeleted>,
) {
	const enlivened = await fabric.util.enlivenObjects<FabricObject>(
		action.params.objectsJSON,
	);
	// Restore at the recorded stack position — a plain add() dropped a
	// mid-stack object back on TOP, changing z-order under stacked drawings.
	// Ascending insert reproduces the recorded indexes exactly (captured
	// against the same full stack). Fallback to add() for legacy actions
	// without insertedIndex.
	const sorted = [...enlivened].sort(
		(a: any, b: any) =>
			((a.insertedIndex ?? Infinity) as number) -
			((b.insertedIndex ?? Infinity) as number),
	);
	runBatched(sorted.length, () => {
		for (const obj of sorted) {
			const idx = (obj as any).insertedIndex;
			if (typeof idx === "number" && idx >= 0 && idx <= ctx.canvas.getObjects().length) {
				ctx.canvas.insertAt(idx, obj);
			} else {
				ctx.canvas.add(obj);
			}
		}
	});
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

	runBatched(canvasObjects.length, () => canvas.remove(...canvasObjects));

	return action;
}

export async function undoObjectStyle(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ObjectStyleChanged>,
): Promise<HistoryAction<HistoryEvent.ObjectStyleChanged>> {
  const { getObjectsById } = ctx;
  const prevStyles = action.params.prevStyles;
  const canvasObjects = getObjectsById(action.params.objectIds);

  const nextPrevStyles = canvasObjects.map((item) => {
    const currentStyle: any = {};
    Object.keys(prevStyles[0]).forEach((key) => (currentStyle[key] = (item as any)[key]));
    return currentStyle;
  });

  canvasObjects.forEach((obj, i) => { if (obj) obj.set(prevStyles[i]); });
  patchObjectsAppearance(canvasObjects);
  return { ...action, params: { ...action.params, prevStyles: nextPrevStyles } };
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
