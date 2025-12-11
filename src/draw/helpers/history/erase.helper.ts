import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import * as fabric from 'fabric'

export async function handleErasedAction(action: HistoryAction<HistoryEvent.Erasing>, actionType: 'undo' | 'redo'): Promise<void> {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { getObjectsById } = useDrawObjectManager()
  const { addToRedoStack, addToUndoStack } = useDrawHistoryManager()

  const objects = getObjectsById(action.params.objectIds)
  const prevClipPaths = action.params.prevClipPaths
  const newPrevClipPaths = objects.map(obj => obj.clipPath?.toJSON())


  for (let i = 0; i < objects.length; i++) {
    const canvasObj = objects[i]
    if (!canvasObj) continue

    let prevClipPath = prevClipPaths[i]
    if (prevClipPath) {
      const [enlived] = await fabric.util.enlivenObjects([prevClipPath])
      prevClipPath = enlived
    }

    canvasObj.set({
      clipPath: prevClipPath
    })
  }

  c.requestRenderAll()

  const stackAction = actionType === 'undo' ? addToRedoStack : addToUndoStack
  stackAction({ ...action, params: { ...action.params, prevClipPaths: newPrevClipPaths } })
}

export async function redoErased(action: HistoryAction<HistoryEvent.Erasing>): Promise<void> {
  handleErasedAction(action, 'redo')
}

export async function undoErased(action: HistoryAction<HistoryEvent.Erasing>): Promise<void> {
  handleErasedAction(action, 'undo')
}