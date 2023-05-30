import { Canvas, IPoint, Object } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { brushMapping, WHITE } from '@/config/draw.config'
import { useDrawStore } from '@/store/draw.store'
import { BrushType, DrawTool, Shape, ShapeCreationMode } from '@/types/draw.types'
import { v4 as uuidv4 } from 'uuid'
import { checkCanvasBounds, enableZoomAndPan } from '@/helper/draw/gesture.helper'
import { enableObjectCreationEvent } from '@/helper/draw/events.helper'
import { floodfill } from '@/helper/draw/floodfill'
import { logoGoogle } from 'ionicons/icons'

const eventsToDisable = [
  'mouse:down',
  'mouse:up',
  'mouse:move',
  'mouse:wheel',
  'touch:gesture',
  'touch:drag',
  'mouse:down:before',
  ''
]

const hammerEventsToDisable = ['pinch', 'pinchend']

export function resetCanvasMode(c: Canvas) {
  c.isDrawingMode = true
  c.selection = false
  c.selectionFullyContained = true

  const { setSelectedObjects, hammer } = useDrawStore()
  setSelectedObjects([])
  disableObjectsSelect(c)
  eventsToDisable.forEach(eventToDisable => c.off(eventToDisable))
  hammerEventsToDisable.forEach(event => hammer!.off(event)) // TODO this should not be done
  enableZoomAndPan(c) // TODO this should not be done
  enableObjectCreationEvent(c)
}

export function disableObjectsSelect(c: Canvas) {
  c!.forEachObject(object => disableObjectSelect(object))
}

export function disableObjectSelect(object: fabric.Object) {
  object.set({
    selectable: false,
    hasControls: false,
    evented: false,
    hasBorders: false
  })
  object.off('mousedown')
}

export async function selectSelect(c: Canvas) {
  c!.isDrawingMode = false
  c!.selection = true

  const { setSelectedObjects } = useDrawStore()

  c!.forEachObject(function (object) {
    object.set({
      perPixelTargetFind: true,
      hasBorders: true,
      selectable: true,
      hasControls: true,
      evented: true
    })
  })

  c.on('selection:created', e => setSelectedObjects(e.selected, true))

  c.on('selection:updated', e => setSelectedObjects(e.selected, true))

  c.on('selection:cleared', e => {
    setSelectedObjects([], true)
  })
  selectLastCreatedObject(c)
}

export function selectLastCreatedObject(c: Canvas) {
  const { setSelectedObjects, refresh } = useDrawStore()
  const lastCreatedObj = c._objects[c._objects.length - 1]
  if (!lastCreatedObj) {
    setSelectedObjects([])
  } else {
    c.setActiveObject(lastCreatedObj)
    // setSelectedObjects([lastCreatedObj])
  }
  refresh()
}

export function selectPen(c: Canvas) {
  const { brushType, brushSize, brushColor } = useDrawStore()
  if (brushType == BrushType.Bucket) {
    selectBucket(c)
    return
  }
  const newBrush = brushMapping[brushType](c)
  c!.freeDrawingBrush = newBrush!
  c.freeDrawingBrush.width = brushSize
  c.freeDrawingBrush.color = brushColor
}

export function selectMobileEraser(c: Canvas) {
  const { eraserSize, setLastSelectedEraser, saveState } = useDrawStore()

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const b = new fabric.EraserBrush(c)
  c!.freeDrawingBrush = b
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  c!.freeDrawingBrush.inverted = false
  c!.freeDrawingBrush.width = eraserSize
  setLastSelectedEraser(DrawTool.MobileEraser)
}

export function selectHealingMobileEraser(c: Canvas) {
  const { healingEraserSize, setLastSelectedEraser } = useDrawStore()

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const b = new fabric.EraserBrush(c)
  c!.freeDrawingBrush = b
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  c!.freeDrawingBrush.inverted = true
  c!.freeDrawingBrush.width = healingEraserSize
  setLastSelectedEraser(DrawTool.HealingEraser)
}

export function fullErase(c: Canvas) {
  const { selectTool, saveState, setBackgroundColor } = useDrawStore()
  disableHistorySaving(c)
  c.clear()
  setBackgroundColor(WHITE)
  c.setBackgroundColor(WHITE, () => {
    console.log('Background cleared')
  })
  selectTool(DrawTool.Pen)
  saveState()
  enableHistorySaving(c)
}

