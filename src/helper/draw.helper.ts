import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { isPlatform } from '@ionic/vue'
import { brushMapping, WHITE } from '@/config/draw.config'
import { useDrawStore } from '@/store/draw.store'
import { BrushType, DrawTool } from '@/types/draw.types'

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

  c.on('selection:created', e => setSelectedObjects(e.selected))

  c.on('selection:updated', e => setSelectedObjects(e.selected))

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
      img.scaleToWidth(c.getWidth())
      img.scaleToHeight(c.getHeight())
      c.backgroundImage = img
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

const historySavingEvents = ['object:added', 'object:modified', 'object:removed', 'after:transform']

export function enableHistorySaving(c: Canvas) {
  const { saveState } = useDrawStore()

  historySavingEvents.forEach(event => c.on(event, saveState))
  c.on('erasing:end', (e: any) => {
    if (e.targets.length > 0) saveState()
  })
}

export function disableHistorySaving(c: Canvas) {
  historySavingEvents.forEach(event => c.off(event))
  c.off('erasing:end')
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
      c.add(cloned)
      clonedObjects.push(cloned)
    })
  })

  c.renderAll()
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
