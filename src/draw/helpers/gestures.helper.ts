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

// ==========================================
// CONSTANTS
// ==========================================
const MIN_ZOOM = 0.2
const MAX_ZOOM = 20
const COMMIT_INTERVAL_MS = 200

const initialCssTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0
}

// ==========================================
// SHARED STATE VARIABLES
// ==========================================
let cssTransform = { ...initialCssTransform }
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
  canvasRotateDelta: 0
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function cssTransformChanged(transform: typeof cssTransform) {
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

function commitCssTransform(c: Canvas, isFinal: boolean = true) {
  const { canResetView } = storeToRefs(useDrawUIStore())
  canResetView.value = true

  let vpt = c.viewportTransform
  if (!vpt) return

  vpt[0] *= cssTransform.scale
  vpt[3] *= cssTransform.scale
  vpt[4] = cssTransform.translateX + (vpt[4] * cssTransform.scale)
  vpt[5] = cssTransform.translateY + (vpt[5] * cssTransform.scale)

  c.setViewportTransform(vpt)
  cssTransform = { ...initialCssTransform }

  const { updateVisibility } = useDrawObjectManager()
  updateVisibility(false )

  if (c.wrapperEl) {
    c.wrapperEl.style.transform = ''
    if (isFinal) {
      c.wrapperEl.style.willChange = 'auto'
    }
  }
}

function scheduleGestureFrame(c: Canvas) {
  if (gestureFrameScheduled) return
  gestureFrameScheduled = true

  requestAnimationFrame(() => {
    gestureFrameScheduled = false

    if (gestureState.rotateDelta !== 0) {
      const obj = c.getActiveObject()
      if (obj) {
        obj.rotate((obj.angle! + gestureState.rotateDelta) % 360)
        obj.setCoords()
      }
      gestureState.rotateDelta = 0
      c.requestRenderAll()
    }

    c.requestRenderAll()
  })
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

function enablePCGestures(c: Canvas) {
  const { addEventsOfService } = useDrawEventManager()

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (o: any) => {
        const e = o.e
        e.preventDefault()
        e.stopPropagation()

        if (!isWheeling) {
          isWheeling = true
          if (c.wrapperEl) {
            c.wrapperEl.style.transformOrigin = '0 0'
            c.wrapperEl.style.willChange = 'transform'
          }
        }

        const deltaY = e.deltaY
        const rawZoomFactor = Math.exp(-deltaY / 50)
        const baseFabricZoom = c.getZoom()
        const proposedCssScale = cssTransform.scale * rawZoomFactor
        const proposedEffectiveZoom = baseFabricZoom * proposedCssScale

        let actualZoomFactor = rawZoomFactor

        if (proposedEffectiveZoom > MAX_ZOOM) {
          const allowedCssScale = MAX_ZOOM / baseFabricZoom
          actualZoomFactor = allowedCssScale / cssTransform.scale
          cssTransform.scale = allowedCssScale
        } else if (proposedEffectiveZoom < MIN_ZOOM) {
          const allowedCssScale = MIN_ZOOM / baseFabricZoom
          actualZoomFactor = allowedCssScale / cssTransform.scale
          cssTransform.scale = allowedCssScale
        } else {
          cssTransform.scale = proposedCssScale
        }

        const pointerX = e.offsetX
        const pointerY = e.offsetY

        cssTransform.translateX = pointerX - (pointerX - cssTransform.translateX) * actualZoomFactor
        cssTransform.translateY = pointerY - (pointerY - cssTransform.translateY) * actualZoomFactor

        requestAnimationFrame(() => {
          if (c.wrapperEl) {
            c.wrapperEl.style.transform = `matrix(${cssTransform.scale}, 0, 0, ${cssTransform.scale}, ${cssTransform.translateX}, ${cssTransform.translateY})`
          }
        })

        attemptThrottledCommit(c)

        c.fire('zoomChanged')



        clearTimeout(pcWheelTimeout)
        pcWheelTimeout = setTimeout(() => {
          isWheeling = false
          commitCssTransform(c, true)
          c.fire('zoomChanged')

        }, 250)
      }
    },
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const e = o.e
        if (e.buttons !== 4) return

        panActive = true
        lastPanPoint = { x: e.pageX, y: e.pageY }
        lastCommitTime = Date.now()

        if (c.wrapperEl) {
          c.wrapperEl.style.transformOrigin = '0 0'
          c.wrapperEl.style.willChange = 'transform'
        }

        c.selection = false
        c.skipTargetFind = true

        e.preventDefault()
        e.stopPropagation()
      }
    },
    {
      on: 'mouse:move',
      handler: (o: any) => {
        if (!panActive || !lastPanPoint) return
        c.fire("pan")

        const e = o.e
        const dx = e.pageX - lastPanPoint.x
        const dy = e.pageY - lastPanPoint.y

        lastPanPoint = { x: e.pageX, y: e.pageY }

        cssTransform.translateX += dx
        cssTransform.translateY += dy

        requestAnimationFrame(() => {
          if (c.wrapperEl) {
            c.wrapperEl.style.transform = `matrix(${cssTransform.scale}, 0, 0, ${cssTransform.scale}, ${cssTransform.translateX}, ${cssTransform.translateY})`
          }
        })

        attemptThrottledCommit(c)
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        if (!panActive) return

        panActive = false
        lastPanPoint = null

        const { selectedTool } = useToolSelection()
        if (selectedTool === DrawTool.Select) {
          c.selection = true
          c.skipTargetFind = false
        }

        commitCssTransform(c, true)

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
  const { shouldModifyObjectsWithGestures, unSelect } = useSelect()

  let originalState: any = null
  const isUsingGesture = ref(false)

  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      if (shapeCreationMode.value) return
      c.fire('gestureStart')

      if (selectedTool.value === DrawTool.Select && shouldModifyObjectsWithGestures()) {
        const obj = c.getActiveObject()
        if (!obj) return

        obj.lockMovementX = true
        obj.lockMovementY = true

        originalState = {
          left: obj.left, top: obj.top,
          scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle
        }
        isUsingGesture.value = true
      } else {
        isUsingGesture.value = false
        unSelect()
        cancelPreviousAction(c)

        if (c.wrapperEl) {
          c.wrapperEl.style.transformOrigin = '0 0'
          c.wrapperEl.style.willChange = 'transform'
        }
        c.selection = false
        c.skipTargetFind = true
      }
    },

    onDrag: (movementX, movementY) => {
      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) return

      cssTransform.translateX += movementX * 2
      cssTransform.translateY += movementY * 2

      requestAnimationFrame(() => {
        if (c.wrapperEl) {
          c.wrapperEl.style.transform = `matrix(${cssTransform.scale}, 0, 0, ${cssTransform.scale}, ${cssTransform.translateX}, ${cssTransform.translateY})`
        }
      })
    },

    onZoom: (scale, previousScale, center) => {
      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) {
        if (Math.abs(scale - previousScale) < 0.005) return
        const obj = c.getActiveObject()
        if (!obj) return

        const factor = scale / previousScale
        obj.scaleX! *= factor
        obj.scaleY! *= factor
        obj.setCoords()

        scheduleGestureFrame(c)
        return
      }

      if (Math.abs(scale - previousScale) < 0.01) return

      const rawZoomFactor = scale / previousScale
      const baseFabricZoom = c.getZoom()
      const proposedCssScale = cssTransform.scale * rawZoomFactor
      const proposedEffectiveZoom = baseFabricZoom * proposedCssScale

      let actualZoomFactor = rawZoomFactor

      if (proposedEffectiveZoom > MAX_ZOOM) {
        const allowedCssScale = MAX_ZOOM / baseFabricZoom
        actualZoomFactor = allowedCssScale / cssTransform.scale
        cssTransform.scale = allowedCssScale
      } else if (proposedEffectiveZoom < MIN_ZOOM) {
        const allowedCssScale = MIN_ZOOM / baseFabricZoom
        actualZoomFactor = allowedCssScale / cssTransform.scale
        cssTransform.scale = allowedCssScale
      } else {
        cssTransform.scale = proposedCssScale
      }

      cssTransform.translateX = center.x - (center.x - cssTransform.translateX) * actualZoomFactor
      cssTransform.translateY = center.y - (center.y - cssTransform.translateY) * actualZoomFactor

      requestAnimationFrame(() => {
        if (c.wrapperEl) {
          c.wrapperEl.style.transform = `matrix(${cssTransform.scale}, 0, 0, ${cssTransform.scale}, ${cssTransform.translateX}, ${cssTransform.translateY})`
        }
      })

    },

    onRotate: (angleDifference, center) => {
      if (selectedTool.value !== DrawTool.Select || !isUsingGesture.value) return
      if (Math.abs(angleDifference) < 0.8) return

      gestureState.rotateDelta += angleDifference
      scheduleGestureFrame(c)
    },

    onGestureEnd: (fingers) => {
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
            transform: { target: obj, original: originalState } as any
          })
          scheduleGestureFrame(c)
        }, 100)
      }

      if (!isUsingGesture.value && fingers === 0 && cssTransformChanged(cssTransform)) {
        if (selectedTool.value === DrawTool.Select) {
          setTimeout(() => {
            c.selection = true
            c.skipTargetFind = false
          }, 50)
        }
        commitCssTransform(c, true)
      }
    }
  })
}