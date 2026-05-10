import { Canvas, FabricObject, Point } from 'fabric'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { CANVAS_SIZE } from '@/draw/config/canvas.config'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

export function initViewport(c: Canvas) {
  const initX = (c.width - CANVAS_SIZE) / 2
  const initY = (c.height - CANVAS_SIZE) / 2
  c.setViewportTransform([1, 0, 0, 1, initX, initY])
}

export function centerObjectInViewport(
  canvas: Canvas,
  object: FabricObject
) {
  const canvasEl = canvas.upperCanvasEl
  if (!canvasEl) return

  const rect = canvasEl.getBoundingClientRect()

  // 1. Calculate the center of the canvas element in the browser viewport
  const clientCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }

  const pointer = canvas.getScenePoint({
    clientX: clientCenter.x,
    clientY: clientCenter.y
  } as MouseEvent)

  // 3. Position the object
  object.set({
    left: pointer.x,
    top: pointer.y,
    originX: 'center',
    originY: 'center'
  })

  object.setCoords()
}


export function resetZoom() {
  const { getCanvas } = useDrawStore()
  const { canResetView } = storeToRefs(useDrawUIStore())
  const { updateVisibility } = useDrawObjectManager()

  const c = getCanvas()
  c.setZoom(1)
  const initX = (c.width - CANVAS_SIZE) / 2
  const initY = (c.height - CANVAS_SIZE) / 2
  c.setViewportTransform([1, 0, 0, 1, initX, initY])
  canResetView.value = false

  updateVisibility()
  c.fire('zoomReset')
}


export function precalculateAndSetViewport(canvas: Canvas, jsonObjects: any[], padding = 0.8) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  jsonObjects.forEach(obj => {
    // Basic bounds check from JSON properties
    const left = obj.left || 0
    const top = obj.top || 0
    const width = (obj.width * (obj.scaleX || 1)) || 0
    const height = (obj.height * (obj.scaleY || 1)) || 0

    if (left < minX) minX = left
    if (top < minY) minY = top
    if (left + width > maxX) maxX = left + width
    if (top + height > maxY) maxY = top + height
  })

  if (minX === Infinity) return

  const contentWidth = maxX - minX
  const contentHeight = maxY - minY
  const canvasWidth = canvas.getWidth()
  const canvasHeight = canvas.getHeight()

  const scaleX = canvasWidth / (contentWidth || 1)
  const scaleY = canvasHeight / (contentHeight || 1)

  let fitZoom = Math.min(scaleX, scaleY) * padding
  fitZoom = Math.max(fitZoom, 0.05)

  const centerX = canvasWidth / 2 - (minX + contentWidth / 2) * fitZoom
  const centerY = canvasHeight / 2 - (minY + contentHeight / 2) * fitZoom

  canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, centerX, centerY])
}