import * as fabric from 'fabric'
import { Canvas, type CanvasOptions, FabricObject, Point } from 'fabric'

import { v4 as uuidv4 } from 'uuid'
import { BACKGROUND, CANVAS_SIZE, ERASERS } from '@/config/draw/draw.config'
import { isMobile } from '@/helper/general.helper'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawTool, FabricEvent, ObjectType, ToolService } from '@/types/draw.types'
import { usePen } from '@/store/draw/tools/pen.store'
import { useEraser } from '@/store/draw/tools/eraser.store'
import { usePan } from '@/store/draw/tools/pan.store'
import { useSelect } from '@/store/draw/tools/select.store'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { gestureDetector } from '@/utils/gestureDetector'
import { ref } from 'vue'
import { useBucket } from '@/store/draw/tools/bucket.store'

export function changeFabricSettings() {
  FabricObject.customProperties = ['id', 'erasable', 'prevClipPath', 'oldText'];

  (FabricObject as any).ownDefaults!['erasable'] = true

  const originalAdd = Canvas.prototype.add
  Canvas.prototype.add = function(...objects: any[]) {
    objects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uuidv4() // Assign unique ID
      }
    })
    return originalAdd.call(this, ...objects)
  }

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim()

  fabric.InteractiveFabricObject.ownDefaults = {
    ...fabric.InteractiveFabricObject.ownDefaults,
    transparentCorners: false,
    cornerColor: primaryColor,
    cornerStyle: 'circle',
    cornerSize: 30,
    originX: 'center',
    originY: 'center',
    _controlsVisibility: {
      bl: false,
      br: true,
      mb: false,
      ml: false,
      mr: false,
      mt: false,
      mtr: true,
      tl: false,
      tr: false
    }
  }
}

export function initCanvasOptions(width: number, height: number): Partial<CanvasOptions> {
  return {
    width,
    height,
    isDrawingMode: true,
    backgroundColor: BACKGROUND,
    fireMiddleClick: true,
    selection: false,
    preserveObjectStacking: false,
    renderOnAddRemove: false
  }
}


export function enableGestures(c: Canvas) {
  if (isMobile()) enableMobileGestures(c, c.upperCanvasEl)
  else enablePCGestures(c)
}

export function enablePCGestures(c: Canvas) {
  const { addEventsOfService } = useDrawEventManager()
  const { canResetView } = storeToRefs(useDrawStore())
  let panStartPoint: any = null
  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        const deltaY = e.e.deltaY

        // Convert deltaY into a zoom factor
        const zoomFactor = Math.exp(-deltaY / 50)
        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        canResetView.value = true

        c.requestRenderAll()
        e.e.preventDefault()
        e.e.stopPropagation()
      }
    },
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const event = o.e
        // Check if the middle button is pressed

        if (event.buttons === 4) {
          // If it is, start the panning
          panStartPoint = { x: event.pageX, y: event.pageY }
          event.preventDefault()
          event.stopPropagation()
        }
      }
    },
    {
      on: 'mouse:move',
      handler: (o: any) => {
        if (panStartPoint) {
          // If we are panning, calculate the delta and pan the canvas
          const event = o.e
          const deltaX = event.pageX - panStartPoint.x
          const deltaY = event.pageY - panStartPoint.y
          panStartPoint = { x: event.pageX, y: event.pageY }
          handlePan(new Point(deltaX, deltaY), c)
          canResetView.value = true
          c.requestRenderAll()

        }
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        // If we were panning, stop it
        if (panStartPoint) {
          panStartPoint = null
          o.e.preventDefault()
          o.e.stopPropagation()
        }
      }
    }
  ]
  addEventsOfService('gestures', events)
}

export const checkCanvasBounds = (c: Canvas) => {
  const zoom = c.getZoom()
  const canvasWidth = c.getWidth()
  const canvasHeight = c.getHeight()
  const worldSize = CANVAS_SIZE

  const minX = -(worldSize * zoom - canvasWidth)
  const maxX = 0

  const minY = -(worldSize * zoom - canvasHeight)
  const maxY = 0


  // Clone the VPT to avoid side effects
  const vpt = [...c.viewportTransform!] as fabric.Matrix

  vpt[4] = Math.min(Math.max(vpt[4], minX), maxX)
  vpt[5] = Math.min(Math.max(vpt[5], minY), maxY)

  c.setViewportTransform(vpt)
}


function setCacheForObjects(objects: fabric.Object[], enabled: boolean) {
  objects.forEach(o => {
    if (o.type == ObjectType.group) setCacheForObjects((o as fabric.Group).getObjects(), enabled)
    o.objectCaching = enabled
  })
}

