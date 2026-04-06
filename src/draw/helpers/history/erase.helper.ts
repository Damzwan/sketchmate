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
    // 1. Get objects currently on canvas
    const objects = getObjectsById(objectIds)

    // 2. REDO: Leverage the plugin's native logic to re-apply the mask
    const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([strokeJSON])

    await Promise.all(objects.map(async (canvasObj) => {
      if (!canvasObj) return
      await eraseObject(canvasObj, enlivenedStroke)
    }))

    // 3. Remove the objects that were completely erased by this stroke
    if (deletedObjectsJSON.length > 0) {
      // Extract the IDs of the objects that need to be deleted
      const deletedIds = deletedObjectsJSON.map((obj: any) => obj.id)
      const objectsToRemove = getObjectsById(deletedIds)

      objectsToRemove.forEach((obj) => {
        if (obj) canvas.remove(obj)
      })
    }

  } else {
    // UNDO PHASE
    let restoredObjects: fabric.Object[] = []

    // 1. Enliven and restore fully erased objects back to the canvas
    if (deletedObjectsJSON.length > 0) {
      restoredObjects = await fabric.util.enlivenObjects(deletedObjectsJSON)
      restoredObjects.forEach((obj) => canvas.add(obj))
    }

    // 2. Get the partially erased objects that never left the canvas
    const objectsOnCanvas = getObjectsById(objectIds)

    // 3. Combine them. We need to remove the stroke from both groups
    // because the restored objects were serialized *with* the clip path attached.
    const allAffectedObjects = [...objectsOnCanvas, ...restoredObjects]

    // 4. Manually pluck the stroke out of the existing mask for all objects
    for (let canvasObj of allAffectedObjects) {
      if (!canvasObj || !canvasObj.clipPath) continue

      const currentClipPath = canvasObj.clipPath as any

      if (currentClipPath && currentClipPath._objects) {
        // Filter out Player 1's specific stroke by its ID
        currentClipPath._objects = currentClipPath._objects.filter(
          (obj: any) => obj.id !== strokeId
        )

        // If that was the only stroke in the clipping mask, safely remove the shell
        if (currentClipPath._objects.length === 0) {
          canvasObj.set({ clipPath: undefined })
        }
      }

      canvasObj.dirty = true
    }
  }

  canvas.requestRenderAll()
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