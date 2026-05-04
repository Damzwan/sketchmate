import * as fabric from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { eraseObject } from '@/draw/utils/brushes/CustomEraserBrush'

export async function handleErasedAction(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
  actionType: 'undo' | 'redo'
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  const { canvas, getObjectsById } = ctx
  const { strokeJSON, strokeId, objectIds, deletedObjectsJSON = [] } = action.params

  if (actionType === 'redo') {
    const objects = getObjectsById(objectIds)
    const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([strokeJSON])

    await Promise.all(objects.map(async (canvasObj) => {
      if (!canvasObj) return
      await eraseObject(canvasObj, enlivenedStroke)
    }))

    if (deletedObjectsJSON.length > 0) {
      const deletedIds = deletedObjectsJSON.map((obj: any) => obj.id)
      const objectsToRemove = getObjectsById(deletedIds)
      objectsToRemove.forEach((obj) => {
        if (obj) canvas.remove(obj) // This fires object:removed -> scheduleInvalidation
      })
    }

    // @ts-ignore
    canvas.fire('invalidateCanvas', { target: objects })

  } else {
    // UNDO PHASE
    let restoredObjects: fabric.Object[] = []

    if (deletedObjectsJSON.length > 0) {
      restoredObjects = await fabric.util.enlivenObjects(deletedObjectsJSON)
      restoredObjects.forEach((obj) => canvas.add(obj)) // This fires object:added -> scheduleInvalidation
    }

    const objectsOnCanvas = getObjectsById(objectIds)
    const allAffectedObjects = [...objectsOnCanvas, ...restoredObjects]

    for (let canvasObj of allAffectedObjects) {
      if (!canvasObj || !canvasObj.clipPath) continue
      const currentClipPath = canvasObj.clipPath as any

      if (currentClipPath && currentClipPath._objects) {
        currentClipPath._objects = currentClipPath._objects.filter(
          (obj: any) => obj.id !== strokeId
        )
        if (currentClipPath._objects.length === 0) {
          canvasObj.set({ clipPath: undefined })
        }
      }
      canvasObj.dirty = true
    }

    // @ts-ignore
    canvas.fire('invalidateCanvas', { target: allAffectedObjects })
  }

  return action
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