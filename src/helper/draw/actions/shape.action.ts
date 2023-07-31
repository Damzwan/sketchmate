import { Canvas, IPoint } from 'fabric/fabric-impl'
import { DrawEvent, DrawTool, Shape, ShapeCreationMode } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'
import { fabric } from 'fabric'
import { useEventManager } from '@/service/draw/eventManager.service'
import { findNearestPoint, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { EventBus } from '@/main'

export function addShape(c: Canvas, options: any) {
  const shape = options['shape'] as Shape
  c.isDrawingMode = false
  c.selection = false
  setSelectionForObjects(c.getObjects()!, false)
  c.getObjects().forEach(obj => obj.set({ isCreating: false }))
  const { setShapeCreationMode } = useDrawStore()

  if (shape == Shape.Polyline || shape == Shape.Polygon) {
    addShapeWithClick(c, shape)
    setShapeCreationMode(ShapeCreationMode.Click)
  } else {
    addShapeWithDrag(c, shape)
    setShapeCreationMode(ShapeCreationMode.Drag)
  }
}

function addShapeWithClick(c: Canvas, shape: Shape) {
  const { saveState } = useHistory()
  const { isolatedSubscribe, disableAllEvents } = useEventManager()
  const { setModifiedObjects } = useSelect()

  const clickTolerance = 20
  let points: IPoint[] = []
  let pointCircles: fabric.Circle[] = []
  let createdShape: any
  disableAllEvents()

  EventBus.on('undo', executeOnUndoRedo)
  EventBus.on('redo', executeOnUndoRedo)
  EventBus.on('reset-shape-creation', () => {
    createdShape.isCreating = false
    pointCircles.forEach(circle => c.remove(circle))
  })

  async function executeOnUndoRedo() {
    disableAllEvents()
    const foundCreatedShape = c.getObjects().find((obj: any) => !!obj.isCreating)
    if (foundCreatedShape) {
      createdShape = foundCreatedShape
      points = createdShape.points
    } else points.pop()
    pointCircles = await rerenderVisualCircles(c, createdShape, clickTolerance)
    enableShapeCreationClickEvents()
  }

  function enableShapeCreationClickEvents() {
    isolatedSubscribe({
      type: DrawEvent.ShapeCreation,
      on: 'mouse:down',
      handler: (o: any) => {
        const pointer = c.getPointer(o.e)
        let point: IPoint = { x: pointer.x, y: pointer.y }

        const nearestPoint = findNearestPoint(point, points, clickTolerance)
        if (nearestPoint) point = nearestPoint
        else {
          const pointCircle = createVisualCircle(clickTolerance, point)
          c.add(pointCircle)
          pointCircles.push(pointCircle) // Save the point marker
        }

        switch (shape) {
          case Shape.Polyline:
            points.push(point)
            if (createdShape) {
              c.remove(createdShape)
              createdShape = new fabric.Polyline(points, { fill: '', stroke: 'black', strokeWidth: 2 })
              c.add(createdShape)
            } else {
              createdShape = new fabric.Polyline(points, { fill: '', stroke: 'black', strokeWidth: 2 })
            }
            break
          case Shape.Polygon:
            points.push(point)
            if (createdShape) {
              c.remove(createdShape)
              createdShape = new fabric.Polygon(points, { fill: '', stroke: 'black', strokeWidth: 2 })
              c.add(createdShape)
            } else {
              createdShape = new fabric.Polygon(points, { fill: '', stroke: 'black', strokeWidth: 2 })
            }
            break
          default:
            break
        }
        createdShape.isCreating = true
        setModifiedObjects({ target: createdShape }, false)
        saveState()
      }
    })
  }

  enableShapeCreationClickEvents()
}

function addShapeWithDrag(c: Canvas, shape: Shape) {
  const { disableHistorySaving, enableHistorySaving, saveState } = useHistory()
  const { isolatedSubscribe, unsubscribe } = useEventManager()
  const { setModifiedObjects } = useSelect()
  const { setShapeCreationMode, selectTool } = useDrawStore()

  let createdShape: any
  let startX: number
  let startY: number
  let drawingMode = false

  isolatedSubscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:down',
    handler: o => {
      disableHistorySaving()
      const result = handleMouseDown(c, shape, o, createdShape)
      startX = result.startX
      startY = result.startY
      createdShape = result.createdShape
      drawingMode = true
    }
  })

  isolatedSubscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:move',
    handler: o => (drawingMode ? handleMouseMove(c, shape, o, startX, startY, createdShape) : null)
  })

  isolatedSubscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:up',
    handler: () => {
      const shapeEvents = ['mouse:down', 'mouse:move', 'mouse:up']
      shapeEvents.forEach(e => unsubscribe({ type: DrawEvent.ShapeCreation, on: e }))

      saveState()
      enableHistorySaving()
      drawingMode = false
      setModifiedObjects({ target: createdShape }, false)
      createdShape.setCoords() // important to update the bounding box of the shape
      setShapeCreationMode(undefined)
      selectTool(DrawTool.Select)
      c.renderAll()
    }
  })
}

