import * as fabric from 'fabric'
import { Canvas, Point, TMat2D } from 'fabric'
import { isMobile } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { storeToRefs } from 'pinia'
import { DrawTool, FabricEvent } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import { ref } from 'vue'
import { gestureDetector } from '@/draw/utils/gestureDetector'
import { cancelPreviousAction } from '@/draw/helpers/tools/cancelTools.helper'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import {
  finalizeLayeredRender,
  isLayeredRenderActive,
  prepareLayeredBuffers,
  renderLayeredBuffers
} from '@/draw/helpers/customTransform.helper'
import { useDrawStore } from '@/draw/store/draw.store'
import { Rect } from '@/draw/utils/QuadTree'
import { useGestureStore } from '@/draw/store/tools/gesture.store'
import { useToast } from '@/service/toast.service'

// ==========================================
// CONSTANTS
// ==========================================
const MIN_ZOOM = 0.2


// ==========================================
// HELPER FUNCTIONS
// ==========================================
function getMinZoomToFitAll(canvas: fabric.Canvas, padding = 0.9) {
  const objects = canvas.getObjects()
  if (objects.length === 0) return 0.5

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Single O(n) pass to find the absolute boundaries
  for (let i = 0; i < objects.length; i++) {
    // getBoundingRect returns the actual visual bounds,
    // accounting for stroke width, scaling, and rotation
    const bound = objects[i].getBoundingRect()

    if (bound.left < minX) minX = bound.left
    if (bound.top < minY) minY = bound.top
    if (bound.left + bound.width > maxX) maxX = bound.left + bound.width
    if (bound.top + bound.height > maxY) maxY = bound.top + bound.height
  }

  const contentWidth = maxX - minX
  const contentHeight = maxY - minY

  const canvasWidth = canvas.getWidth()
  const canvasHeight = canvas.getHeight()

  // Prevent division by zero if objects have no dimensions
  const scaleX = canvasWidth / (contentWidth || 1)
  const scaleY = canvasHeight / (contentHeight || 1)

  const fitZoom = Math.min(scaleX, scaleY) * padding

  return Math.min(fitZoom, MIN_ZOOM)
}

// Define this outside the function (e.g., in your component or store)
let debounceCacheTimeout: any = null
let visibilityTimeout: any = null

