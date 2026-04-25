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

// ==========================================
// CONSTANTS
// ==========================================
const MIN_ZOOM = 0.2
const MAX_ZOOM = 50
const COMMIT_INTERVAL_MS = 200

const initialCssTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0
}

// ==========================================
// SHARED STATE VARIABLES
// ==========================================
let lastCommitTime = 0
let isWheeling = false
let pcWheelTimeout: any = null

let panActive = false
let lastPanPoint: { x: number; y: number } | null = null

let gestureFrameScheduled = false
let deg = 0

const gestureState = {
  zoomDelta: 1,
  pan: { x: 0, y: 0 },
  zoomScale: 1,
  rotateDelta: 0,
  zoomCenter: null as Point | null,
  needsCull: false,
  canvasRotateDelta: 0,
  originalObjectState: null as any | null
}

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

function cssTransformChanged(transform: any) {
  return (
    transform.scale !== initialCssTransform.scale ||
    transform.translateX !== initialCssTransform.translateX ||
    transform.translateY !== initialCssTransform.translateY
  )
}

function attemptThrottledCommit(c: Canvas) {
  const now = Date.now()
  if (now - lastCommitTime > COMMIT_INTERVAL_MS) {
    lastCommitTime = now
    commitCssTransform(c, false)
  }
}

// Define this outside the function (e.g., in your component or store)
let debounceCacheTimeout: any = null

