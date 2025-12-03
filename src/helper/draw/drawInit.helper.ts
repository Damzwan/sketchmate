import { FabricObject, Canvas, type CanvasOptions, Point } from 'fabric'

import { v4 as uuidv4 } from 'uuid'
import { BACKGROUND, PAN_MARGIN } from '@/config/draw/draw.config'
import { isMobile } from '@/helper/general.helper'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawTool, FabricEvent, ToolService } from '@/types/draw.types'
import { usePen } from '@/store/draw/tools/pen.store'
import { useEraser } from '@/store/draw/tools/eraser.store'
import { usePan } from '@/store/draw/tools/pan.store'
import { useSelect } from '@/store/draw/tools/select.store'

export function changeFabricSettings() {
  FabricObject.customProperties = ['id', 'erasable', 'prevClipPath', 'oldText']
  ;(FabricObject as any).ownDefaults!['erasable'] = true

  const originalAdd = Canvas.prototype.add
  Canvas.prototype.add = function(...objects: any[]) {
    objects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uuidv4() // Assign unique ID
      }
    })
    return originalAdd.call(this, ...objects)
  }
}

export function initCanvasOptions(): Partial<CanvasOptions> {
  return {
    isDrawingMode: true,
    width: 3000,
    height: 3000,
    backgroundColor: BACKGROUND,
    fireMiddleClick: true,
    selection: false,
    preserveObjectStacking: true,
    renderOnAddRemove: false,
    viewportTransform: [1, 0, 0, 1, -1500, -1500]
  }
}

export function makeCanvasContainerFitWindow() {
  const canvas_containers = document.getElementsByClassName('canvas-container')
  const canvas_container = canvas_containers[0]! as HTMLDivElement
  canvas_container.style.width = '100%'
  canvas_container.style.height = '100%'
  canvas_container.style.overflow = 'hidden'
}

export function enableGestures(c: Canvas) {
  if (isMobile()) console.log('boom boom mobile gestures')
  else enablePCGestures(c)
}

export function enablePCGestures(c: Canvas) {
  const { addEventsOfService } = useDrawEventManager()
  let panStartPoint: any = null
  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        const deltaY = e.e.deltaY

        // Convert deltaY into a zoom factor
        const zoomFactor = Math.exp(-deltaY / 50)
        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        // setCanZoomOut(c.getZoom() > 1)

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
        if (event.button === 1) {
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
  const vpt = c.viewportTransform!
  const canvasWidth = c.getWidth()
  const canvasHeight = c.getHeight()
  const zoom = c.getZoom()

  const pm = PAN_MARGIN

  // Check left boundary
  if (vpt[4] >= pm) {
    vpt[4] = pm
  } else if (Math.abs(vpt[4]) > canvasWidth * zoom - pm) {
    vpt[4] = -(canvasWidth * zoom - pm)
  }

  // Check top boundary
  if (vpt[5] >= pm) {
    vpt[5] = pm
  } else if (Math.abs(vpt[5]) > canvasHeight * zoom - pm) {
    vpt[5] = -(canvasHeight * zoom - pm)
  }

  c.setViewportTransform(vpt)
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
  c.relativePan(delta)
  checkCanvasBounds(c)
}

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
  return {
    [DrawTool.Pen]: usePen(),
    [DrawTool.MobileEraser]: useEraser(),
    [DrawTool.Select]: useSelect(),
    [DrawTool.Pan]: usePan()
  }
}

// export function resetZoom() {
//   const { getCanvas, setCanZoomOut } = useDrawStore()
//   const c = getCanvas()
//   c.setZoom(1)
//   c.setViewportTransform([1, 0, 0, 1, 0, 0])
//   setCanZoomOut(false)
//   EventBus.emit('resetZoom')
//   c.renderAll()
// }