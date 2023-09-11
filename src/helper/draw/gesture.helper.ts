import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { fabricateTouchUp } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { DrawEvent, DrawTool, FabricEvent, ObjectType } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { ERASERS } from '@/config/draw/draw.config'
import { isMobile } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import { EventBus } from '@/main'
import { gestureDetector } from '@/utils/gestureDetector'

export function enableZoomAndPan(c: any, upperCanvasEl: any) {
  if (isMobile()) enableMobileGestures(c, upperCanvasEl)
  else enablePCGestures(c)
}

export function enableMobileGestures(c: any, upperCanvasEl: any) {
  const { setCanZoomOut } = useDrawStore()
  const { disableHistorySaving, enableHistorySaving, addPrevModifiedObjectsToStack } = useHistory()

  const { selectedTool, isUsingGesture, shapeCreationMode } = storeToRefs(useDrawStore())

  let isRotating = false

  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      if (shapeCreationMode.value) return
      EventBus.emit('gesture') // used by bucket tool
      disableHistorySaving()

      // rotation or scale gesture
      if (selectedTool.value == DrawTool.Select) {
        const obj = c.getActiveObject()
        obj.set({ lockMovementX: true, lockMovementY: true }) // we are only focused on rotation and scaling
        isUsingGesture.value = true

        return
      } else {
        c.getObjects().forEach((o: any) => (o.objectCaching = false))
        cancelPreviousAction(c)
      }
    },
    onZoom: (scale: number, previousScale: number, center: IPoint) => {
      if (selectedTool.value == DrawTool.Select) {
        if (isRotating) return
        if (Math.abs(scale - previousScale) < 0.005) return

        const scaleDiff = scale - previousScale
        const obj = c.getActiveObject()

        obj._setOriginToCenter()
        obj.scaleX! *= 1 + scaleDiff
        obj.scaleY! *= 1 + scaleDiff
        obj._resetOrigin()
        obj.setCoords()
        EventBus.emit('scaling')
        c.requestRenderAll()
      } else {
        if (Math.abs(scale - previousScale) < 0.005) return
        handleZoom(scale, center.x, center.y, c, previousScale)
        setCanZoomOut(c.getZoom() > 1)
        c.requestRenderAll()
      }
    },
    onRotate: (angleDifference: number, previousAngle: number) => {
      if (!(selectedTool.value == DrawTool.Select && isUsingGesture.value)) return

      const rotationThreshold = 0.45 // Adjust the threshold as needed
      const obj = c.getActiveObject()

      isRotating = Math.abs(angleDifference) > rotationThreshold
      if (!isRotating) return

      EventBus.emit('rotating')
      obj.rotate((obj.angle! + angleDifference) % 360)
      obj.setCoords()
      c.requestRenderAll()
    },
    onDrag: (dx: number, dy: number, previousDx: number, previousDy: number, center: IPoint) => {
      if (selectedTool.value == DrawTool.Select) return

      const delta = {
        x: 2 * (dx - previousDx),
        y: 2 * (dy - previousDy)
      }
      handlePan(delta, c)
      c.requestRenderAll()
    },
    onGestureEnd: (fingers: number) => {
      if (fingers == 1) {
        if (!isUsingGesture.value) c.getObjects().forEach((o: any) => (o.objectCaching = true))
        enableHistorySaving()
      }

      if (selectedTool.value == DrawTool.Select && isUsingGesture.value && fingers == 0) {
        const obj = c.getActiveObject()

        // Without timeout the object will move to the last location of your fingers making it tp sometimes
        setTimeout(() => {
          obj.set({ lockMovementX: false, lockMovementY: false })
          isUsingGesture.value = false

          if (obj.type == ObjectType.selection)
            addPrevModifiedObjectsToStack((obj as fabric.ActiveSelection).getObjects())
          else addPrevModifiedObjectsToStack([obj])
          c.requestRenderAll()
        }, 100)
      }
      c.requestRenderAll()
    }
  })
}
function cancelEraserAction(c: Canvas) {
  c.on('erasing:end', (e: any) => {
    const targets = e.targets as fabric.Object[]
    const path: fabric.Path = e.path

    targets.forEach((target: any) => {
      target.eraser._objects = target.eraser._objects.filter((obj: any) => obj.id !== path.id)
    })

    c.off('erasing:end')
  })
}

