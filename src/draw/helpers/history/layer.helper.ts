import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { drawActionMapping } from '@/draw/config/action.config'
import { DrawAction } from '@/draw/types/draw.types'
import { FabricObject } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'


function patchObjectsRegion(objects: (FabricObject | undefined)[]): void {
  const mgr = useDrawObjectManager()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const obj of objects) {
    if (!obj) continue
    // @ts-ignore
    const b = obj.getBoundingRect(true, true)
    if (!b || !isFinite(b.left)) continue
    minX = Math.min(minX, b.left)
    minY = Math.min(minY, b.top)
    maxX = Math.max(maxX, b.left + b.width)
    maxY = Math.max(maxY, b.top + b.height)
  }
  if (minX === Infinity) return
  const PAD = 8
  mgr.patchRectSync({ x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 })
}

// --- Internal Helper ---
function moveObjectsToOriginalPosition(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront | HistoryEvent.MoveObjectToBack>
) {
  const { canvas, getObjectsById } = ctx
  const prevObjectPositions = action.params.prevObjectPositions
  const canvasObjects = getObjectsById(action.params.objectIds)

  for (let i = 0; i < canvasObjects.length; i++) {
    const obj = canvasObjects[i]
    if (obj) {
      canvas.moveObjectTo(obj, prevObjectPositions[i])
    }
  }

  const mgr = useDrawObjectManager()
  mgr.markZIndexDirty()
  patchObjectsRegion(canvasObjects)
}

// --- Redo Helpers ---

export async function redoMoveObjectsToFront(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront>
): Promise<HistoryAction<HistoryEvent.MoveObjectToFront>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  const prevObjectPositions = objects.map((o) => ctx.canvas.getObjects().indexOf(o!))

  drawActionMapping[DrawAction.MoveObjectToFront]({ objects })
  patchObjectsRegion(objects)

  return { ...action, params: { ...action.params, prevObjectPositions } }
}

export async function redoMoveObjectsToBack(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToBack>
): Promise<HistoryAction<HistoryEvent.MoveObjectToBack>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  const prevObjectPositions = objects.map((o) => ctx.canvas.getObjects().indexOf(o!))

  drawActionMapping[DrawAction.MoveObjectToBack]({ objects })
  patchObjectsRegion(objects)

  return { ...action, params: { ...action.params, prevObjectPositions } }
}

export async function redoMoveObjectsUpOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectUpOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects })
  patchObjectsRegion(objects)
  return action
}

export async function redoMoveObjectsDownOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectDownOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects })
  patchObjectsRegion(objects)
  return action
}

// --- Undo Helpers ---

export async function undoMoveObjectsToFront(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront>
): Promise<HistoryAction<HistoryEvent.MoveObjectToFront>> {
  moveObjectsToOriginalPosition(ctx, action)
  return action
}

export async function undoMoveObjectsToBack(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToBack>
): Promise<HistoryAction<HistoryEvent.MoveObjectToBack>> {
  moveObjectsToOriginalPosition(ctx, action)
  return action
}

export async function undoMoveObjectsUpOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectUpOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects }) // undo Up by Down
  patchObjectsRegion(objects)
  return action
}

export async function undoMoveObjectsDownOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectDownOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects }) // undo Down by Up
  patchObjectsRegion(objects)
  return action
}