function commitCssTransform(c: Canvas, isFinal: boolean = true) {
  const { canResetView } = storeToRefs(useDrawUIStore())
  const { cssTransform } = storeToRefs(useDrawStore())
  canResetView.value = true

  // 1. Snapshot the transformation before clearing the DOM
  const scale = cssTransform.value.scale
  const tx = cssTransform.value.translateX
  const ty = cssTransform.value.translateY

  // DIAGNOSTIC CHECK: Are we zooming (scale changed) or just panning?
  const isZooming = scale !== 1

  // 2. IMMEDIATE DOM CLEANUP (Crucial for the "Shrinking Bug")
  if (c.wrapperEl) {
    c.wrapperEl.style.transform = ''
    c.wrapperEl.style.transformOrigin = ''
    if (isFinal) {
      c.wrapperEl.style.willChange = 'auto'
    }
  }

  // 3. Update Fabric's Viewport Transform
  let vpt = [...c.viewportTransform!]

  vpt[0] *= scale
  vpt[3] *= scale
  vpt[4] = tx + (vpt[4] * scale)
  vpt[5] = ty + (vpt[5] * scale)

  c.setViewportTransform(vpt as any)
  c.calcOffset()

  // 5. Reset tracking state
  cssTransform.value = { ...initialCssTransform }

  // 6. UI & Rendering Logic
  c.fire('viewport:changed')
  const { updateVisibility, setVisibleObjectsState } = useDrawObjectManager()

  // ADMINISTER CACHE DROP ONLY IF ZOOMING
  if (isZooming) {
    setVisibleObjectsState('interaction')
  }
  updateVisibility(false)

  if (isFinal) {
    clearTimeout(debounceCacheTimeout)

    if (isZooming) {
      // Patient has stopped zooming. 300ms recovery time before re-caching.
      debounceCacheTimeout = setTimeout(() => {
        window.requestIdleCallback?.(() => {
          setVisibleObjectsState('static')
          c.requestRenderAll()
        })
      }, 2000)
    } else {
      // Panning finished, no cache recovery needed, just render.
      c.requestRenderAll()
    }
  } else {
    c.requestRenderAll()
  }
}


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
  const { addEventsOfService } = useDrawEventManager()
  const { ghostBoxes, cssTransform, isGesturing } = storeToRefs(useDrawStore())
  const { query } = useDrawObjectManager()


  function clearGhostBuffer() {
    isGesturing.value = false
    ghostBoxes.value = []
  }

  function administerGhostBuffer() {
    if (isGesturing.value) return // Prevent double-dosing if already active

    isGesturing.value = true

    const vpt = c.viewportTransform
    if (vpt) {
      const zoom = c.getZoom()
      const currentViewWidth = c.width! / zoom
      const currentViewHeight = c.height! / zoom

      const vLeft = -vpt[4] / zoom
      const vTop = -vpt[5] / zoom

      const bufferX = currentViewWidth * 1.5
      const bufferY = currentViewHeight * 1.5

      // Using your updated Rect logic
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
            // 🚨 CONVERT TO SCREEN COORDINATES 🚨
            left: (bound.left * zoom) + vpt[4],
            top: (bound.top * zoom) + vpt[5],
            width: bound.width * zoom,
            height: bound.height * zoom,
            type: obj.type
          }
        })
    }
  }

  // ==========================================

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (o: any) => {
        const e = o.e
        e.preventDefault()
        e.stopPropagation()

        if (!isWheeling) {
          isWheeling = true
          dynamicMinZoom = getMinZoomToFitAll(c)

          if (c.wrapperEl) {
            c.wrapperEl.style.transformOrigin = '0 0'
            c.wrapperEl.style.willChange = 'transform'
          }
          administerGhostBuffer()
        }

        const deltaY = e.deltaY
        const rawZoomFactor = Math.exp(-deltaY / 50)
        const baseFabricZoom = c.getZoom()

        // Added .value to all cssTransform reads
        const proposedCssScale = cssTransform.value.scale * rawZoomFactor
        const proposedEffectiveZoom = baseFabricZoom * proposedCssScale

        let actualZoomFactor = rawZoomFactor

        // Added .value to all cssTransform mutations
        if (proposedEffectiveZoom > MAX_ZOOM) {
          const allowedCssScale = MAX_ZOOM / baseFabricZoom
          actualZoomFactor = allowedCssScale / cssTransform.value.scale
          cssTransform.value.scale = allowedCssScale
        } else if (proposedEffectiveZoom < dynamicMinZoom) {
          const allowedCssScale = dynamicMinZoom / baseFabricZoom
          actualZoomFactor = allowedCssScale / cssTransform.value.scale
          cssTransform.value.scale = allowedCssScale
        } else {
          cssTransform.value.scale = proposedCssScale
        }

        const pointerX = e.offsetX
        const pointerY = e.offsetY

        cssTransform.value.translateX = pointerX - (pointerX - cssTransform.value.translateX) * actualZoomFactor
        cssTransform.value.translateY = pointerY - (pointerY - cssTransform.value.translateY) * actualZoomFactor

        requestAnimationFrame(() => {
          if (c.wrapperEl) {
            c.wrapperEl.style.transform = `matrix(${cssTransform.value.scale}, 0, 0, ${cssTransform.value.scale}, ${cssTransform.value.translateX}, ${cssTransform.value.translateY})`
          }
        })

        c.fire('zoomChanged')
        clearTimeout(pcWheelTimeout)
        pcWheelTimeout = setTimeout(() => {
          isWheeling = false
          commitCssTransform(c, true)
          c.fire('zoomChanged')

          // 🧹 Clean up ghost buffer on zoom end
          clearGhostBuffer()
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
        lastCommitTime = Date.now()

        if (c.wrapperEl) {
          c.wrapperEl.style.transformOrigin = '0 0'
          c.wrapperEl.style.willChange = 'transform'
        }

        c.selection = false
        c.skipTargetFind = true

        administerGhostBuffer()

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

        // Added .value mutations
        cssTransform.value.translateX += dx
        cssTransform.value.translateY += dy

        requestAnimationFrame(() => {
          if (c.wrapperEl) {
            c.wrapperEl.style.transform = `matrix(${cssTransform.value.scale}, 0, 0, ${cssTransform.value.scale}, ${cssTransform.value.translateX}, ${cssTransform.value.translateY})`
          }
        })
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        if (!panActive) return

        panActive = false
        lastPanPoint = null

        const { selectedTool } = storeToRefs(useToolSelection()) // Ensure this is unwrapped if it's a ref!
        if (selectedTool.value === DrawTool.Select) {
          c.selection = true
          c.skipTargetFind = false
        }

        commitCssTransform(c, true)

        // 🧹 Clean up ghost buffer on pan end
        clearGhostBuffer()

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

  const { shouldModifyObjectsWithGestures } = useSelect()

  const { ghostBoxes, cssTransform, isGesturing } = storeToRefs(useDrawStore())

  const { query } = useDrawObjectManager()


  const isUsingGesture = ref(false)


// State variables for smooth gesture tracking & disambiguation

  let isCanvasZooming = false

  let canvasPanDistance = 0

  let isObjectScaling = false

  let totalObjectAngleDelta = 0

  let gestureFrameScheduled = false


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

        c.requestRenderAll()

      }

    })

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

        isUsingGesture.value = false

        c.selection = false

        c.skipTargetFind = true

        cancelPreviousAction(c)

        dynamicMinZoom = getMinZoomToFitAll(c)


        if (c.wrapperEl) {

          c.wrapperEl.style.transformOrigin = '0 0'

          c.wrapperEl.style.willChange = 'transform'

        }


        isGesturing.value = true


        const vpt = c.viewportTransform

        if (vpt) {

          const zoom = c.getZoom()

          const currentViewWidth = c.width! / zoom

          const currentViewHeight = c.height! / zoom


          const vLeft = -vpt[4] / zoom

          const vTop = -vpt[5] / zoom


          const bufferX = currentViewWidth * 1.5

          const bufferY = currentViewHeight * 1.5


          const expandedSearchArea = new Rect(vLeft - bufferX, vTop - bufferY, currentViewWidth + (bufferX * 2), currentViewHeight + (bufferY * 2))


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

    },


    onDrag: (movementX, movementY) => {

      canvasPanDistance += Math.hypot(movementX, movementY)


      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) return


      cssTransform.value.translateX += movementX * 2

      cssTransform.value.translateY += movementY * 2


      c.fire('pan')

      requestAnimationFrame(() => {

        if (c.wrapperEl) {

          c.wrapperEl.style.transform = `translate3d(${cssTransform.value.translateX}px, ${cssTransform.value.translateY}px, 0) scale3d(${cssTransform.value.scale}, ${cssTransform.value.scale}, 1)`

        }

      })

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

        obj.set({

          scaleX: orig.scaleX * scale,

          scaleY: orig.scaleY * scale

        })


        scheduleGestureFrame()

        return

      }


