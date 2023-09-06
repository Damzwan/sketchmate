import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { fabricateTouchUp } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { DrawEvent, DrawTool, FabricEvent, ObjectType, SelectedObject } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { ERASERS } from '@/config/draw/draw.config'
import { isMobile } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { EventBus } from '@/main'

export function enableZoomAndPan(c: any) {
  if (isMobile()) enableMobileGestures(c)
  else enablePCGestures(c)
}

// we are only using hammer events so they should not collide with other events. Not mandatory to store them in the event manager
export function enableMobileGestures(c: any) {
  const { hammer, setCanZoomOut } = useDrawStore()
  const { disableHistorySaving, enableHistorySaving, addPrevModifiedObjectsToStack } = useHistory()
  const { selectedObjectsRef } = storeToRefs(useSelect())

  const { selectedTool, isUsingGesture, shapeCreationMode } = storeToRefs(useDrawStore())

  let lastDelta = {
    x: 0,
    y: 0
  }
  let lastEvent = { rotation: null, scale: 1 } // Initialize

  hammer!.on('pinchstart', () => {
    c.getObjects().forEach((o: any) => (o.objectCaching = false))
    if (shapeCreationMode.value) return
    EventBus.emit('gesture') // used by bucket tool
    disableHistorySaving()

    // rotation or scale gesture
    if (selectedTool.value == DrawTool.Select) {
      lastEvent = { rotation: null, scale: 1 }

      const obj = c.getActiveObject()
      obj.set({ lockMovementX: true, lockMovementY: true }) // we are only focused on rotation and scaling
      isUsingGesture.value = true

      return
    } else cancelPreviousAction(c)
  })

  hammer!.on('pinch', function (e) {
    EventBus.emit('gesture') // used by bucket tool
    if (shapeCreationMode.value) return

    if (selectedTool.value == DrawTool.Select && isUsingGesture.value) {
      lastEvent = handleSelectMobilePinch(e, selectedObjectsRef.value, c, lastEvent)
    } else {
      if (selectedTool.value == DrawTool.Select) return
      const panTolerance = 0.0000000000001 // Change this as needed to refine the distinction
      const isPanning =
        Math.abs(e.deltaX - lastDelta.x) > panTolerance || Math.abs(e.deltaY - lastDelta.y) > panTolerance

      if (isPanning) {
        // Handle panning
        const delta = {
          x: 2 * (e.deltaX - lastDelta.x),
          y: 2 * (e.deltaY - lastDelta.y)
        }
        handlePan(delta, c)
        lastDelta = {
          x: e.deltaX,
          y: e.deltaY
        }
      } else {
        const scaleTolerance = 0.03 // Change this as needed to refine the distinction
        if (Math.abs(1 - e.scale) > scaleTolerance) {
          handleZoom(e.scale, e.center.x, e.center.y, c)
          setCanZoomOut(c.getZoom() > 1)
        }
      }
    }

    c.requestRenderAll()
  })

  hammer!.on('pinchend', function () {
    if (!isUsingGesture.value) c.getObjects().forEach((o: any) => (o.objectCaching = true))

    enableHistorySaving()
    lastDelta = {
      x: 0,
      y: 0
    }

    if (selectedTool.value == DrawTool.Select && isUsingGesture.value) {
      // Without timeout the object will move to the last location of your fingers making it tp sometimes
      setTimeout(() => {
        const obj = c.getActiveObject()
        obj.set({ lockMovementX: false, lockMovementY: false })
        isUsingGesture.value = false

        if (obj.type == ObjectType.selection)
          addPrevModifiedObjectsToStack((obj as fabric.ActiveSelection).getObjects())
        else addPrevModifiedObjectsToStack([obj])
        c.requestRenderAll()
      }, 100)
    }
    c.requestRenderAll()
  })
}

