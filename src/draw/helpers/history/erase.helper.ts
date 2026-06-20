import * as fabric from "fabric";
import { HistoryAction, HistoryEvent } from "@/draw/types/drawHistory.types";
import { HistoryContext } from "@/draw/config/drawHistory.config";
import { eraseObject } from "@/draw/utils/brushes/CustomEraserBrush";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { WorldRect } from "@/draw/committedLayer";

// ─── union-bounds helper ──────────────────────────────────────────────────────
//
// The whole perf problem with erase undo/redo was the closing
// `canvas.fire('invalidateCanvas', { target: allAffectedObjects })`. The
// manager handles that by running onObjectChanged PER object — a markDirty +
// overview patch + rebake EACH — and it fires before the clip mutation below
// has finished, so tiles bake with the stale clip and then need redoing. For a
// stroke that hit many objects that is N full invalidations per history step.
//
// An erase only ever changes pixels inside the stroke's footprint, so the
// correct (and cheap) invalidation is a SINGLE rect covering the affected
// objects, applied ONCE after all clip edits are done: one markDirty + one
// localized overview patch + one rebake of just that region.

function unionBounds(
  objects: (fabric.Object | undefined | null)[],
): WorldRect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const obj of objects) {
    if (!obj) continue;
    try {
      const b = (obj as any).getBoundingRect(true, true);
      if (!b || !isFinite(b.left) || !isFinite(b.top)) continue;
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.left + b.width);
      maxY = Math.max(maxY, b.top + b.height);
    } catch {
      /* ignore an object we can't measure */
    }
  }
  if (minX === Infinity) return null;
  const PAD = 4;
  return {
    x: minX - PAD,
    y: minY - PAD,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + PAD * 2,
  };
}

/**
 * Remove a single eraser stroke (by id) from an object's clip group, for UNDO.
 *
 * Returns true if the stroke was found and removed. Returns false if the clip
 * has been FLATTENED — once CustomEraserBrush.bakeClipGroupIfNeeded() collapses
 * an object's accumulated strokes into one cached bitmap, the individual stroke
 * children (and their ids) no longer exist, so an id-based undo cannot target
 * just this stroke. We fail safe (leave the clip untouched) rather than corrupt
 * the mask; the caller logs this so it's visible rather than silent.
 */
function removeStrokeFromClip(
  canvasObj: fabric.Object,
  strokeId: string,
): boolean {
  const clip = canvasObj.clipPath as any;
  if (!clip || !Array.isArray(clip._objects)) return false;

  const before = clip._objects.length;
  const kept = clip._objects.filter((o: any) => o?.id !== strokeId);

  if (kept.length === before) {
    // strokeId not present — either already removed, or baked away.
    return false;
  }

  clip._objects = kept;
  if (kept.length === 0) {
    canvasObj.set({ clipPath: undefined });
  } else {
    clip.set?.("dirty", true);
  }
  canvasObj.set("dirty", true);
  return true;
}

export async function handleErasedAction(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
  actionType: "undo" | "redo",
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  const { canvas, getObjectsById } = ctx;
  const {
    strokeJSON,
    strokeId,
    objectIds,
    deletedObjectsJSON = [],
  } = action.params;
  const mgr = useDrawObjectManager();

  if (actionType === "redo") {
    // ── REDO ─────────────────────────────────────────────────────────────
    const objects = getObjectsById(objectIds);
    const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([
      strokeJSON,
    ]);

    await Promise.all(
      objects.map(async (canvasObj) => {
        if (!canvasObj) return;
        await eraseObject(canvasObj, enlivenedStroke);
      }),
    );

    // Removing deleted objects fires object:removed → the manager invalidates
    // their own footprints, so we don't need to cover them in the rect below.
    if (deletedObjectsJSON.length > 0) {
      const deletedIds = deletedObjectsJSON.map((obj: any) => obj.id);
      const objectsToRemove = getObjectsById(deletedIds);
      objectsToRemove.forEach((obj) => {
        if (obj) canvas.remove(obj);
      });
    }

    // Keep the spatial index consistent (bounds may shift as clips change),
    // then invalidate ONCE over the affected region — not per object.
    for (const obj of objects) if (obj) mgr.updateQuadTree(obj);
    const rect = unionBounds(objects);
    if (rect) mgr.scheduleRectPatch(rect);
  } else {
    // ── UNDO ─────────────────────────────────────────────────────────────
    let restoredObjects: fabric.Object[] = [];
    if (deletedObjectsJSON.length > 0) {
      restoredObjects = await fabric.util.enlivenObjects(deletedObjectsJSON);
      // object:added re-indexes these; we still rect-patch below so they
      // rebake with the correct (stroke-removed) clip in one pass.
      restoredObjects.forEach((obj) => canvas.add(obj as fabric.Object));
    }

    const objectsOnCanvas = getObjectsById(objectIds);
    const allAffected = [...objectsOnCanvas, ...restoredObjects];

    let bakedAwayCount = 0;
    for (const canvasObj of allAffected) {
      if (!canvasObj || !canvasObj.clipPath) continue;
      const removed = removeStrokeFromClip(canvasObj, strokeId);
      if (!removed) bakedAwayCount++;
    }
    if (bakedAwayCount > 0) {
      console.warn(
        `[erase-undo] ${bakedAwayCount} object(s) had this stroke baked into a ` +
          `flattened clip; that stroke can't be undone individually. ` +
          `Lower or disable CustomEraserBrush.flattenClipAfter if erase history ` +
          `must stay fully reversible.`,
      );
    }

    // Index consistency + a SINGLE localized invalidation, after all clip
    // edits are applied (so tiles rebake with the final clip, not a stale one).
    for (const obj of allAffected) if (obj) mgr.updateQuadTree(obj);
    const rect = unionBounds(allAffected);
    if (rect) mgr.scheduleRectPatch(rect);
  }

  return action;
}

export async function redoErased(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  return handleErasedAction(ctx, action, "redo");
}

export async function undoErased(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  return handleErasedAction(ctx, action, "undo");
}
