import { Canvas, FabricObject, Point } from 'fabric'
import { isMobile } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool, FabricEvent } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import { ref } from 'vue'
import { gestureDetector } from '@/draw/utils/gestureDetector'
import { handlePan, handleZoom } from '@/draw/helpers/viewport.helper'
import { cancelPreviousAction } from '@/draw/helpers/tools/cancelTools.helper'
import { setCacheForObjects } from '@/draw/helpers/object.helper'

export function enableGestures(c: Canvas) {
  if (isMobile()) enableMobileGestures(c, c.upperCanvasEl)
  else enablePCGestures(c)
}

export function enablePCGestures(c: Canvas) {
  const { addEventsOfService } = useDrawEventManager()
  const { canResetView } = storeToRefs(useDrawStore())
  let panStartPoint: any = null
  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        const deltaY = e.e.deltaY

        // Convert deltaY into a zoom factor
        const zoomFactor = Math.exp(-deltaY / 50)
        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        canResetView.value = true

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

        if (event.buttons === 4) {
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
          canResetView.value = true
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

export function enableMobileGestures(c: Canvas, upperCanvasEl: any) {

  const { selectedTool, shapeCreationMode, canResetView } = storeToRefs(useDrawStore())
  const { shouldModifyObjectsWithGestures, unSelect } = useSelect()

  let isRotating = false
  let originalState: any = null
  const isUsingGesture = ref(false)

  gestureDetector(upperCanvasEl, {
    onGestureStart: () => {
      if (shapeCreationMode.value) return

      c.fire('gestureStart')

      // rotation or scale gesture
      if (selectedTool.value == DrawTool.Select && shouldModifyObjectsWithGestures()) {
        const obj = c.getActiveObject()
        if (!obj) return
        obj.set({ lockMovementX: true, lockMovementY: true }) // we are only focused on rotation and scaling
        originalState = {
          left: obj.left,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle
        }

        isUsingGesture.value = true

        return
      }
      // Zoom and pan
      else {
        c.selection = false
        unSelect()
        setCacheForObjects(c.getObjects(), false)

        cancelPreviousAction(c)
      }
    },
    onZoom: (scale: number, previousScale: number, center: Point) => {
      if (selectedTool.value == DrawTool.Select && isUsingGesture.value) {
        if (isRotating) return
        if (Math.abs(scale - previousScale) < 0.005) return

        const obj = c.getActiveObject() as FabricObject

        obj.set({
          scaleX: obj.scaleX! * (scale / previousScale),
          scaleY: obj.scaleY! * (scale / previousScale)
        })
        obj.setCoords()
        c.requestRenderAll()

      } else {
        if (Math.abs(scale - previousScale) < 0.005) return
        handleZoom(scale, center.x, center.y, c, previousScale)
        canResetView.value = true
        c.requestRenderAll()
      }
    },
    onRotate: (angleDifference: number) => {
      if (!(selectedTool.value == DrawTool.Select && isUsingGesture.value)) return

      const rotationThreshold = 0.8 // Adjust the threshold as needed
      const obj = c.getActiveObject()
      if (!obj) return

      isRotating = Math.abs(angleDifference) > rotationThreshold

      obj.rotate((obj.angle! + angleDifference) % 360)
      obj.setCoords()
      c.requestRenderAll()
    },
    onDrag: (dx: number, dy: number, previousDx: number, previousDy: number) => {
      if (selectedTool.value == DrawTool.Select && isUsingGesture.value) return

      const delta: Point = new Point({ x: 2 * (dx - previousDx), y: 2 * (dy - previousDy) })
      handlePan(delta, c)
      c.requestRenderAll()
    },
    onGestureEnd: (fingers: number) => {
      if (fingers == 1) {
        if (!isUsingGesture.value) {
          setCacheForObjects(c.getObjects(), true)
          if (selectedTool.value === DrawTool.Select) c.selection = true
        }
      }

      if (selectedTool.value == DrawTool.Select && isUsingGesture.value && fingers == 0) {
        const obj = c.getActiveObject()
        if (!obj) return

        // Without timeout the object will move to the last location of your fingers making it tp sometimes
        setTimeout(() => {
          obj.set({ lockMovementX: false, lockMovementY: false })
          isUsingGesture.value = false

          const transform: any = {
            target: obj,
            original: originalState
          }

          // Fire the event with transform + target
          c.fire('object:modified', { target: obj, transform })
          c.requestRenderAll()
        }, 100)
      }
      c.requestRenderAll()
    }
  })
}