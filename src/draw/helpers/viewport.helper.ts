import { Canvas, FabricObject, Point, TMat2D } from 'fabric'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { CANVAS_SIZE } from '@/draw/config/canvas.config'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import * as fabric from 'fabric'

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
  canvas.requestRenderAll()
}

export const checkCanvasBounds = (c: Canvas) => {
  const vpt = [...c.viewportTransform!] as TMat2D

  // 1. Cure the Ghost Zoom: Extract true scale from the matrix
  const trueZoom = Math.sqrt(vpt[0] * vpt[0] + vpt[1] * vpt[1])

  const canvasWidth = c.getWidth()
  const canvasHeight = c.getHeight()
  const worldSize = CANVAS_SIZE

  // 2. Find the logical center of your world
  const logicalCenter = new Point(worldSize / 2, worldSize / 2)

  // 3. Transform that logical center into physical screen coordinates
  const screenCenter = fabric.util.transformPoint(logicalCenter, vpt)

  // 4. Define the physical boundaries (the browser viewport)
  // We allow the center to go to the edges, but not beyond.
  const minX = 0
  const maxX = canvasWidth
  const minY = 0
  const maxY = canvasHeight

  let correctiveDx = 0
  let correctiveDy = 0

  // 5. Calculate the corrective dosage if the center drifts out of bounds
  if (screenCenter.x < minX) correctiveDx = minX - screenCenter.x
  if (screenCenter.x > maxX) correctiveDx = maxX - screenCenter.x
  if (screenCenter.y < minY) correctiveDy = minY - screenCenter.y
  if (screenCenter.y > maxY) correctiveDy = maxY - screenCenter.y

  // 6. Apply the corrective translation to the matrix
  if (correctiveDx !== 0 || correctiveDy !== 0) {
    vpt[4] += correctiveDx
    vpt[5] += correctiveDy
    c.setViewportTransform(vpt)
  }
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
  newZoom = Math.min(newZoom, 20)
  newZoom = Math.max(newZoom, 0.1)

  // Get the center point of the gesture
  const gestureCenter = new Point(centerX, centerY)

  // Zoom the canvas to the new zoom level while maintaining the gesture center point
  c.zoomToPoint(gestureCenter, newZoom)

  // checkCanvasBounds(c)
}

export function applyZoomDelta(delta: number, centerPoint: Point, c: Canvas) {
  const vpt = c.viewportTransform

  if (!vpt) return

  const currentScale = Math.sqrt(vpt[0] * vpt[0] + vpt[1] * vpt[1])

  let targetScale = currentScale * delta
  targetScale = Math.min(10, Math.max(0.5, targetScale))

  const effectiveDelta = targetScale / currentScale

  if (effectiveDelta === 1) return

  const scaleMatrix: TMat2D = [effectiveDelta, 0, 0, effectiveDelta, 0, 0]

  const translate: TMat2D = [1, 0, 0, 1, centerPoint.x, centerPoint.y]
  const translateInv: TMat2D = [1, 0, 0, 1, -centerPoint.x, -centerPoint.y]

  let newVpt = fabric.util.multiplyTransformMatrices(translate, scaleMatrix)
  newVpt = fabric.util.multiplyTransformMatrices(newVpt, translateInv)
  newVpt = fabric.util.multiplyTransformMatrices(newVpt, vpt)

  c.setViewportTransform(newVpt)
}


export const handlePan = (delta: Point, c: Canvas) => {
  c.relativePan(delta)
  // checkCanvasBounds(c)
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
  c.requestRenderAll()
}

// TODO we should remove this one
export function resetZoom2(c: Canvas) {
  c.setZoom(1)
  c.setViewportTransform([1, 0, 0, 1, 0, 0])
}