function handleMouseDown(c: Canvas, shape: Shape, o: any, createdShape: any) {
  const pointer = c.getPointer(o.e)
  const startX = pointer.x
  const startY = pointer.y

  createdShape = createShape(shape, startX, startY)
  c.add(createdShape)
  return { startX, startY, createdShape }
}

function handleMouseMove(c: Canvas, shape: Shape, o: any, startX: number, startY: number, createdShape: any) {
  if (!createdShape) return
  const pointer = c.getPointer(o.e)

  updateShape(createdShape, shape, pointer, startX, startY)
  c.renderAll()
}

function updateShape(createdShape: any, shape: Shape, pointer: any, startX: number, startY: number) {
  switch (shape) {
    case Shape.Circle:
      const radius = Math.sqrt(Math.pow(startX - pointer.x, 2) + Math.pow(startY - pointer.y, 2))
      createdShape.set({
        left: startX - radius,
        top: startY - radius,
        radius: radius
      })
      break
    case Shape.Ellipse:
      // similar logic would apply to an ellipse, if you want it to grow from the center
      const rx = Math.abs(startX - pointer.x) / 2
      const ry = Math.abs(startY - pointer.y) / 2
      createdShape.set({
        left: startX - rx,
        top: startY - ry,
        rx: rx,
        ry: ry
      })
      break
    case Shape.Rectangle:
    case Shape.Triangle:
      const width = Math.abs(startX - pointer.x)
      const height = Math.abs(startY - pointer.y)
      createdShape.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        width: width,
        height: height
      })
      break
    case Shape.Line:
      createdShape.set({ x2: pointer.x, y2: pointer.y })
      break
    case Shape.HEART:
      const scalingSpeed = 200
      const dx = pointer.x - startX
      const dy = pointer.y - startY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const scale = distance / scalingSpeed

      createdShape.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        scaleX: scale,
        scaleY: scale,
        strokeWidth: 4
      })
      break
    default:
      break
  }
}

function createShape(shape: Shape, startX: number, startY: number): any {
  switch (shape) {
    case Shape.Circle:
      return new fabric.Circle({
        left: startX,
        top: startY,
        stroke: 'black',
        strokeWidth: 2,
        fill: '',
        radius: 1
      })
    case Shape.Ellipse:
      return new fabric.Ellipse({
        left: startX,
        top: startY,
        stroke: 'black',
        strokeWidth: 2,
        fill: '',
        rx: 1,
        ry: 1
      })
    case Shape.Rectangle:
      return new fabric.Rect({
        left: startX,
        top: startY,
        stroke: 'black',
        strokeWidth: 2,
        fill: '',
        width: 1,
        height: 1
      })
    case Shape.Triangle:
      return new fabric.Triangle({
        left: startX,
        top: startY,
        stroke: 'black',
        strokeWidth: 2,
        fill: '',
        width: 1,
        height: 1
      })
    case Shape.Line:
      return new fabric.Line([startX, startY, startX, startY], {
        stroke: 'black',
        strokeWidth: 2
      })
    case Shape.HEART:
      const pathString =
        'M 272.70141,238.71731 C 206.46141,238.71731 152.70146,292.4773 152.70146,358.71731 C 152.70146,493.47282 288.63461,528.80461 381.26391,662.02535 C 468.83815,529.62199 609.82641,489.17075 609.82641,358.71731 C 609.82641,292.47731 556.06651,238.7173 489.82641,238.71731 C 441.77851,238.71731 400.42481,267.08774 381.26391,307.90481 C 362.10311,267.08773 320.74941,238.7173 272.70141,238.71731 z'

      const heart = new fabric.Path(pathString)
      heart.scaleToWidth(1)
      heart.scaleToHeight(1)
      heart.set({ left: startX, top: startY, originX: 'center', originY: 'center', stroke: 'black', fill: '' })

      return heart
  }
}

function createVisualCircle(clickTolerance: number, point: IPoint) {
  const circle = new fabric.Circle({
    radius: clickTolerance / 2,
    fill: 'red',
    left: point.x,
    top: point.y,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false
  })
  circle.visual = true
  return circle
}

async function rerenderVisualCircles(c: Canvas, shape: any, clickTolerance: number) {
  const pointCircles: fabric.Circle[] = []

  const points: IPoint[] = shape.points

  points.forEach(point => {
    const visualCircle = createVisualCircle(clickTolerance, point)
    c.add(visualCircle)
    pointCircles.push(visualCircle)
  })
  return pointCircles
}
