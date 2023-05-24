import { Canvas, IPoint, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { isPlatform } from '@ionic/vue'
import { brushMapping, FONTS, WHITE } from '@/config/draw.config'
import { useDrawStore } from '@/store/draw.store'
import { BrushType, DrawTool, Shape } from '@/types/draw.types'
import { v4 as uuidv4 } from 'uuid'
import FontFaceObserver from 'fontfaceobserver'

export function selectMove(c: Canvas) {
  let lastX = -1
  let lastY = -1

  c!.selection = false
  c!.isDrawingMode = false
  let panning = false
  disableObjectSelection(c)

  c!.on('mouse:down', function (e) {
    panning = true
    c!.defaultCursor = 'move'
    lastX = e.e.clientX
    lastY = e.e.clientY
  })

  c!.on('mouse:up', function (e) {
    panning = false
    c!.defaultCursor = 'default'
  })

  if (isPlatform('android') || isPlatform('ios')) {
    c!.on('touch:drag', e => {
      if (panning && e && e.e) {
        const helper = e.e as any
        const touches = helper.touches[0]

        if (lastX && lastY) {
          const deltaX = touches.clientX - lastX
          const deltaY = touches.clientY - lastY
          const delta = new fabric.Point(deltaX * 2, deltaY * 2)
          handlePan(delta, c!)
        }

        lastX = touches.clientX
        lastY = touches.clientY
      }
    })
  } else {
    c!.on('mouse:move', function (e) {
      if (panning && e && e.e) {
        const delta = new fabric.Point(e.e.movementX, e.e.movementY)
        handlePan(delta, c!)
      }
    })
  }

  c!.on('mouse:wheel', function (e) {
    const deltaY = e.e.deltaY

    // Convert deltaY into a zoom factor
    const zoomFactor = Math.exp(-deltaY / 60)
    handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c!)
    e.e.preventDefault()
    e.e.stopPropagation()
  })

  c!.on('touch:gesture', (e: any) => {
    // Get the pinch zoom distance
    const pinchZoom = e.self.scale

    handleZoom(pinchZoom, e.self.x, e.self.y, c!)
  })
}

const handleZoom = (scale: number, centerX: number, centerY: number, c: Canvas) => {
  // Get the current zoom level
  const currentZoom = c.getZoom()

  // Calculate the new zoom level based on the scale
  let newZoom = currentZoom * scale

  // Limit the zoom level to the maximum and minimum values
  newZoom = Math.min(newZoom, 10)
  newZoom = Math.max(newZoom, 1)

  // Get the center point of the gesture
  const gestureCenter = new fabric.Point(centerX, centerY)

  // Zoom the canvas to the new zoom level while maintaining the gesture center point
  c.zoomToPoint(gestureCenter, newZoom)

  checkCanvasBounds(c)
}

const handlePan = (delta: IPoint, c: Canvas) => {
  c.relativePan(delta)
  checkCanvasBounds(c)
}

export const checkCanvasBounds = (c: Canvas) => {
  if (c.viewportTransform![4] >= 0) {
    c.viewportTransform![4] = 0
  } else if (c.viewportTransform![4] < c.getWidth() - c.getWidth() * c.getZoom()) {
    c.viewportTransform![4] = c.getWidth() - c.getWidth() * c.getZoom()
  }

  if (c.viewportTransform![5] >= 0) {
    c.viewportTransform![5] = 0
  } else if (c.viewportTransform![5] < c.getHeight() - c.getHeight() * c.getZoom()) {
    c.viewportTransform![5] = c.getHeight() - c.getHeight() * c.getZoom()
  }
}

const eventsToDisable = ['mouse:down', 'mouse:up', 'mouse:move', 'mouse:wheel', 'touch:gesture', 'touch:drag']

export function resetCanvasMode(c: Canvas) {
  c.isDrawingMode = true

  const { setSelectedObjects } = useDrawStore()
  setSelectedObjects([])

  eventsToDisable.forEach(eventToDisable => c.off(eventToDisable))

  c!.forEachObject(function (object) {
    object.set({
      selectable: false,
      evented: true,
      hoverCursor: 'default',
      hasControls: false,
      hasBorders: false
    })
    object.off('mousedown')
  })
}

