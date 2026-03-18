import * as fabric from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'

export async function handleErasedAction(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.Erasing>,
  actionType: 'undo' | 'redo'
): Promise<HistoryAction<HistoryEvent.Erasing>> {
  const { canvas, getObjectsById } = ctx

  const objects = getObjectsById(action.params.objectIds)
  const prevClipPaths = action.params.prevClipPaths

  // Map current clipPaths to JSON to swap them into the history record
  const newPrevClipPaths = objects.map(obj => obj.clipPath?.toJSON())

  for (let i = 0; i < objects.length; i++) {
    const canvasObj = objects[i]
    if (!canvasObj) continue

    let targetClipPathJSON = prevClipPaths[i]
    let restoredClipPath = null

    if (targetClipPathJSON) {
      // Fabric 7.2.0: enlivenObjects returns a Promise
      const [enlivened] = await fabric.util.enlivenObjects([targetClipPathJSON])
      restoredClipPath = enlivened
    }

    canvasObj.set({
      clipPath: restoredClipPath
    })
  }

  canvas.requestRenderAll()

  // Prepare the next action with the swapped clipPath states
  return {
    ...action,
    params: { ...action.params, prevClipPaths: newPrevClipPaths }
  }
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