function cancelPenAction(c: Canvas) {
  const lastObject = c.getObjects().pop()
  if (lastObject) c.remove(lastObject)
}

function cancelPreviousAction(c: Canvas) {
  const { selectedTool } = useDrawStore()
  const { actionWithoutEvents } = useEventManager()
  setTimeout(() => {
    actionWithoutEvents(() => {
      if (ERASERS.includes(selectedTool)) cancelEraserAction(c) // needs to happen before touch up
      c.discardActiveObject()
      fabricateTouchUp(c)
      if (selectedTool == DrawTool.Pen) cancelPenAction(c) // needs to happen after touch up
      c.renderAll()
    })
  }, 1)
}

export function enablePCGestures(c: any) {
  const { subscribe } = useEventManager()
  const { setCanZoomOut } = useDrawStore()
  let panStartPoint: any = null

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        const deltaY = e.e.deltaY

        // Convert deltaY into a zoom factor
        const zoomFactor = Math.exp(-deltaY / 10)
        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        setCanZoomOut(c.getZoom() > 1)

        c.requestRenderAll()
        e.e.preventDefault()
        e.e.stopPropagation()
      },
      type: DrawEvent.Gesture
    },
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const event = o.e
        // Check if the middle button is pressed
        if (event.button === 1) {
          // If it is, start the panning
          panStartPoint = { x: event.pageX, y: event.pageY }
          event.preventDefault()
          event.stopPropagation()
        }
      },
      type: DrawEvent.Gesture
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
          handlePan(new fabric.Point(deltaX, deltaY), c)
          c.requestRenderAll()
        }
      },
      type: DrawEvent.Gesture
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
      },
      type: DrawEvent.Gesture
    }
  ]

  events.forEach(e => subscribe(e))
}

export const checkCanvasBounds = (c: Canvas) => {
  const vpt = c.viewportTransform!
  if (vpt[4] >= 0) {
    vpt[4] = 0
  } else if (vpt[4] < c.getWidth() - c.getWidth() * c.getZoom()) {
    vpt[4] = c.getWidth() - c.getWidth() * c.getZoom()
  }

  if (vpt[5] >= 0) {
    vpt[5] = 0
  } else if (vpt[5] < c.getHeight() - c.getHeight() * c.getZoom()) {
    vpt[5] = c.getHeight() - c.getHeight() * c.getZoom()
  }
  c.setViewportTransform(vpt)
}
export const handleZoom = (scale: number, centerX: number, centerY: number, c: Canvas, previousScale?: number) => {
  const dampeningFactor = 0.2
  let newZoom = previousScale
    ? c.getZoom() * Math.pow(scale / previousScale, 1)
    : (Math.log(scale) / Math.log(2)) * dampeningFactor + c.getZoom()

  // Modify the new zoom level based on the delta scale and zoom rate

  // Limit the zoom level to the maximum and minimum values
  newZoom = Math.min(newZoom, 10)
  newZoom = Math.max(newZoom, 1)

  // Get the center point of the gesture
  const gestureCenter = new fabric.Point(centerX, centerY)

  // Zoom the canvas to the new zoom level while maintaining the gesture center point
  c.zoomToPoint(gestureCenter, newZoom)

  checkCanvasBounds(c)
}
export const handlePan = (delta: IPoint, c: Canvas) => {
  c.relativePan(delta)
  checkCanvasBounds(c)
}

export function resetZoom() {
  const { getCanvas, setCanZoomOut } = useDrawStore()
  const c = getCanvas()
  c.setZoom(1)
  checkCanvasBounds(c)
  setCanZoomOut(false)
  EventBus.emit('resetZoom')
  c.renderAll()
}