export async function selectSelect(c: Canvas) {
  c!.isDrawingMode = false
  c!.selection = true

  const { setSelectedObjects, refresh } = useDrawStore()

  c!.forEachObject(function (object) {
    object.set({
      selectable: true,
      hoverCursor: 'pointer',
      hasControls: true,
      hasBorders: true
    })
  })

  c.on('selection:created', e => setSelectedObjects(e.selected, true))

  c.on('selection:updated', e => setSelectedObjects(e.selected, true))

  c.on('selection:cleared', e => {
    // const { selectedObjectsRef } = useDrawStore()

    // in case we have text and we are editing we just want to exit the editing mode
    // if (selectedObjectsRef.length == 1 && selectedObjectsRef[0].type == 'i-text') {
    //   const text = selectedObjectsRef[0] as IText
    //   console.log(text.isEditing)
    //   if (text.isEditing) {
    //     text.exitEditing()
    //     return
    //   }
    // }
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
    setSelectedObjects([lastCreatedObj])
    c.setActiveObject(lastCreatedObj)
  }
  refresh()
}

export function selectPen(c: Canvas) {
  const { brushType, brushSize, brushColor } = useDrawStore()
  if (brushType == BrushType.Bucket) return
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

function disableObjectSelection(c: Canvas) {
  c!.forEachObject(function (object) {
    object.set({
      selectable: false,
      evented: false,
      hoverCursor: 'default'
    })
  })
}

export function selectBucket(c: Canvas) {
  c!.isDrawingMode = false
  c!.selection = false
  const { refresh, saveState } = useDrawStore()
  c!.forEachObject(function (object) {
    object.set({
      hasControls: false,
      hasBorders: false,
      selectable: false
    })
    object.on('mousedown', () => {
      const { brushColor } = useDrawStore()
      if (object.fill == brushColor) return
      saveState()
      object.set({ fill: brushColor })
      refresh()
    })
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

export function copyObjects(c: Canvas, options: any) {
  const { refresh, setSelectedObjects, saveState } = useDrawStore()
  disableHistorySaving(c)
  const objectsToCopy: fabric.Object[] = options['objects']
  const clonedObjects: fabric.Object[] = []

  const offsetX = 50 // define the offset here
  const offsetY = 50

  objectsToCopy.forEach(objectToCopy => {
    const copiedObject = fabric.util.object.clone(objectToCopy)

    copiedObject.clone(function (cloned: fabric.Object) {
      c.discardActiveObject()
      cloned.set({ left: objectToCopy.left! + offsetX, top: objectToCopy.top! + offsetY })
      cloned.id = uuidv4()
      enableObjectIdSaving(cloned)
      c.add(cloned)
      clonedObjects.push(cloned)
    })
  })

  c.setActiveObject(new fabric.ActiveSelection(clonedObjects, { canvas: c }))
  setSelectedObjects(clonedObjects)

  refresh()
  saveState()
  enableHistorySaving(c)
}

export function resetZoom(c: Canvas) {
  c.setZoom(1)
  checkCanvasBounds(c)
}

export function addShape(c: Canvas, options: any) {
  const shape = options['shape'] as Shape
  const { refresh, selectTool } = useDrawStore()
  let createdShape: any

  switch (shape) {
    case Shape.Circle:
      createdShape = new fabric.Circle({ radius: 30, left: 10, top: 10, fill: undefined, stroke: 'black' })
      break
    case Shape.Ellipse:
      createdShape = new fabric.Ellipse({ rx: 20, ry: 30, left: 10, top: 10, fill: undefined, stroke: 'black' })
      break
    case Shape.Rectangle:
      createdShape = new fabric.Rect({ width: 100, height: 50, left: 10, top: 10, fill: undefined, stroke: 'black' })
      break
    case Shape.Triangle:
      createdShape = new fabric.Triangle({
        width: 50,
        height: 100,
        left: 10,
        top: 10,
        fill: undefined,
        stroke: 'black'
      })
      break
    case Shape.Line:
      createdShape = new fabric.Line([0, 100], { fill: undefined, stroke: 'black' })
      break
    case Shape.Polyline:
      createdShape = new fabric.Polyline(
        [
          { x: 0, y: 10 },
          { x: 100, y: 10 }
        ],
        { fill: undefined, stroke: 'black' }
      )
      break
    case Shape.Polygon:
      createdShape = new fabric.Polygon(
        [
          { x: 0, y: 10 },
          { x: 100, y: 10 }
        ],
        { fill: undefined, stroke: 'black' }
      )
      break
    default:
      // Handle unrecognized shapes
      break
  }
  c.add(createdShape)
  selectTool(DrawTool.Select)
  refresh()
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
