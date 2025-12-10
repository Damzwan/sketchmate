import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { EventBus } from '@/main'

export async function redoPolygonCreation(action: HistoryAction<HistoryEvent.PolygonCreation>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()

  const c = getCanvas()
  const shape: any = c.getObjects().find((obj: any) => !!obj.isCreating)


  const currObj: any = getObjectById(shape.id)
  const points = currObj.points
  const lastPoint = action.params.lastPoint
  points.push(lastPoint)

  currObj.set({ points })
  currObj.dirty = true

  c?.requestRenderAll()
  EventBus.emit('rerenderPolygon')
  addToUndoStack(action)
}

export async function undoPolygonCreation(action: HistoryAction<HistoryEvent.PolygonCreation>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const c = getCanvas()
  const shape: any = c.getObjects().find((obj: any) => !!obj.isCreating)


  const currObj: any = getObjectById(shape.id)
  const points = currObj.points
  const lastPoint = points[points.length - 1]
  points.pop()

  currObj.set({ points })
  currObj.dirty = true
  action.params.lastPoint = lastPoint

  c?.requestRenderAll()
  EventBus.emit('rerenderPolygon')
  addToRedoStack({ ...action })
}