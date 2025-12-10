import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { drawActionMapping } from '@/draw/config/action.config'
import { DrawAction } from '@/draw/types/draw.types'
import type { Canvas } from 'fabric'

export async function redoMoveObjectsToFront(action: HistoryAction<HistoryEvent.MoveObjectToFront>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)

  const prevObjectPositions = objects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectToFront]({ objects: objects })

  addToUndoStack({
    type: HistoryEvent.MoveObjectToFront,
    params: { prevObjectPositions, objectIds: action.params.objectIds }
  })
}

export async function redoMoveObjectsToBack(action: HistoryAction<HistoryEvent.MoveObjectToBack>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)

  const prevObjectPositions = objects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectToBack]({ objects: objects })

  addToUndoStack({
    type: HistoryEvent.MoveObjectToBack,
    params: { prevObjectPositions, objectIds: action.params.objectIds }
  })
}

export async function redoMoveObjectsUpOneLayer(action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)

  const prevObjectPositions = objects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects: objects })

  addToUndoStack({
    type: HistoryEvent.MoveObjectUpOneLayer,
    params: { prevObjectPositions, objectIds: action.params.objectIds }
  })
}

export async function redoMoveObjectsDownOneLayer(action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)

  const prevObjectPositions = objects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects: objects })

  addToUndoStack({
    type: HistoryEvent.MoveObjectDownOneLayer,
    params: { prevObjectPositions, objectIds: action.params.objectIds }
  })
}

export function moveObjectsToOriginalPosition(c: Canvas, action: HistoryAction<HistoryEvent.MoveObjectToFront> |
  HistoryAction<HistoryEvent.MoveObjectToBack>) {
  const { getObjectsById } = useDrawObjectManager()
  const prevObjectPositions = action.params.prevObjectPositions

  const canvasObjects = getObjectsById(action.params.objectIds)

  for (let i = 0; i < canvasObjects.length; i++) {
    const obj = canvasObjects[i]
    c.moveObjectTo(obj!, prevObjectPositions[i])
  }

  c.requestRenderAll()
}

export async function undoMoveObjectsToFront(action: HistoryAction<HistoryEvent.MoveObjectToFront>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  moveObjectsToOriginalPosition(c, action)
  addToRedoStack(action)
}

export async function undoMoveObjectsToBack(action: HistoryAction<HistoryEvent.MoveObjectToBack>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  moveObjectsToOriginalPosition(c, action)
  addToRedoStack(action)
}

export async function undoMoveObjectsUpOneLayer(action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>): Promise<void> {
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()

  const canvasObjects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects: canvasObjects })
  addToRedoStack(action)
}

export async function undoMoveObjectsDownOneLayer(action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>): Promise<void> {
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()

  const canvasObjects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects: canvasObjects })
  addToRedoStack(action)
}