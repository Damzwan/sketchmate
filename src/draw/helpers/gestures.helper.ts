import { Canvas, FabricObject, Point } from 'fabric'
import { isMobile } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { storeToRefs } from 'pinia'
import { DrawTool, FabricEvent } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import { ref } from 'vue'
import { gestureDetector } from '@/draw/utils/gestureDetector'
import { applyZoomDelta, handlePan, handleZoom } from '@/draw/helpers/viewport.helper'
import { cancelPreviousAction } from '@/draw/helpers/tools/cancelTools.helper'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { setCacheForObjects } from '@/draw/helpers/object.helper'

export function enableGestures(c: Canvas) {
  if (isMobile()) enableMobileGestures(c, c.upperCanvasEl)
  else enablePCGestures(c)
}

export function enablePCGestures(c: Canvas) {
  const { addEventsOfService } = useDrawEventManager()
  const { canResetView } = storeToRefs(useDrawUIStore())

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        enterPCGesture(c)

        const deltaY = e.e.deltaY
        const zoomFactor = Math.exp(-deltaY / 50)

        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        canResetView.value = true

        scheduleViewportUpdate(c)

        e.e.preventDefault()
        e.e.stopPropagation()

        clearTimeout(pcWheelTimeout)
        pcWheelTimeout = setTimeout(() => exitPCGesture(c), 250)
      }
    },
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const e = o.e
        if (e.buttons !== 4) return
        enterPCGesture(c)


        panActive = true
        lastPanPoint = { x: e.pageX, y: e.pageY }

        enterPanZoomMode(c) // selection=false, skipTargetFind=true

        e.preventDefault()
        e.stopPropagation()
      }
    },
    {
      on: 'mouse:move',
      handler: (o: any) => {
        if (!panActive || !lastPanPoint) return

        const e = o.e
        panDelta.x += e.pageX - lastPanPoint.x
        panDelta.y += e.pageY - lastPanPoint.y
        lastPanPoint = { x: e.pageX, y: e.pageY }

        schedulePanFrame(c)
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        if (!panActive) return

        panActive = false
        lastPanPoint = null

        exitPanZoomMode(c)
        schedulePanFrame(c)

        o.e.preventDefault()
        o.e.stopPropagation()
        exitPCGesture(c)
      }
    }
  ]
  addEventsOfService('gestures', events)
}

export function enableMobileGestures(c: Canvas, upperCanvasEl: any) {

  const { selectedTool } = storeToRefs(useToolSelection())
  const { shapeCreationMode, canResetView } = storeToRefs(useDrawUIStore())
  const { shouldModifyObjectsWithGestures, unSelect } = useSelect()

  let isRotating = false
  let originalState: any = null
  const isUsingGesture = ref(false)

  const { updateVisibility } = useDrawObjectManager()


  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      if (shapeCreationMode.value) return

      c.fire('gestureStart')

      if (
        selectedTool.value === DrawTool.Select &&
        shouldModifyObjectsWithGestures()
      ) {
        const obj = c.getActiveObject()
        if (!obj) return

        obj.lockMovementX = true
        obj.lockMovementY = true

        originalState = {
          left: obj.left,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle
        }

        isUsingGesture.value = true
      } else {
        enterPanZoomMode(c)
        setCacheForObjects(c.getObjects(), false)
        unSelect()
        cancelPreviousAction(c)
      }
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
      } else {
        if (Math.abs(scale - previousScale) < 0.01) return

        const delta = scale / previousScale
        gestureState.zoomDelta *= delta
        gestureState.zoomCenter = center

        scheduleGestureFrame(c)
      }

      canResetView.value = true
    },
    onRotate: (angleDifference) => {
      if (
        selectedTool.value !== DrawTool.Select ||
        !isUsingGesture.value
      ) return

      if (Math.abs(angleDifference) < 0.8) return

      gestureState.rotateDelta += angleDifference
      scheduleGestureFrame(c)
    },
    onDrag: (dx, dy, prevDx, prevDy) => {
      if (selectedTool.value === DrawTool.Select && isUsingGesture.value) return

      gestureState.pan.x += 2 * (dx - prevDx)
      gestureState.pan.y += 2 * (dy - prevDy)

      scheduleGestureFrame(c)
    },
    onGestureEnd: (fingers) => {
      if (
        selectedTool.value === DrawTool.Select &&
        isUsingGesture.value &&
        fingers === 0
      ) {
        const obj = c.getActiveObject()
        if (!obj) return

        setTimeout(() => {
          obj.lockMovementX = false
          obj.lockMovementY = false
          isUsingGesture.value = false

          c.fire('object:modified', {
            target: obj,
            transform: {
              target: obj,
              original: originalState
            } as any
          })


          scheduleGestureFrame(c)
        }, 100)
      }

      if (!isUsingGesture.value) {
        setCacheForObjects(c.getObjects(), true)
        exitPanZoomMode(c)
      }

      scheduleGestureFrame(c)
    }

  })
}

