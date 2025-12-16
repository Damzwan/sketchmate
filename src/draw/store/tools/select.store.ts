import { defineStore } from 'pinia'
import * as fabric from 'fabric'
import { type Canvas, type FabricObject, IText, Point } from 'fabric'
import { type Ref, ref } from 'vue'
import { v4 } from 'uuid'
import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { isNative } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { isText } from '@/draw/helpers/text.helper'

interface Select extends ToolService {
  unSelect: () => void
  getSelectedObjects: () => FabricObject[]
  isSelectActive: Ref<boolean>
  selectedObjectsRef: Ref<FabricObject[]>
  multiSelectMode: Ref<boolean>
  shouldModifyObjectsWithGestures: () => boolean
  isEditingText: Ref<boolean>
}

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

  let useGestures = false

  // ----------------- Helper Functions -----------------
  function getObjectsUnderPointer(pointer: Point) {
    return c!.getObjects().filter(obj => obj.containsPoint(pointer))
  }

  function cycleSelection(pointer: Point) {
    const { actionWithoutEvents } = useDrawEventManager()
    const objsUnderPointer = getObjectsUnderPointer(pointer)
    const nextObj = objsUnderPointer.find(obj => !selectedObjects.includes(obj))
    if (nextObj) {
      actionWithoutEvents(() => {
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
      actionWithoutEvents(() => {
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
        actionWithoutEvents(() => {
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
        if (c!._activeObject && c!._activeObject.isType('activeselection')) c!._activeObject.id = v4() // TODO seems a bit hacky
        isSelectActive.value = true
        clicksAfterSelectionActive = 0
        selectedObjects = e.selected
        selectedObjectsRef.value = [...e.selected]
        useGestures = false
        setTimeout(() => {
          useGestures = true
          clicksAfterSelectionActive++ // TODO kind of a dirty hack
        }, 100)
      }
    },
    {
      on: 'selection:updated',
      handler: (e: any) => {
        isSelectActive.value = true
        selectedObjects = e.selected
        selectedObjectsRef.value = [...e.selected]
        clicksAfterSelectionActive = 0
        useGestures = false
        setTimeout(() => {
          useGestures = true
          clicksAfterSelectionActive++
        }, 100)
      }
    },
    {
      on: 'selection:cleared',
      handler: () => {
        if (isText(selectedObjectsRef.value) && isEditingText.value) {
          c!.setActiveObject(selectedObjects[0])
          isEditingText.value = false
          return
        }
        isSelectActive.value = false
        selectedObjects = []
        selectedObjectsRef.value = []
      }
    },
    {
      on: 'mouse:down',
      handler: (e) => {
        pointerDownPos = c!.getPointer(e.e)
        wasDragging = false
        clicksAfterSelectionActive++
      }
    },
    {
      on: 'mouse:move',
      handler: (e) => {
        if (!pointerDownPos) return
        const p = c!.getPointer(e.e)
        const dx = p.x - pointerDownPos.x
        const dy = p.y - pointerDownPos.y
        if (Math.sqrt(dx * dx + dy * dy) > 5) wasDragging = true
      }
    },
    {
      on: 'mouse:up',
      handler: () => {
        if (wasDragging || !pointerDownPos) return

        if (!isSelectActive.value) return


        if (clicksAfterSelectionActive > 1) {
          if (multiSelectMode.value) {
            handleMultiSelect(pointerDownPos)
          } else if (isText(selectedObjects) && !isEditingText.value) {
            (selectedObjects[0] as IText).enterEditing()
          } else {
            cycleSelection(pointerDownPos)
          }
        } else {
        }
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
          if (isBottomHalf.value) text.top -= 250
          c?.requestRenderAll()
        }
      }
    },
    {
      on: 'text:editing:exited',
      handler: () => {
        if (isNative() && isBottomHalf.value && isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          text.top += 250
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
    isEditingText
  }
})
