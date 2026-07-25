import * as fabric from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { eraseObject } from '@/draw/utils/brushes/CustomEraserBrush'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { WorldRect } from '@/draw/committedLayer'
import { createYielder } from '@/draw/helpers/yielding.helper'

const IS_MOBILE_ERASE =
  typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)

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
/** True if this object already has this stroke erased into it — either as a live
 *  vector clip child, OR baked into the union image (retained in
 *  __bakedClipStrokes). Redo must treat BOTH as "already applied": re-adding a
 *  stroke that is baked into the image would double it (a second vector child of
 *  the same id), which a later undo removes while the image copy stays → the
 *  erase never comes back. Checking both keeps redo idempotent across spam. */
function clipContainsStroke(canvasObj: fabric.Object, strokeId: string): boolean {
  const clip = canvasObj.clipPath as any
  if (clip?._objects?.some?.((o: any) => o?.id === strokeId)) return true
  const baked = (canvasObj as any).__bakedClipStrokes as any[] | undefined
  return !!baked?.some?.((s: any) => s?.id === strokeId)
}

function removeStrokeFromClip(canvasObj: fabric.Object, strokeId: string): boolean {
  const clip = canvasObj.clipPath as any
  if (!clip || !clip._objects || !Array.isArray(clip._objects)) return false

  const before = clip._objects.length
  const toRemove = clip._objects.filter((o: any) => o?.id === strokeId)

  if (toRemove.length > 0) {
    if (toRemove.length === before) {
      canvasObj.set({ clipPath: undefined })
    } else {
      // Cleanly remove the strokes using Fabric's group method to preserve internal cache state
      clip.remove(...toRemove)
      clip.set?.('dirty', true)
    }
    canvasObj.set('dirty', true)
    return true
  }

  // Not a live vector child. It may have been BAKED into the union image by
  // bakeClipGroupIfNeeded — its vector is retained off-tree in
  // __bakedClipStrokes. UN-FLATTEN: drop the image(s), restore the retained
  // strokes (minus this one) as vector children, so the object is fully vector
  // again — undoable AND sharp (no upscaled mask). Also frees the image base64.
  const baked = (canvasObj as any).__bakedClipStrokes as fabric.Object[] | undefined
  if (baked && baked.some((s: any) => s?.id === strokeId)) {
    try {
      const remaining = baked.filter((s: any) => s?.id !== strokeId)
      const images = clip._objects.filter((o: any) => o?.type === 'image')
      if (images.length) clip.remove(...images)
      if (remaining.length) clip.add(...remaining)
      ;(canvasObj as any).__bakedClipStrokes = []
      ;(canvasObj as any).__hasImageClip = false
      clip.set?.('dirty', true)
      canvasObj.set('dirty', true)
      return true
    } catch {
      // Fail safe: leave the clip untouched rather than corrupt the mask.
      return false
    }
  }

  return false // Stroke not found (neither vector nor baked)
}

export async function handleErasedAction(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
  actionType: 'undo' | 'redo'
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  const { canvas, getObjectsById } = ctx
  const { strokeJSON, strokeId, objectIds, deletedObjectsJSON = [] } = action.params
  const mgr = useDrawObjectManager()

  // The "is it fully erased?" sweep for this stroke runs deferred (idle + a
  // worker analysis), so it can still be in flight here. If it lands after this
  // undo it deletes objects while the erase action has already moved to the
  // REDO stack — `erasing:cleanup_done` then finds no matching undo entry, so
  // those objects are removed with nothing able to restore them: the erase
  // "stays applied" permanently. Kill the pending sweep before touching clips.
  if (strokeId) useEraser().cancelErasedCheck(strokeId)

  // 1. OPTIMIZATION: Enliven the stroke exactly ONCE.
  // Previously, this was being parsed a second time at the bottom of the function!
  const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([strokeJSON])

  // A big erase touches MANY objects, so the per-object clip mutation +
  // updateQuadTree loops below are O(objects) of synchronous main-thread work.
  // Undoing/redoing one right before a pan blocked the thread (ANR territory).
  // Drive the loops through a yielder so input can interleave.
  const yielder = createYielder({ budgetMs: IS_MOBILE_ERASE ? 4 : 8 })

  if (actionType === 'redo') {
    const objects = getObjectsById(objectIds)

    // Sequential + yielding (was Promise.all, which fired every synchronous
    // eraseObject body back-to-back with no yield). Order is irrelevant —
    // destination-out masks commute.
    for (const canvasObj of objects) {
      if (!canvasObj) continue
      // IDEMPOTENCY: never add a stroke the object already has, as a live vector
      // clip child OR baked into its union image (clipContainsStroke checks
      // both). A prior redo may have added it; re-adding double-erases and a
      // later undo removes only one copy → the erase never fully comes back.
      if (!clipContainsStroke(canvasObj, strokeId)) {
        await eraseObject(canvasObj, enlivenedStroke)
      }
      if (yielder.shouldYield()) await yielder.yield()
    }

    const deletedIds: string[] = deletedObjectsJSON.map((obj: any) => obj.id)
    if (deletedIds.length > 0) {
      getObjectsById(deletedIds).forEach((obj) => {
        if (obj) canvas.remove(obj)
      })
    }

    for (const obj of objects) {
      // clipChanged, NOT updateQuadTree: an erase only touched the clip, so sync
      // the mirror at clip granularity instead of re-serializing the whole
      // object — that full re-serialize was the pan-after-undo block.
      if (obj) mgr.clipChanged(obj)
      if (yielder.shouldYield()) await yielder.yield()
    }

    const footprint = strokeFootprint(enlivenedStroke)
    const rect = footprint
      ? (unionBounds(objects) ? unionRect(footprint, unionBounds(objects)) : footprint)
      : unionBounds(objects)

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
        // Off-thread repair: the worker rebakes the region (erased objects are
        // shippable), so only a couple of sync tiles under the cursor — not 8
        // main-thread clip renders — are needed for instant feedback.
        mgr.dropRegionEraseUndo(rect)
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
      if (!removeStrokeFromClip(canvasObj, strokeId)) {
        // Not removable as vector OR baked (id truly gone — e.g. dropped past
        // RETAIN_CAP): this object keeps the erase. Surface it rather than fail
        // silently.
        console.warn(
          '[EraseUndo] stroke', strokeId,
          'not removable from', (canvasObj as any).id,
          '— clip likely flattened past retain cap; erase remains on this object'
        )
      }
      if (yielder.shouldYield()) await yielder.yield()
    }

    for (const obj of allAffected) {
      // Restored (previously fully-erased) objects re-added above go through the
      // normal object:added path; here we only need the clip-granular mirror
      // sync for the survivors whose clip lost a stroke.
      if (obj) mgr.clipChanged(obj)
      if (yielder.shouldYield()) await yielder.yield()
    }

    const footprint = strokeFootprint(enlivenedStroke)
    const uBounds = unionBounds(allAffected)
    const rect = footprint
      ? (uBounds ? unionRect(footprint, uBounds) : footprint)
      : uBounds

    // Un-erase ADDS pixels back, so tiles must re-render from objects — no
    // stamp possible. The worker rebakes the region off-thread (erased objects
    // are shippable now that ClippingGroup is registered there), so only a
    // couple of sync tiles are done on the main thread for instant feedback;
    // the async bake + overview cover the rest. The old 8-tile sync repair,
    // rendering every touched object's clip group, was the erase-undo jank.
    if (rect) mgr.dropRegionEraseUndo(rect)
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

function unionRect(a: WorldRect | null, b: WorldRect | null): WorldRect | null {
  if (!a) return b
  if (!b) return a
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