let panZoomActive = false
let frameScheduled = false
let panActive = false
let lastPanPoint: { x: number; y: number } | null = null
let panDelta = { x: 0, y: 0 }


function enterPanZoomMode(c: Canvas) {
  if (panZoomActive) return
  panZoomActive = true

  c.selection = false
  c.skipTargetFind = true
}

function exitPanZoomMode(c: Canvas) {
  // optionally delay exit until wheel stops
  const { selectedTool } = useToolSelection()
  if (selectedTool === DrawTool.Select) {
    c.selection = true
    c.skipTargetFind = false
  }
  panZoomActive = false
}


function scheduleViewportUpdate(c: Canvas) {
  const { updateVisibility } = useDrawObjectManager()

  if (frameScheduled) return
  frameScheduled = true

  requestAnimationFrame(() => {
    frameScheduled = false

    enterPanZoomMode(c)
    updateVisibility()
    exitPanZoomMode(c)

    c.requestRenderAll()
  })
}

let panFrameScheduled = false

function schedulePanFrame(c: Canvas) {
  if (panFrameScheduled) return
  panFrameScheduled = true

  const { updateVisibility } = useDrawObjectManager()
  const { canResetView } = storeToRefs(useDrawUIStore())


  requestAnimationFrame(() => {
    panFrameScheduled = false

    if (panDelta.x !== 0 || panDelta.y !== 0) {
      handlePan(new Point(panDelta.x, panDelta.y), c)
      panDelta.x = 0
      panDelta.y = 0
      canResetView.value = true
    }

    updateVisibility()
    c.requestRenderAll()
  })
}

let gestureFrameScheduled = false

const gestureState = {
  zoomDelta: 1,
  pan: { x: 0, y: 0 },
  zoomScale: 1,
  rotateDelta: 0,
  zoomCenter: null as Point | null,
  needsCull: false
}

function scheduleGestureFrame(c: Canvas) {
  const { updateVisibility } = useDrawObjectManager()

  if (gestureFrameScheduled) return
  gestureFrameScheduled = true

  requestAnimationFrame(() => {
    gestureFrameScheduled = false

    // PAN
    if (gestureState.pan.x || gestureState.pan.y) {
      handlePan(
        new Point(gestureState.pan.x, gestureState.pan.y),
        c
      )
      gestureState.pan.x = 0
      gestureState.pan.y = 0
      gestureState.needsCull = true
    }

    // ZOOM
    if (gestureState.zoomDelta !== 1 && gestureState.zoomCenter) {
      applyZoomDelta(
        gestureState.zoomDelta,
        gestureState.zoomCenter,
        c
      )

      gestureState.zoomDelta = 1
      gestureState.zoomCenter = null
      gestureState.needsCull = true
    }

    // ROTATE (object)
    if (gestureState.rotateDelta !== 0) {
      const obj = c.getActiveObject()
      if (obj) {
        obj.rotate((obj.angle! + gestureState.rotateDelta) % 360)
        obj.setCoords()
      }
      gestureState.rotateDelta = 0
    }

    if (gestureState.needsCull) {
      updateVisibility()
      gestureState.needsCull = false
    }

    c.requestRenderAll()
  })
}


let pcGestureActive = false
let pcWheelTimeout: any = null

function enterPCGesture(c: Canvas) {
  if (pcGestureActive) return
  pcGestureActive = true
  setCacheForObjects(c.getObjects(), false)
}

function exitPCGesture(c: Canvas) {
  if (!pcGestureActive) return
  pcGestureActive = false
  setCacheForObjects(c.getObjects(), true)
}
