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
  const objects = getObjectsById(action.params.objectIds)
  const { strokeJSON, strokeId } = action.params

  if (actionType === 'redo') {
    // REDO: Leverage the plugin's native logic
    const [enlivenedStroke] = await fabric.util.enlivenObjects<fabric.Path>([strokeJSON])

    await Promise.all(objects.map(async (canvasObj) => {
      if (!canvasObj) return
      await eraseObject(canvasObj, enlivenedStroke)
    }))

  } else {
    // UNDO: Manually pluck the stroke out of the existing mask
    for (let canvasObj of objects) {
      if (!canvasObj || !canvasObj.clipPath) continue

      const currentClipPath = canvasObj.clipPath as any

      if (currentClipPath && currentClipPath._objects) {
        // Filter out Player 1's specific stroke by its ID
        currentClipPath._objects = currentClipPath._objects.filter(
          (obj: any) => obj.id !== strokeId
        )

        // If that was the only stroke in the clipping mask, we can safely remove the shell
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