function rotateView(c: fabric.Canvas, deltaDeg: number, centerPoint: Point) {
  const rad = fabric.util.degreesToRadians(deltaDeg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const rotate: TMat2D = [cos, sin, -sin, cos, 0, 0]
  const translate: TMat2D = [1, 0, 0, 1, centerPoint.x, centerPoint.y]
  const translateInv: TMat2D = [1, 0, 0, 1, -centerPoint.x, -centerPoint.y]

  const vpt = c.viewportTransform

  let newVpt = fabric.util.multiplyTransformMatrices(translate, rotate)
  newVpt = fabric.util.multiplyTransformMatrices(newVpt, translateInv)
  newVpt = fabric.util.multiplyTransformMatrices(newVpt, vpt)

  c.setViewportTransform(newVpt)
}

// ==========================================
// MAIN EXPORTS & FEATURE LOGIC
// ==========================================

export function enableGestures(c: Canvas) {
  if (isMobile()) enableMobileGestures(c, c.upperCanvasEl)
  else enablePCGestures(c)
}

let dynamicMinZoom = MIN_ZOOM // fallback

export function enablePCGestures(c: Canvas) {
  const gestureStore = useGestureStore()
  const { getStableCanvas, query } = useDrawObjectManager()
  const { ghostBoxes } = storeToRefs(useDrawStore())
  const { addEventsOfService } = useDrawEventManager()

  let isWheeling = false
  let pcWheelTimeout: any = null
  let panActive = false
  let lastPanPoint: { x: number; y: number } | null = null

  // Fills the edges with low-res boxes if we pan off the rendered canvas
  function administerGhostBuffer() {
    if (gestureStore.isGesturing) return

    const vpt = c.viewportTransform
    if (vpt) {
      const zoom = c.getZoom()
      const currentViewWidth = c.width! / zoom
      const currentViewHeight = c.height! / zoom

      const vLeft = -vpt[4] / zoom
      const vTop = -vpt[5] / zoom

      const bufferX = currentViewWidth * 1.5
      const bufferY = currentViewHeight * 1.5

      const expandedSearchArea = new Rect(
        vLeft - bufferX,
        vTop - bufferY,
        currentViewWidth + (bufferX * 2),
        currentViewHeight + (bufferY * 2)
      )

      ghostBoxes.value = query(expandedSearchArea)
        .filter((obj: any) => !obj.isOnScreen())
        .map((obj: any) => {
          const bound = obj.getBoundingRect(true, true)
          return {
            id: obj.name || obj.id || Math.random().toString(),
            left: (bound.left * zoom) + vpt[4],
            top: (bound.top * zoom) + vpt[5],
            width: bound.width * zoom,
            height: bound.height * zoom,
            type: obj.type
          }
        })
    }
  }

  function clearGhostBuffer() {
    ghostBoxes.value = []
  }

  function syncVisuals() {
    const physWidth = c.getElement().width
    const physHeight = c.getElement().height

    const stableCanvas = getStableCanvas(physWidth, physHeight)
    gestureStore.fastBlit(c, stableCanvas as any, ghostBoxes.value)
  }

  // Wraps up the gesture procedure and triggers a high-res re-render
  function endGesture(isZooming: boolean = false) {
    const { setVisibleObjectsState, updateVisibility, onGestureEnd } = useDrawObjectManager()
    const gestureStore = useGestureStore()

    gestureStore.isGesturing = false
    onGestureEnd()
    c.fire('gestureEnd')
    clearGhostBuffer()

    if (isZooming) {
      setVisibleObjectsState('interaction')
    }

    // 2. Debounce the high-res chunked render
    // This allows the user to chain a pan immediately after a zoom without stuttering
    clearTimeout(visibilityTimeout)
    visibilityTimeout = setTimeout(() => {
      if (!gestureStore.isGesturing) {
        updateVisibility(false)
      }
    }, 150)

    // 3. The Idle Cache Bake
    if (isZooming) {
      clearTimeout(debounceCacheTimeout)
      debounceCacheTimeout = setTimeout(() => {
        window.requestIdleCallback?.(() => {
          if (!gestureStore.isGesturing) {
            setVisibleObjectsState('static')
            updateVisibility(false)
          }
        })
      }, 5000)
    }
  }

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (o: any) => {
        const e = o.e
        e.preventDefault()
        e.stopPropagation()

        if (!isWheeling) {
          isWheeling = true

          // 1. Calculate the boundary at the exact start of the gesture
          dynamicMinZoom = getMinZoomToFitAll(c)

          administerGhostBuffer()
          gestureStore.isGesturing = true
          c.fire('gestureStart')
        }

        // 2. Calculate proposed Zoom
        const rawZoomFactor = Math.exp(-e.deltaY / 50)
        let newZoom = c.getZoom() * rawZoomFactor

        // 3. Clamp using your dynamic boundary
        newZoom = Math.max(dynamicMinZoom, Math.min(newZoom, gestureStore.maxZoom))

        // 4. Fabric handles the focal point translation automatically
        c.zoomToPoint(new Point(e.offsetX, e.offsetY), newZoom)

        // 5. Hardware-accelerated visual sync
        requestAnimationFrame(syncVisuals)

        c.fire('zoomChanged')

        // 6. Debounce the end of the wheel gesture
        clearTimeout(pcWheelTimeout)
        pcWheelTimeout = setTimeout(() => {
          isWheeling = false
          endGesture(true) // true because this is a zoom event
          c.fire('zoomChanged')
        }, 150)
      }
    },
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const e = o.e
        if (e.buttons !== 4) return // Middle click check

        panActive = true
        lastPanPoint = { x: e.pageX, y: e.pageY }

        c.selection = false
        c.skipTargetFind = true

        administerGhostBuffer()
        gestureStore.isGesturing = true
        c.fire('gestureStart')

        e.preventDefault()
        e.stopPropagation()
      }
    },
    {
      on: 'mouse:move',
      handler: (o: any) => {
        if (!panActive || !lastPanPoint) return

        const e = o.e
        const dx = e.pageX - lastPanPoint.x
        const dy = e.pageY - lastPanPoint.y
        lastPanPoint = { x: e.pageX, y: e.pageY }

        // 1. Update Fabric's viewport transform directly
        const vpt = c.viewportTransform!
        vpt[4] += dx
        vpt[5] += dy
        c.setViewportTransform(vpt)

        // 2. Hardware-accelerated visual sync
        requestAnimationFrame(syncVisuals)
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        if (!panActive) return

        panActive = false
        lastPanPoint = null

        const { selectedTool } = storeToRefs(useToolSelection())
        if (selectedTool.value === DrawTool.Select) {
          c.selection = true
          c.skipTargetFind = false
        }

        endGesture()

        o.e.preventDefault()
        o.e.stopPropagation()
      }
    }
  ]

  addEventsOfService('gestures', events)
}