function handleSelectMobilePinch(e: any, selectedObjects: SelectedObject[], c: fabric.Canvas, lastEvent: any) {
  if (!selectedObjects || selectedObjects.length === 0) return

  const obj = c.getActiveObject()
  if (!obj) return

  const scaleDiff = e.scale - lastEvent.scale
  const rotationThreshold = 0.2 // Adjust the threshold as needed

  let rotationDiff = 0.1
  if (lastEvent.rotation !== null) {
    rotationDiff = e.rotation - lastEvent.rotation
  }
  lastEvent.rotation = e.rotation
  lastEvent.scale = e.scale

  // Prioritize rotation if the absolute value of rotationDiff is greater than the threshold
  if (Math.abs(rotationDiff) > rotationThreshold) {
    obj.rotate((obj.angle! + rotationDiff) % 360)
  } else {
    obj._setOriginToCenter()
    obj.scaleX! *= 1 + scaleDiff
    obj.scaleY! *= 1 + scaleDiff
    obj._resetOrigin()
  }

  obj.setCoords()
  c.requestRenderAll()

  return lastEvent
}

function cancelEraserAction(c: Canvas) {
  c.on('erasing:end', (e: any) => {
    const targets = e.targets as fabric.Object[]
    const path: fabric.Path = e.path

    targets.forEach((target: any) => {
      target.eraser._objects = target.eraser._objects.filter((obj: any) => obj.id !== path.id)
    })

    c.off('erasing:end')
  })
}

function cancelPenAction(c: Canvas) {
  const lastObject = c.getObjects().pop()
  if (lastObject) c.remove(lastObject)
}

function cancelPreviousAction(c: Canvas) {
  const { selectedTool } = useDrawStore()
  const { actionWithoutEvents } = useEventManager()
  setTimeout(() => {
    actionWithoutEvents(() => {
      if (ERASERS.includes(selectedTool)) cancelEraserAction(c) // needs to happen before touch up
      c.discardActiveObject()
      fabricateTouchUp(c)
      if (selectedTool == DrawTool.Pen) cancelPenAction(c) // needs to happen after touch up
      c.renderAll()
    })
  }, 1)
}

export function enablePCGestures(c: any) {
  const { subscribe } = useEventManager()
  const { setCanZoomOut } = useDrawStore()
  let panStartPoint: any = null

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: (e: any) => {
        const deltaY = e.e.deltaY

        // Convert deltaY into a zoom factor
        const zoomFactor = Math.exp(-deltaY / 10)
        handleZoom(zoomFactor, e.e.offsetX, e.e.offsetY, c)
        setCanZoomOut(c.getZoom() > 1)

        c.requestRenderAll()
        e.e.preventDefault()
        e.e.stopPropagation()
      },
      type: DrawEvent.Gesture
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
      },
      type: DrawEvent.Gesture
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
          handlePan(new fabric.Point(deltaX, deltaY), c)
          c.requestRenderAll()
        }
      },
      type: DrawEvent.Gesture
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
      },
      type: DrawEvent.Gesture
    }
  ]

  events.forEach(e => subscribe(e))
}

export const checkCanvasBounds = (c: Canvas) => {
  const vpt = c.viewportTransform!
  if (vpt[4] >= 0) {
    vpt[4] = 0
  } else if (vpt[4] < c.getWidth() - c.getWidth() * c.getZoom()) {
    vpt[4] = c.getWidth() - c.getWidth() * c.getZoom()
  }

  if (vpt[5] >= 0) {
    vpt[5] = 0
  } else if (vpt[5] < c.getHeight() - c.getHeight() * c.getZoom()) {
    vpt[5] = c.getHeight() - c.getHeight() * c.getZoom()
  }
  c.setViewportTransform(vpt)
}
export const handleZoom = (scale: number, centerX: number, centerY: number, c: Canvas) => {
  const dampeningFactor = 0.2
  let newZoom = (Math.log(scale) / Math.log(2)) * dampeningFactor + c.getZoom() // Dampening factor of 0.1

  // Limit the zoom level to the maximum and minimum values
  newZoom = Math.min(newZoom, 10)
  newZoom = Math.max(newZoom, 1)

  // Get the center point of the gesture
  const gestureCenter = new fabric.Point(centerX, centerY)

  // Zoom the canvas to the new zoom level while maintaining the gesture center point
  c.zoomToPoint(gestureCenter, newZoom)

  checkCanvasBounds(c)
}
export const handlePan = (delta: IPoint, c: Canvas) => {
  c.relativePan(delta)
  checkCanvasBounds(c)
}

export function resetZoom() {
  const { getCanvas, setCanZoomOut, selectedTool } = useDrawStore()
  const c = getCanvas()
  c.setZoom(1)
  checkCanvasBounds(c)
  setCanZoomOut(false)
  EventBus.emit('resetZoom')
  c.renderAll()
}
