import { useDrawStore } from '@/store/draw/draw.store'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawTool } from '@/types/draw.types'
import { EventBus } from '@/main'
import { Point } from 'fabric'
import { useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { setSelectionForObjects } from '@/helper/draw/draw.helper'


export function exitClickShapeCreationMode(isNewShape: boolean = true) {
  const { setShapeCreationMode, getCanvas } = useDrawStore()
  const { removeEventsOfService } = useDrawEventManager()
  const { clearStackOfPolygonHistory } = useDrawHistoryManager()

  const c = getCanvas()

  removeEventsOfService('shapeCreation')
  clearStackOfPolygonHistory()
  EventBus.emit('reset-shape-creation')
  setShapeCreationMode(undefined)

  setSelectionForObjects(c.getObjects(), true)


  const lastObject = c.getObjects().at(-1)!

  if (isNewShape && lastObject) {
    c.fire('object:added', { target: lastObject })
    const { selectTool } = useDrawStore()
    selectTool(DrawTool.Select)
    c.setActiveObject(lastObject)
  } else {
    c.discardActiveObject()
  }
  c.requestRenderAll()
}

export function exitDragShapeCreationMode() {
  const { setShapeCreationMode, getCanvas } = useDrawStore()
  const { removeEventsOfService } = useDrawEventManager()

  const c = getCanvas()
  removeEventsOfService('shapeCreation')
  setShapeCreationMode(undefined)

  const { selectTool, selectedTool } = useDrawStore()
  if (selectedTool !== DrawTool.Select) {
    selectTool(DrawTool.Select)
  }
  setSelectionForObjects(c.getObjects(), true)

  c.setActiveObject(c.getObjects().at(-1)!)
  c.requestRenderAll()
}

export function findNearestPoint(clickPoint: Point, points: Point[], clickTolerance = 10): Point | undefined {
  for (const point of points) {
    const dx = clickPoint.x - point.x
    const dy = clickPoint.y - point.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance <= clickTolerance) return point
  }
  return undefined
}