export function enableMobileGestures(c: Canvas, upperCanvasEl: any) {
  const { selectedTool } = storeToRefs(useToolSelection())
  const { shapeCreationMode } = storeToRefs(useDrawUIStore())
  const { ghostBoxes } = storeToRefs(useDrawStore())

  const { shouldModifyObjectsWithGestures } = useSelect()
  const { query, getStableCanvas, setVisibleObjectsState, updateVisibility, onGestureEnd } = useDrawObjectManager()
  const gestureStore = useGestureStore()

  const isUsingGesture = ref(false)

  // State variables for smooth gesture tracking & disambiguation
  let isCanvasZooming = false
  let canvasPanDistance = 0
  let isObjectScaling = false
  let totalObjectAngleDelta = 0
  let gestureFrameScheduled = false
  let dynamicMinZoom = gestureStore.minZoom

  // --- SHARED HELPERS (Consider moving to a shared file later) ---
  function syncVisuals() {
    const physWidth = c.getElement().width
    const physHeight = c.getElement().height

    const stableCanvas = getStableCanvas(physWidth, physHeight)
    gestureStore.fastBlit(c, stableCanvas as any, ghostBoxes.value)
  }

  let visibilityTimeout: any = null
  let debounceCacheTimeout: any = null

  function endCanvasGesture(wasZooming: boolean) {
    gestureStore.isGesturing = false
    onGestureEnd()
    c.fire('gestureEnd')
    ghostBoxes.value = []

    if (wasZooming) setVisibleObjectsState('interaction')

    clearTimeout(visibilityTimeout)
    visibilityTimeout = setTimeout(() => {
      if (!gestureStore.isGesturing) updateVisibility(false)
    }, 250)

    if (wasZooming) {
      clearTimeout(debounceCacheTimeout)
      debounceCacheTimeout = setTimeout(() => {
        window.requestIdleCallback?.(() => {
          if (!gestureStore.isGesturing) {
            setVisibleObjectsState('static')
            updateVisibility(false)
          }
        })
      }, 2000)
    }
  }

  // --------------------------------------------------------------

  function scheduleGestureFrame() {
    if (gestureFrameScheduled) return
    gestureFrameScheduled = true

    requestAnimationFrame(() => {
      gestureFrameScheduled = false
      const obj = c.getActiveObject()
      if (!obj || !gestureState.originalObjectState) return

      const newAngle = (gestureState.originalObjectState.angle + totalObjectAngleDelta) % 360
      obj.set('angle', newAngle)
      obj.setCoords()

      if (isLayeredRenderActive) {
        renderLayeredBuffers(c, obj)
      } else {
      }
    })
  }

  const gestureState = {
    originalObjectState: null as any | null
  }

  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      isCanvasZooming = false
      canvasPanDistance = 0
      isObjectScaling = false
      totalObjectAngleDelta = 0

      if (shapeCreationMode.value) return

      c.fire('gestureStart')

      if (selectedTool.value === DrawTool.Select && shouldModifyObjectsWithGestures()) {
        // Object gesture path
        const obj = c.getActiveObject()
        if (!obj) return

        obj.lockMovementX = true
        obj.lockMovementY = true

        gestureState.originalObjectState = {
          left: obj.left, top: obj.top,
          scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle
        }

        isUsingGesture.value = true
        prepareLayeredBuffers(c, obj)

      } else {
        // Canvas gesture path
        isUsingGesture.value = false
        c.selection = false
        c.skipTargetFind = true
        c.isDrawingMode = false

        cancelPreviousAction(c)

        dynamicMinZoom = getMinZoomToFitAll(c)
        gestureStore.isGesturing = true

        // Ghost box calculation deferred to idle
        const vpt = [...c.viewportTransform!]
        const zoom = c.getZoom()

        window.requestIdleCallback?.(() => {
          const currentViewWidth = c.width! / zoom
          const currentViewHeight = c.height! / zoom
          const vLeft = -vpt[4] / zoom
          const vTop = -vpt[5] / zoom
          const bufferX = currentViewWidth * 1.5
          const bufferY = currentViewHeight * 1.5

          const expandedSearchArea = new Rect(
            vLeft - bufferX, vTop - bufferY,
            currentViewWidth + bufferX * 2, currentViewHeight + bufferY * 2
          )

          ghostBoxes.value = query(expandedSearchArea)
            .filter((obj: any) => !obj.isOnScreen())
            .map((obj: any) => {
              const bound = obj.getBoundingRect(true, true)
              return {
                id: obj.name || obj.id || Math.random().toString(),
                left: (bound.left * zoom) + vpt[4],
                top: (bound.top * zoom) + vpt[5],
                width: bound.width * zoom,
                height: bound.height * zoom,
                type: obj.type
              }
            })
        }, { timeout: 500 })
      }
    },

    onDrag: (movementX, movementY) => {
      canvasPanDistance += Math.hypot(movementX, movementY)

      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) return

      // 1. Direct Fabric Viewport Math
      // (Kept your * 2 multiplier if that was your preferred mobile drag sensitivity)
      const vpt = c.viewportTransform!
      vpt[4] += movementX * 2
      vpt[5] += movementY * 2
      c.setViewportTransform(vpt)


      // 2. Hardware-accelerated sync
      requestAnimationFrame(syncVisuals)
    },

    onZoom: (scale, previousScale, center) => {
      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) {
        if (!isObjectScaling) {
          const isHeavyRotating = Math.abs(totalObjectAngleDelta) > 10
          const dynamicObjThreshold = isHeavyRotating ? 0.15 : 0.03
          const totalScaleChange = Math.abs(1 - scale)
          if (totalScaleChange < dynamicObjThreshold) return
          isObjectScaling = true
        }

        const obj = c.getActiveObject()
        if (!obj || !gestureState.originalObjectState) return

        const orig = gestureState.originalObjectState
        obj.set({ scaleX: orig.scaleX * scale, scaleY: orig.scaleY * scale })
        scheduleGestureFrame()
        return
      }

      // Disambiguate panning vs zooming
      if (!isCanvasZooming) {
        const isHeavyPanning = canvasPanDistance > 30
        const dynamicThreshold = isHeavyPanning ? 0.08 : 0.03
        const totalCanvasScaleChange = Math.abs(1 - scale)
        if (totalCanvasScaleChange < dynamicThreshold) return
        isCanvasZooming = true
      }

      let rawZoomFactor = scale / previousScale

      if (isCanvasZooming && canvasPanDistance > 30) {
        if (Math.abs(1 - rawZoomFactor) < 0.002) rawZoomFactor = 1
      }

      // 1. Calculate & Clamp Zoom
      let newZoom = c.getZoom() * rawZoomFactor
      newZoom = Math.max(dynamicMinZoom, Math.min(newZoom, gestureStore.maxZoom))

      // 2. Let Fabric handle the focal pivot translation
      c.zoomToPoint(new Point(center.x, center.y), newZoom)


      // 3. Hardware-accelerated sync
      requestAnimationFrame(syncVisuals)
    },

    onRotate: (angleDifference, center) => {
      if (selectedTool.value !== DrawTool.Select || !isUsingGesture.value) return
      totalObjectAngleDelta += angleDifference
      scheduleGestureFrame()
    },

    onGestureEnd: (fingers) => {
      // Capture the state before resetting it
      const wasZooming = isCanvasZooming

      isCanvasZooming = false
      isObjectScaling = false

      if (selectedTool.value === DrawTool.Select && isUsingGesture.value && fingers === 0) {
        const obj = c.getActiveObject()
        if (!obj) return

        setTimeout(() => {
          obj.lockMovementX = false
          obj.lockMovementY = false
          isUsingGesture.value = false

          c.fire('object:modified', {
            target: obj,
            transform: { target: obj, original: gestureState.originalObjectState } as any
          })

          finalizeLayeredRender(c)
        }, 100)
      }

      // Canvas gesture completion
      if (!isUsingGesture.value && fingers === 0) {
        setTimeout(() => {
          if (selectedTool.value === DrawTool.Select) {
            c.selection = true
            c.skipTargetFind = false
          } else if (selectedTool.value === DrawTool.Pen || selectedTool.value === DrawTool.MobileEraser) {
            c.isDrawingMode = true
          }
        }, 50)

        endCanvasGesture(wasZooming)
      }
    }
  })
}