// --- CANVAS ZOOM LOGIC REWRITTEN ---


      if (!isCanvasZooming) {

        const isHeavyPanning = canvasPanDistance > 30

// FIX 1: Lowered threshold from 0.25 to 0.08 to prevent severe delta loss

        const dynamicThreshold = isHeavyPanning ? 0.08 : 0.03

        const totalCanvasScaleChange = Math.abs(1 - scale)

        if (totalCanvasScaleChange < dynamicThreshold) return


        isCanvasZooming = true

      }


      let rawZoomFactor = scale / previousScale


// FIX 2: Anti-Jitter logic to stabilize heavy panning

      if (isCanvasZooming && canvasPanDistance > 30) {

        const frameDelta = Math.abs(1 - rawZoomFactor)

// If the scale change is less than 0.2% this frame, treat it as finger wiggle and ignore it

        if (frameDelta < 0.002) {

          rawZoomFactor = 1

        }

      }


      const baseFabricZoom = c.getZoom()


      const proposedCssScale = cssTransform.value.scale * rawZoomFactor

      const proposedEffectiveZoom = baseFabricZoom * proposedCssScale


      let actualZoomFactor = rawZoomFactor


      if (proposedEffectiveZoom > MAX_ZOOM) {

        actualZoomFactor = (MAX_ZOOM / baseFabricZoom) / cssTransform.value.scale

        cssTransform.value.scale = MAX_ZOOM / baseFabricZoom

      } else if (proposedEffectiveZoom < dynamicMinZoom) {

        actualZoomFactor = (dynamicMinZoom / baseFabricZoom) / cssTransform.value.scale

        cssTransform.value.scale = dynamicMinZoom / baseFabricZoom

      } else {

        cssTransform.value.scale = proposedCssScale

      }


      cssTransform.value.translateX = center.x - (center.x - cssTransform.value.translateX) * actualZoomFactor

      cssTransform.value.translateY = center.y - (center.y - cssTransform.value.translateY) * actualZoomFactor


      c.fire('zoom')


      requestAnimationFrame(() => {

        if (c.wrapperEl) {

          c.wrapperEl.style.transform = `translate3d(${cssTransform.value.translateX}px, ${cssTransform.value.translateY}px, 0) scale3d(${cssTransform.value.scale}, ${cssTransform.value.scale}, 1)`

        }

      })

    },


    onRotate: (angleDifference, center) => {

      if (selectedTool.value !== DrawTool.Select || !isUsingGesture.value) return

      totalObjectAngleDelta += angleDifference

      scheduleGestureFrame()

    },


    onGestureEnd: (fingers) => {

      isCanvasZooming = false

      isObjectScaling = false


      c.fire('gestureEnd')


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


      if (!isUsingGesture.value && fingers === 0 && cssTransformChanged(cssTransform.value)) {

        if (selectedTool.value === DrawTool.Select) {

          setTimeout(() => {

            c.selection = true

            c.skipTargetFind = false

          }, 50)

        }

        commitCssTransform(c, true)


        isGesturing.value = false

        ghostBoxes.value = []

      }

    }

  })

}