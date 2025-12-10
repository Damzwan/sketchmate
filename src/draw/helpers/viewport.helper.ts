import { Canvas, FabricObject, Point, TMat2D } from 'fabric'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { CANVAS_SIZE } from '@/draw/config/canvas.config'

export function initViewport(c: Canvas) {
  const initX = (c.width - CANVAS_SIZE) / 2
  const initY = (c.height - CANVAS_SIZE) / 2
  c.setViewportTransform([1, 0, 0, 1, initX, initY])
}

export function centerObjectInViewport(
  canvas: Canvas,
  object: FabricObject,
  containerSelector = '.canvas-container'
) {
  let rect: DOMRect | null = null

  const container = document.querySelector(containerSelector) as HTMLDivElement
  if (container) {
    rect = container.getBoundingClientRect()
  } else {
    // fallback to canvas element if container doesn't exist
    const canvasEl = canvas.upperCanvasEl as HTMLCanvasElement
    rect = canvasEl.getBoundingClientRect()
  }

  if (!rect) return

  // center of visible screen
  const clientCenter = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  }

  // Convert screen coords -> canvas coords
  const pointer = canvas.getPointer(clientCenter as any)

  // Position object in canvas space
  object.set({
    left: pointer.x,
    top: pointer.y,
    originX: 'center',
    originY: 'center'
  })

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
  const vpt = [...c.viewportTransform!] as TMat2D

  vpt[4] = Math.min(Math.max(vpt[4], minX), maxX)
  vpt[5] = Math.min(Math.max(vpt[5], minY), maxY)

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
  c.viewportTransform
  c.relativePan(delta)
  checkCanvasBounds(c)
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

// TODO we should remove this one
export function resetZoom2(c: Canvas) {
  c.setZoom(1)
  c.setViewportTransform([1, 0, 0, 1, 0, 0])
}