export function addSticker(c: Canvas, options?: any) {
  if (!options) return
  const sticker: string = options['img']
  fabric.Image.fromURL(
    sticker,
    function (img) {
      const maxDimension = 128 // Maximum width or height for scaling
      img.scaleToWidth(maxDimension)
      c!.add(img)
      const { selectTool } = useDrawStore()
      selectTool(DrawTool.Select)
    },
    { crossOrigin: 'anonymous' }
  )
}

export function setBgImage(c: Canvas, options?: any) {
  if (!options) return
  const img: string = options['img']
  fabric.Image.fromURL(
    img,
    function (img) {
      const { saveState, refresh } = useDrawStore()
      saveState()

      // Set the image as the background and scale it to fit the canvas
      c.setBackgroundImage(
        img,
        () => {
          c.renderAll()
        },
        {
          // Options for scaling
          scaleX: c.width! / img.width!,
          scaleY: c.height! / img.height!,
          top: 0,
          left: 0
        }
      )

      refresh()
    },
    { crossOrigin: 'anonymous' }
  )
}

export function disableObjectSelection(c: Canvas) {
  c!.forEachObject(function (object) {
    object.set({
      selectable: false,
      hoverCursor: 'default'
    })
  })
}

export async function selectBucket(c: Canvas) {
  c.isDrawingMode = false
  c.selection = false
  c.on('mouse:down', async o => {
    const pointer: IPoint = c.getPointer(o.e)
    const img = await floodfill(c, pointer)
    if (!img) return
    c.add(img)
    c.renderAll()
    // const collidingObjects = c.getObjects().filter(obj => img.intersectsWithObject(obj))
    // mergeObjects(c, { objects: [img, ...collidingObjects], unselect: true })
    disableObjectSelect(img)
  })
}

const historySavingEvents = ['object:modified', 'object:removed', 'after:transform']

export function enableHistorySaving(c: Canvas) {
  const { saveState } = useDrawStore()

  historySavingEvents.forEach(event => c.on(event, saveState))
  c.on('erasing:end', (e: any) => {
    if (e.targets.length > 0) saveState()
  })

  c.on('object:added', e => {
    const obj = e.target as any
    obj.id = uuidv4()
    enableObjectIdSaving(obj)

    saveState()
  })
}

export function disableHistorySaving(c: Canvas) {
  historySavingEvents.forEach(event => c.off(event))
  c.off('erasing:end')
  c.off('object:added')
}

export async function copyObjects(c: Canvas, options: any) {
  const { refresh, setSelectedObjects, saveState, selectTool } = useDrawStore()
  disableHistorySaving(c)
  const objectsToCopy: fabric.Object[] = options['objects']
  const clonedObjects: fabric.Object[] = []

  const offsetX = 50 // define the offset here
  const offsetY = 50

  const clonePromises = objectsToCopy.map(objectToCopy => {
    return new Promise<void>((resolve, reject) => {
      objectToCopy.clone(function (cloned: fabric.Object) {
        c.discardActiveObject()
        cloned.set({ left: objectToCopy.left! + offsetX, top: objectToCopy.top! + offsetY })
        cloned.id = uuidv4()
        c.add(cloned)
        enableObjectIdSaving(cloned)
        clonedObjects.push(cloned)
        resolve()
      })
    })
  })

  await Promise.all(clonePromises)

  // TODO this is an annoying set of operations :(
  selectTool(DrawTool.Select)
  c!.setActiveObject(new fabric.ActiveSelection([], { canvas: c }))
  c!.setActiveObject(new fabric.ActiveSelection(clonedObjects, { canvas: c }))
  setSelectedObjects(clonedObjects)

  saveState()
  enableHistorySaving(c)
  refresh()
}

export function resetZoom(c: Canvas) {
  c.setZoom(1)
  checkCanvasBounds(c)
}

