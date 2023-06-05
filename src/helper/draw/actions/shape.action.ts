import { Canvas, IPoint } from 'fabric/fabric-impl'
import { DrawEvent, Shape, ShapeCreationMode } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'
import { fabric } from 'fabric'
import { useEventManager } from '@/service/draw/eventManager.service'

export function addShape(c: Canvas, options: any) {
  const shape = options['shape'] as Shape
  c.isDrawingMode = false
  c.selection = false
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
  const { disableHistorySaving } = useHistory()
  const { subscribe } = useEventManager()
  const points: IPoint[] = []
  let createdShape: any
  disableHistorySaving()

  subscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:down',
    handler: (o: any) => {
      const pointer = c.getPointer(o.e)
      switch (shape) {
        case Shape.Circle:
        case Shape.Polyline:
          points.push({ x: pointer.x, y: pointer.y })
          if (createdShape) {
            c.remove(createdShape)
            createdShape = new fabric.Polyline(points, { fill: '', stroke: 'black', strokeWidth: 2 })
            c.add(createdShape)
          } else {
            createdShape = new fabric.Polyline(points, { fill: '', stroke: 'black', strokeWidth: 2 })
          }
          break
        case Shape.Polygon:
          points.push({ x: pointer.x, y: pointer.y })
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
    }
  })
}

function addShapeWithDrag(c: Canvas, shape: Shape) {
  const { disableHistorySaving, enableHistorySaving, saveState } = useHistory()
  const { subscribe } = useEventManager()
  let createdShape: any
  let startX: number
  let startY: number
  let drawingMode = false

  subscribe({
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

  subscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:move',
    handler: o => (drawingMode ? handleMouseMove(c, shape, o, startX, startY, createdShape) : null)
  })

  subscribe({
    type: DrawEvent.ShapeCreation,
    on: 'mouse:up',
    handler: () => {
      saveState()
      enableHistorySaving()
      drawingMode = false
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
  // c.moveTo(createdShape, Layer.obj)
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
  }
}
