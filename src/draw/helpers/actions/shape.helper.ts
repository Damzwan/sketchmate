import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { DrawTool } from '@/draw/types/draw.types'
import { EventBus } from '@/main'
import { Point } from 'fabric'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'

import { setSelectionForObjects } from '@/draw/helpers/select.helper'


export function exitClickShapeCreationMode(isNewShape: boolean = true) {
  const { setShapeCreationMode, getCanvas } = useDrawStore()
  const { removeEventsOfService } = useDrawEventManager()
  const { clearStackOfPolygonHistory } = useDrawHistoryManager()
  const { selectTool, selectedTool } = useDrawStore()


  const c = getCanvas()

  removeEventsOfService('shapeCreation')
  clearStackOfPolygonHistory()
  EventBus.emit('reset-shape-creation')
  setShapeCreationMode(undefined)


  setSelectionForObjects(c.getObjects(), true)

  const lastObject = c.getObjects().at(-1)!

  if (isNewShape && lastObject) {
    c.fire('object:added', { target: lastObject })
    selectTool(DrawTool.Select, {skipOpenMenu: true})
    c.setActiveObject(lastObject)
  } else {
    selectTool(selectedTool, {skipOpenMenu: true})
    c.remove(lastObject)
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