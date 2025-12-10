import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { fullErase } from '@/draw/actions/erase.action'

export async function redoChangeBackgroundColor(action: HistoryAction<HistoryEvent.BackgroundColorChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const previousColor = c.backgroundColor
  c.backgroundColor = action.params.previousColor
  action.params.previousColor = previousColor as string

  c.requestRenderAll()
  addToUndoStack(action)
}

export async function redoFullErase(action: HistoryAction<HistoryEvent.FullErase>) {
  const { addToUndoStack } = useDrawHistoryManager()
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const prevCanvasJSON = c.toJSON() // we have to do this since events are not registered in undo/redo
  fullErase()
  addToUndoStack({ ...action, params: { prevCanvasJSON } })
}

export async function undoFullErase(action: HistoryAction<HistoryEvent.FullErase>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()

  await c.loadFromJSON(action.params.prevCanvasJSON)
  c.requestRenderAll()
  addToRedoStack(action)
}

export async function undoChangeBackgroundColor(action: HistoryAction<HistoryEvent.BackgroundColorChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const previousColor = c.backgroundColor
  c.backgroundColor = action.params.previousColor
  action.params.previousColor = previousColor as string

  c.requestRenderAll()
  addToRedoStack({ ...action })
}