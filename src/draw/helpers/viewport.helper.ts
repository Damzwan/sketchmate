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