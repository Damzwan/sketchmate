import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'

export function handleErasedAction(action: HistoryAction<HistoryEvent.Erasing>, actionType: 'undo' | 'redo'): void {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { getObjectsById } = useDrawObjectManager()
  const { addToRedoStack, addToUndoStack } = useDrawHistoryManager()

  const objects = getObjectsById(action.params.objectIds)


  for (let i = 0; i < objects.length; i++) {
    const canvasObj = objects[i]
    if (!canvasObj) continue

    canvasObj.set({
      clipPath: objects[i].prevClipPath,
      prevClipPath: objects[i].clipPath
    })
  }

  c.requestRenderAll()

  const stackAction = actionType === 'undo' ? addToRedoStack : addToUndoStack
  stackAction(action)
}

export async function redoErased(action: HistoryAction<HistoryEvent.Erasing>): Promise<void> {
  handleErasedAction(action, 'redo')
}

export async function undoErased(action: HistoryAction<HistoryEvent.Erasing>): Promise<void> {
  handleErasedAction(action, 'undo')
}