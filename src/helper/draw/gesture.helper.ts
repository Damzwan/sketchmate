import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { isPlatform } from '@ionic/vue'
import { fabricateTouchUp } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { DrawEvent, DrawTool, FabricEvent } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { ERASERS } from '@/config/draw.config'
import { useToast } from '@/service/toast.service'

export function enableZoomAndPan(c: any) {
  if (isPlatform('mobile') || isPlatform('capacitor') || isPlatform('android') || isPlatform('ios'))
    enableMobileZoomAndPan(c)
  else enablePCZoomAndPan(c)
}

// we are only using hammer events so they should not collide with other events. Not mandatory to store them in the event manager
export function enableMobileZoomAndPan(c: any) {
  const { hammer, setCanZoomOut } = useDrawStore()
  const { disableHistorySaving, enableHistorySaving } = useHistory()

  let lastDelta = {
    x: 0,
    y: 0
  }

  hammer!.on('pinchstart', () => {
    disableHistorySaving()
    cancelPreviousAction(c)
  })

  hammer!.on('pinch', function (e) {
    const panTolerance = 0.0001 // Change this as needed to refine the distinction
    const isPanning = Math.abs(e.deltaX - lastDelta.x) > panTolerance || Math.abs(e.deltaY - lastDelta.y) > panTolerance

    if (isPanning) {
      // Handle panning
      const delta = {
        x: 2 * (e.deltaX - lastDelta.x),
        y: 2 * (e.deltaY - lastDelta.y)
      }
      handlePan(delta, c)
      lastDelta = {
        x: e.deltaX,
        y: e.deltaY
      }
    } else {
      const scaleTolerance = 0 // Change this as needed to refine the distinction
      if (Math.abs(1 - e.scale) > scaleTolerance) {
        handleZoom(e.scale, e.center.x, e.center.y, c)
        setCanZoomOut(c.getZoom() > 1)
      }
    }
  })

  hammer!.on('pinchend', function () {
    enableHistorySaving()
    lastDelta = {
      x: 0,
      y: 0
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
  setTimeout(() => {
    if (ERASERS.includes(selectedTool)) cancelEraserAction(c) // needs to happen before touch up
    fabricateTouchUp(c)
    if (selectedTool == DrawTool.Pen) cancelPenAction(c) // needs to happen after touch up
    c.discardActiveObject()
    c.renderAll()
  }, 1)
}

export function enablePCZoomAndPan(c: any) {
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
export const handleZoom = (scale: number, centerX: number, centerY: number, c: Canvas) => {
  // Calculate the new zoom level based on the scale
  let newZoom = (Math.log(scale) / Math.log(2)) * 0.15 + c.getZoom() // Dampening factor of 0.1

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
}