export function addShape(c: Canvas, options: any) {
  const shape = options['shape'] as Shape
  resetCanvasMode(c)
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

function addShapeWithDrag(c: Canvas, shape: Shape) {
  const { refresh, saveState } = useDrawStore()
  let createdShape: any
  let startX: number
  let startY: number
  let drawingMode = false

  c.on('mouse:down', o => {
    disableHistorySaving(c)
    const result = handleMouseDown(c, shape, o, createdShape)
    startX = result.startX
    startY = result.startY
    createdShape = result.createdShape
    drawingMode = true
  })

  c.on('mouse:move', o => (drawingMode ? handleMouseMove(c, shape, o, startX, startY, createdShape) : null))

  c.on('mouse:up', () => {
    saveState()
    refresh()
    enableHistorySaving(c)
    drawingMode = false
  })
}

function addShapeWithClick(c: Canvas, shape: Shape) {
  const points: IPoint[] = []
  let createdShape: any
  disableHistorySaving(c)

  c.on('mouse:down', o => {
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
  })
  c.renderAll()
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

export function addText(c: Canvas) {
  disableHistorySaving(c)
  const text = new fabric.IText('', {
    left: c.width! / 2,
    top: c.height! / 2,
    fontFamily: 'Arial',
    fill: '#333',
    lineHeight: 1.1,
    originX: 'center',
    originY: 'center'
  })

  c.add(text)
  enableHistorySaving(c)

  text.enterEditing()
  const { selectTool } = useDrawStore()
  selectTool(DrawTool.Select)

  // The timeout will make sure that the text object is fully added to the canvas before trying to edit it
  setTimeout(() => {
    text.hiddenTextarea!.focus() // This line is especially important for mobile
  }, 300)
}

export function findObjectById(canvas: fabric.Canvas, id: string) {
  return canvas.getObjects().find((obj: any) => obj.id === id)
}

export function enableObjectIdSaving(obj: fabric.Object) {
  obj.toObject = (function (toObject) {
    return function (this: any) {
      return fabric.util.object.extend(toObject.call(this), {
        id: this.id
      })
    }
  })(obj.toObject)
}

export function renderIcon(icon: any) {
  return function renderIcon(this: any, ctx: any, left: any, top: any, styleOverride: any, fabricObject: any) {
    const size = this.cornerSize
    ctx.save()
    ctx.translate(left, top)
    ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle))
    ctx.drawImage(icon, -size / 2, -size / 2, size, size)
    ctx.restore()
  }
}

export async function addSavedToCanvas(c: fabric.Canvas, options: any) {
  const { saveState, refresh, setSelectedObjects, selectTool } = useDrawStore()
  const json = options.json

  disableHistorySaving(c!)

  const objects = await new Promise<fabric.Object[]>(resolve => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    fabric.util.enlivenObjects(json.objects, (enlivenedObjects: fabric.Object[]) => {
      resolve(enlivenedObjects)
    })
  })

  // Only load the objects
  objects.forEach((object: fabric.Object) => {
    object.id = uuidv4()
    c!.add(object)
    enableObjectIdSaving(object) // when we transform a canvas to json, save the object id as well
  })

  // TODO this is a lot of code. We need to first unselect everything since selectSelect() selects the last object
  selectTool(DrawTool.Select)
  c!.setActiveObject(new fabric.ActiveSelection([], { canvas: c }))
  c!.setActiveObject(new fabric.ActiveSelection(objects, { canvas: c }))
  setSelectedObjects(objects)

  saveState()
  enableHistorySaving(c!)
  refresh()
}

export function mergeObjects(c: Canvas, options: any) {
  const { saveState, setSelectedObjects } = useDrawStore()
  disableHistorySaving(c)
  const objects: fabric.Object[] = options['objects']
  const shouldUnselectAfterCreation = options['unselect']

  c.discardActiveObject()
  const select = new fabric.ActiveSelection(objects, { canvas: c })
  c.setActiveObject(select)
  const group = select.toGroup()
  if (shouldUnselectAfterCreation) {
    c.discardActiveObject()
    setSelectedObjects([])
  } else {
    // TODO ugly fix. I think it is related to the fact that we do a quick unselect/select which is done through a delay in setSelectedObjects
    setTimeout(() => setSelectedObjects([group]), 100)
  }

  // objects.forEach(obj => c.remove(obj))

  c.requestRenderAll()
  saveState()
  enableHistorySaving(c)
}

export function changeFabricBaseSettings() {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim()
  fabric.Object.prototype.transparentCorners = false
  fabric.Object.prototype.cornerColor = primaryColor
  fabric.Object.prototype.cornerStyle = 'circle'
  fabric.Object.prototype.cornerSize = 16 // Increase the size of the handles
}
