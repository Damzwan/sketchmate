import * as fabric from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { eraseObject } from '@/draw/utils/brushes/CustomEraserBrush'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { WorldRect } from '@/draw/committedLayer'

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
  objects: (fabric.Object | undefined | null)[]
): WorldRect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const obj of objects) {
    if (!obj) continue
    try {
      const b = (obj as any).getBoundingRect(true, true)
      if (!b || !isFinite(b.left) || !isFinite(b.top)) continue
      minX = Math.min(minX, b.left)
      minY = Math.min(minY, b.top)
      maxX = Math.max(maxX, b.left + b.width)
      maxY = Math.max(maxY, b.top + b.height)
    } catch {
      /* ignore an object we can't measure */
    }
  }
  if (minX === Infinity) return null
  const PAD = 4
  return {
    x: minX - PAD,
    y: minY - PAD,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + PAD * 2
  }
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
function removeStrokeFromClip(canvasObj: fabric.Object, strokeId: string): boolean {
  const clip = canvasObj.clipPath as any
  if (!clip || !clip._objects || !Array.isArray(clip._objects)) return false

  const before = clip._objects.length
  const kept = clip._objects.filter((o: any) => o?.id !== strokeId)

  if (kept.length === before) return false // Stroke not found

  if (kept.length === 0) {
    canvasObj.set({ clipPath: undefined })
  } else {
    // Reassign and cleanly flag the clip group for a vector re-render
    clip._objects = kept
    clip.set?.('dirty', true)
  }

  canvasObj.set('dirty', true)
  return true
}

export async function handleErasedAction(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
  actionType: 'undo' | 'redo'
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  const { canvas, getObjectsById } = ctx
  const { strokeJSON, strokeId, objectIds, deletedObjectsJSON = [] } = action.params
  const mgr = useDrawObjectManager()

  // 1. OPTIMIZATION: Enliven the stroke exactly ONCE.
  // Previously, this was being parsed a second time at the bottom of the function!
  const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([strokeJSON])

  if (actionType === 'redo') {
    const objects = getObjectsById(objectIds)

    // This still clones per object under the hood, but avoiding the
    // redundant JSON parse at the bottom saves massive overhead.
    await Promise.all(
      objects.map(async (canvasObj) => {
        if (!canvasObj) return
        await eraseObject(canvasObj, enlivenedStroke)
      })
    )

    const deletedIds: string[] = deletedObjectsJSON.map((obj: any) => obj.id)
    if (deletedIds.length > 0) {
      getObjectsById(deletedIds).forEach((obj) => {
        if (obj) canvas.remove(obj)
      })
    }

    for (const obj of objects) if (obj) mgr.updateQuadTree(obj)

    const footprint = strokeFootprint(enlivenedStroke)
    const rect = intersectRect(footprint, unionBounds(objects))

    if (rect) {
      // Redo of a plain erase IS the original erase: punch the stroke
      // straight into the tiles + overview (pixel-exact, O(touched tiles),
      // no object re-render) — the same fast path the live stroke commit
      // uses. Only sound when every object under the stroke was a target of
      // the original erase: a collaborator's object drawn since would get
      // holes punched into fresh tiles that never rebake.
      if (canStampRedo(mgr, enlivenedStroke, footprint, objectIds, deletedIds)) {
        mgr.eraseStampCommit(enlivenedStroke, rect)
      } else {
        // Bounded sync repair + overview fallback; the async bake finishes.
        mgr.dropRegionLight(rect, true)
      }
    }

  } else {
    // UNDO
    let restoredObjects: fabric.Object[] = []
    if (deletedObjectsJSON.length > 0) {
      restoredObjects = await fabric.util.enlivenObjects(deletedObjectsJSON)
      // Restore at the recorded stack position — a plain add() dropped a
      // mid-stack object back on TOP, visibly changing z-order under stacked
      // drawings. Ascending insert order reproduces the recorded indexes
      // exactly (they were captured against the same full stack).
      const sorted = [...restoredObjects].sort(
        (a: any, b: any) =>
          ((a.insertedIndex ?? Infinity) as number) -
          ((b.insertedIndex ?? Infinity) as number)
      )
      for (const obj of sorted) {
        const idx = (obj as any).insertedIndex
        if (typeof idx === 'number' && idx >= 0 && idx <= canvas.getObjects().length) {
          canvas.insertAt(idx, obj as fabric.Object)
        } else {
          canvas.add(obj as fabric.Object) // legacy action without index
        }
      }
    }

    const objectsOnCanvas = getObjectsById(objectIds)
    const allAffected = [...objectsOnCanvas, ...restoredObjects]

    for (const canvasObj of allAffected) {
      if (!canvasObj || !canvasObj.clipPath) continue
      removeStrokeFromClip(canvasObj, strokeId)
    }

    for (const obj of allAffected) if (obj) mgr.updateQuadTree(obj)

    const rect = intersectRect(strokeFootprint(enlivenedStroke), unionBounds(allAffected))

    // Un-erase ADDS pixels back, so tiles must re-render from objects — no
    // stamp possible. dropRegion's "avoid locking the main thread" comment
    // was wrong: it sync-rebuilt up to 32 viewport tiles, which was the undo
    // freeze. Bounded variant rebuilds a handful of viewport tiles sharp and
    // lets the overview + async bake cover the rest.
    if (rect) mgr.dropRegionLight(rect, true)
  }

  return action
}

/**
 * The erase stamp punches the stroke into every fresh tile it covers, so it
 * is only pixel-correct when nothing but the recorded targets (and the
 * objects deleted by this erase) sits under the stroke. Quadtree query is
 * over-inclusive (padded AABBs), so a false here just means we take the
 * rebuild fallback — never a wrong stamp.
 */
function canStampRedo(
  mgr: ReturnType<typeof useDrawObjectManager>,
  stroke: fabric.Object,
  footprint: WorldRect | null,
  targetIds: string[],
  deletedIds: string[]
): boolean {
  if (!footprint) return false
  if ((stroke as any).globalCompositeOperation !== 'destination-out') return false
  const allowed = new Set([...targetIds, ...deletedIds])
  for (const obj of mgr.query(footprint)) {
    const id = (obj as any).id
    if (!id || !allowed.has(id)) return false
  }
  return true
}

export async function redoErased(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  return handleErasedAction(ctx, action, 'redo')
}

export async function undoErased(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  return handleErasedAction(ctx, action, 'undo')
}

function strokeFootprint(stroke: fabric.Object | null | undefined): WorldRect | null {
  if (!stroke) return null
  try {
    const b = (stroke as any).getBoundingRect(true, true)
    if (!isFinite(b.left)) return null
    const PAD = ((stroke as any).strokeWidth ?? 0) * 1.5 + 4
    return { x: b.left - PAD, y: b.top - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2 }
  } catch {
    return null
  }
}

function intersectRect(a: WorldRect | null, b: WorldRect | null): WorldRect | null {
  if (!a) return b
  if (!b) return a
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  return x2 <= x1 || y2 <= y1 ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