export function enableMobileGestures(c: Canvas, upperCanvasEl: any) {

  const { selectedTool, shapeCreationMode, canResetView } = storeToRefs(useDrawStore())
  const { shouldModifyObjectsWithGestures, unSelect } = useSelect()

  let isRotating = false
  let originalState: any = null
  const isUsingGesture = ref(false)

  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      if (shapeCreationMode.value) return

      c.fire('gestureStart')

      // rotation or scale gesture
      if (selectedTool.value == DrawTool.Select && shouldModifyObjectsWithGestures()) {
        const obj = c.getActiveObject()
        if (!obj) return
        obj.set({ lockMovementX: true, lockMovementY: true }) // we are only focused on rotation and scaling
        originalState = {
          left: obj.left,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle
        }

        isUsingGesture.value = true

        return
      }
      // Zoom and pan
      else {
        c.selection = false
        unSelect()
        setCacheForObjects(c.getObjects(), false)

        cancelPreviousAction(c)
      }
    },
    onZoom: (scale: number, previousScale: number, center: Point) => {
      if (selectedTool.value == DrawTool.Select && isUsingGesture.value) {
        if (isRotating) return
        if (Math.abs(scale - previousScale) < 0.005) return

        const obj = c.getActiveObject() as FabricObject

        obj.set({
          scaleX: obj.scaleX! * (scale / previousScale),
          scaleY: obj.scaleY! * (scale / previousScale)
        })
        obj.setCoords()
        c.requestRenderAll()

      } else {
        if (Math.abs(scale - previousScale) < 0.005) return
        handleZoom(scale, center.x, center.y, c, previousScale)
        canResetView.value = true
        c.requestRenderAll()
      }
    },
    onRotate: (angleDifference: number) => {
      if (!(selectedTool.value == DrawTool.Select && isUsingGesture.value)) return

      const rotationThreshold = 0.8 // Adjust the threshold as needed
      const obj = c.getActiveObject()
      if (!obj) return

      isRotating = Math.abs(angleDifference) > rotationThreshold

      obj.rotate((obj.angle! + angleDifference) % 360)
      obj.setCoords()
      c.requestRenderAll()
    },
    onDrag: (dx: number, dy: number, previousDx: number, previousDy: number) => {
      if (selectedTool.value == DrawTool.Select && isUsingGesture.value) return

      const delta: Point = new Point({ x: 2 * (dx - previousDx), y: 2 * (dy - previousDy) })
      handlePan(delta, c)
      c.requestRenderAll()
    },
    onGestureEnd: (fingers: number) => {
      if (fingers == 1) {
        if (!isUsingGesture.value) {
          setCacheForObjects(c.getObjects(), true)
          if (selectedTool.value === DrawTool.Select) c.selection = true
        }
      }

      if (selectedTool.value == DrawTool.Select && isUsingGesture.value && fingers == 0) {
        const obj = c.getActiveObject()
        if (!obj) return

        // Without timeout the object will move to the last location of your fingers making it tp sometimes
        setTimeout(() => {
          obj.set({ lockMovementX: false, lockMovementY: false })
          isUsingGesture.value = false

          const transform: any = {
            target: obj,
            original: originalState
          }

          // Fire the event with transform + target
          c.fire('object:modified', { target: obj, transform })
          c.requestRenderAll()
        }, 100)
      }
      c.requestRenderAll()
    }
  })
}

function cancelEraserAction(c: Canvas) {
  const { cancelErase } = useEraser()
  cancelErase()
}

function cancelPenAction(c: Canvas) {
  const { actionWithoutEvents } = useDrawEventManager()

  actionWithoutEvents(() => {
    const brush = c.freeDrawingBrush
    if (!brush) return

    const fakeEvent = {
      pointer: new fabric.Point(0, 0),
      e: { isPrimary: true }
    }
    brush._reset()
    brush.onMouseUp(fakeEvent)

    const lastObject = c.getObjects().pop()
    if (lastObject) c.remove(lastObject)

    const originalMove = brush.onMouseMove
    const originalUp = brush.onMouseUp
    brush.onMouseMove = () => {
    }
    brush.onMouseUp = () => {
      brush.onMouseUp = originalUp
      brush.onMouseMove = originalMove
    }

  })

}

function cancelPreviousAction(c: Canvas) {
  const { selectedTool } = useDrawStore()
  if (ERASERS.includes(selectedTool)) cancelEraserAction(c) // needs to happen before touch up
  if (selectedTool == DrawTool.Pen) cancelPenAction(c) // needs to happen after touch up
}


export const handleZoom = (
  scale: number,
  centerX: number,
  centerY: number,
  c: Canvas,
  previousScale?: number
) => {
  const dampeningFactor = 0.2
  let newZoom = previousScale
    ? c.getZoom() * Math.pow(scale / previousScale, 1)
    : (Math.log(scale) / Math.log(2)) * dampeningFactor + c.getZoom()

  // Modify the new zoom level based on the delta scale and zoom rate

  // Limit the zoom level to the maximum and minimum values
  newZoom = Math.min(newZoom, 10)
  newZoom = Math.max(newZoom, isMobile() ? 0.8 : 0.5)

  // Get the center point of the gesture
  const gestureCenter = new Point(centerX, centerY)

  // Zoom the canvas to the new zoom level while maintaining the gesture center point
  c.zoomToPoint(gestureCenter, newZoom)

  checkCanvasBounds(c)
}
export const handlePan = (delta: Point, c: Canvas) => {
  c.viewportTransform
  c.relativePan(delta)
  checkCanvasBounds(c)
}

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
  return {
    [DrawTool.Pen]: usePen(),
    [DrawTool.MobileEraser]: useEraser(),
    [DrawTool.Select]: useSelect(),
    [DrawTool.Pan]: usePan(),
    [DrawTool.Bucket]: useBucket()
  }
}

export function resetZoom() {
  const { getCanvas } = useDrawStore()
  const { canResetView } = storeToRefs(useDrawStore())
  const c = getCanvas()
  c.setZoom(1)
  const initX = (c.width - CANVAS_SIZE) / 2
  const initY = (c.height - CANVAS_SIZE) / 2
  c.setViewportTransform([1, 0, 0, 1, initX, initY])
  canResetView.value = false
  c.fire('zoomReset')
  c.requestRenderAll()
}