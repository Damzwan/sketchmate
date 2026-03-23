import { defineStore } from 'pinia'
import * as fabric from 'fabric'
import { type Canvas, type FabricObject, IText, Point } from 'fabric'
import { type Ref, ref } from 'vue'
import { v4 } from 'uuid'
import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { isNative } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { isText } from '@/draw/helpers/text.helper'
import { getAbsoluteState } from '@/draw/helpers/object.helper'

interface Select extends ToolService {
  unSelect: () => void
  getSelectedObjects: () => FabricObject[]
  isSelectActive: Ref<boolean>
  selectedObjectsRef: Ref<FabricObject[]>
  multiSelectMode: Ref<boolean>
  shouldModifyObjectsWithGestures: () => boolean
  isEditingText: Ref<boolean>
  getSelectedObjectOriginalStates: () => Map<string, any>
}

const TEXT_JUMP_Y_VALUE = window.innerHeight / 2 // in case we select the text on the bottom half of the screen on mobile it becomes buggy, we need to push it up while editing

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined
  const isSelectActive = ref(false)

  let selectedObjects: FabricObject[] = []
  const selectedObjectsRef: Ref<FabricObject[]> = ref([])

  const multiSelectMode = ref(false) // TODO not yet implemented
  let clicksAfterSelectionActive = 0

  const isEditingText = ref(false)
  const isBottomHalf = ref(false)

  let wasDragging = false
  let pointerDownPos: Point | null = null

  let useGestures = false // means that when we zoom or rotate we edit the object instead of zooming/panning the canvas

  const originalStates = new Map<string, any>()

  // ----------------- Helper Functions -----------------
  function getObjectsUnderPointer(pointer: Point) {
    return c!.getObjects().filter(obj => obj.containsPoint(pointer))
  }

  function cycleSelection(pointer: Point) {
    const { actionWithoutEvents } = useDrawEventManager()
    const objsUnderPointer = getObjectsUnderPointer(pointer)
    const nextObj = objsUnderPointer.find(obj => !selectedObjects.includes(obj))
    if (nextObj) {
      void actionWithoutEvents(() => {
        c!.setActiveObject(nextObj)
        selectedObjects = [nextObj]
        selectedObjectsRef.value = [nextObj]
        c!.requestRenderAll()
      })
    }
  }

  function handleMultiSelect(pointer: Point) {
    const currentSelection = c!.getActiveObjects() || []
    c!.discardActiveObject()
    c!.getObjects().forEach(o => o.setCoords())
    const { actionWithoutEvents } = useDrawEventManager()


    const objectsUnderPointer = getObjectsUnderPointer(pointer)
    const newObjects = objectsUnderPointer.filter(
      obj =>
        !currentSelection.includes(obj) &&
        currentSelection.every(sel =>
          sel.containsPoint(pointer) ? obj.isContainedWithinObject(sel) : true
        )
    )

    if (newObjects.length) {
      void actionWithoutEvents(() => {
        const newSelection = [...currentSelection, ...newObjects.slice(0, 1)]
        c!.setActiveObject(new fabric.ActiveSelection(newSelection, { canvas: c }))
        selectedObjects = newSelection
        selectedObjectsRef.value = [...newSelection]
        c!.requestRenderAll()
      })
    } else {
      // If click on selected object, unselect it
      const toUnselect = objectsUnderPointer.filter(obj => currentSelection.includes(obj))
      if (toUnselect.length) {
        void actionWithoutEvents(() => {
          c!.setActiveObject(new fabric.ActiveSelection(currentSelection.filter(o => !toUnselect.includes(o)), { canvas: c }))
          selectedObjects = c!.getActiveObjects() || []
          selectedObjectsRef.value = [...selectedObjects]
          c!.requestRenderAll()
        })
      }
    }
  }

  // ----------------- Event Handlers -----------------
  const events: FabricEvent[] = [
    {
      on: 'selection:created',
      handler: (e: any) => {
        const active = c!._activeObject
        if (active?.isType('activeselection')) active.id = v4() // TODO is this necessary?

        setSelection(e.selected)
        temporarilyDisableGestures()
      }
    },
    {
      on: 'selection:updated',
      handler: (e: any) => {
        if (isText(selectedObjects) && isEditingText.value) {
          c!.discardActiveObject()
          return
        }

        setSelection(e.selected)
        temporarilyDisableGestures()
      }
    },
    {
      on: 'selection:cleared',
      handler: () => {
        if (isText(selectedObjects) && isEditingText.value) {
          c!.setActiveObject(selectedObjects[0])
          isEditingText.value = false
          return
        }

        clearSelection()
      }
    },
    {
      on: 'mouse:down',
      handler: (e) => {
        startPointerTracking(c!.getScenePoint(e.e))
        clicksAfterSelectionActive++
      }
    },
    {
      on: 'before:transform',
      handler: () => {
        originalStates.clear()
        c!.getActiveObjects().forEach(obj => {
          originalStates.set(obj.id, getAbsoluteState(obj))
        })
      }
    },
    {
      on: 'mouse:move',
      handler: (e) => {
        updatePointerTracking(c!.getScenePoint(e.e))
      }
    },
    {
      on: 'mouse:up',
      handler: () => {
        if (!isSelectActive.value || !isClick()) return
        if (clicksAfterSelectionActive <= 1) return

        handleSelectionClick(pointerDownPos!)
        pointerDownPos = null
      }
    },
    {
      on: 'text:editing:entered',
      handler: () => {
        isEditingText.value = true
        if (isNative() && isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          const p = new fabric.Point(text.left, text.top)
          const screenPoint = fabric.util.transformPoint(p, c!.viewportTransform)
          isBottomHalf.value = screenPoint.y > window.innerHeight / 2
          // if (isBottomHalf.value) text.top -= TEXT_JUMP_Y_VALUE
          c?.requestRenderAll()
        }
      }
    },
    {
      on: 'text:editing:exited',
      handler: () => {
        if (isNative() && isBottomHalf.value && isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          // text.top += TEXT_JUMP_Y_VALUE
          c?.requestRenderAll()
        }
      }
    }
  ]

  // ----------------- Store Functions -----------------
  function init(canvas: Canvas) {
    c = canvas
  }

  async function select() {
    c!.isDrawingMode = false
    c!.skipTargetFind = false
    c!.selection = true
    c!.requestRenderAll()
  }

  function unSelect() {
    if (isText(selectedObjectsRef.value) && isEditingText.value) {
      const text = selectedObjects[0] as IText
      c!.setActiveObject(selectedObjects[0])
      text.exitEditing()
      isEditingText.value = false
      return
    }
    c!.discardActiveObject()
    c!.requestRenderAll()
    isSelectActive.value = false
    selectedObjects = []
    selectedObjectsRef.value = []
  }

  function getSelectedObjects() {
    return selectedObjects
  }

  function shouldModifyObjectsWithGestures() {
    if (selectedObjects.length === 0) return false
    else return useGestures
  }

  function setSelection(objects: FabricObject[]) {
    selectedObjects = objects
    selectedObjectsRef.value = [...objects]
    isSelectActive.value = objects.length > 0
  }

  function clearSelection() {
    selectedObjects = []
    selectedObjectsRef.value = []
    isSelectActive.value = false
  }

  function handleSelectionClick(pointer: Point) {
    if (multiSelectMode.value) {
      handleMultiSelect(pointer)
      return
    }

    if (isText(selectedObjects) && !isEditingText.value) {
      (selectedObjects[0] as IText).enterEditing()
      return
    }

    cycleSelection(pointer)
  }

  function startPointerTracking(pointer: Point) {
    pointerDownPos = pointer
    wasDragging = false
  }

  function updatePointerTracking(pointer: Point) {
    if (!pointerDownPos) return
    const dx = pointer.x - pointerDownPos.x
    const dy = pointer.y - pointerDownPos.y
    wasDragging ||= Math.hypot(dx, dy) > 5
  }

  function isClick() {
    return !!pointerDownPos && !wasDragging
  }

  function temporarilyDisableGestures() {
    useGestures = false
    clicksAfterSelectionActive = 0

    setTimeout(() => {
      useGestures = true
      clicksAfterSelectionActive++
    }, 100)
  }

  function getSelectedObjectOriginalStates() {
    return originalStates
  }


  return {
    select,
    init,
    events,
    unSelect,
    isSelectActive,
    getSelectedObjects,
    selectedObjectsRef,
    multiSelectMode,
    shouldModifyObjectsWithGestures,
    isEditingText,
    getSelectedObjectOriginalStates
  }
})
