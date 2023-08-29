import { Ref, ref } from 'vue'
import { DrawEvent, DrawTool, FabricEvent, SelectedObject, ToolService } from '@/types/draw.types'
import { distance, exitEditing, isPolygon, isText, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore, storeToRefs } from 'pinia'
import { useEventManager } from '@/service/draw/eventManager.service'
import { useDrawStore } from '@/store/draw/draw.store'
import { disableEditing } from '@/helper/draw/actions/polyEdit.action'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export interface Select extends ToolService {
  selectedObjectsRef: Ref<Array<SelectedObject>>
  setSelectedObjects: (obj: SelectedObject[]) => void
  getSelectedObjects: () => SelectedObject[]
  setMultiSelectMode: (mode: boolean) => void
  multiSelectMode: Ref<boolean>
  setMouseClickTarget: (obj: fabric.Object | undefined) => void
  getMouseClickTarget: () => fabric.Object | undefined
}

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined

  let selectedObjects: Array<SelectedObject> = []
  const selectedObjectsRef = ref<Array<SelectedObject>>([])
  const multiSelectMode = ref(false)
  const { actionWithoutEvents } = useEventManager()

  let mouseClickTarget: fabric.Object | undefined = undefined

  let lastTapTimestamp = 0
  let objectsStack: any[] = []
  let currentObjectIndex = -1

  let removeTimeout: ReturnType<typeof setTimeout> | null = null

  const events: FabricEvent[] = [
    {
      on: 'selection:created',
      handler: handleSelect,
      type: DrawEvent.SetSelectedObjects
    },
    {
      on: 'selection:updated',
      handler: handleSelect,
      type: DrawEvent.SetSelectedObjects
    },
    {
      on: 'selection:cleared',
      handler: () => {
        if (multiSelectMode.value && mouseClickTarget) return
        mouseClickTarget = undefined

        if (isPolygon(selectedObjects)) disableEditing(selectedObjects[0] as fabric.Polygon)
        if (isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          const { isEditingText } = storeToRefs(useDrawStore())
          if (isEditingText.value) {
            if (text.text == '') actionWithoutEvents(() => c!.remove(text))
            else {
              c?.setActiveObject(text)
              isEditingText.value = false
              return
            }
          }
        }
        setMultiSelectMode(false)
        setSelectedObjects([])
      },
      type: DrawEvent.SetSelectedObjects
    },
    {
      type: DrawEvent.SetModified,
      on: 'mouse:down',
      handler: async (o: any) => {
        const activeObject = c!.getActiveObject()

        if (!objectsStack.includes(activeObject)) objectsStack = []

        const currentTimestamp = new Date().getTime()
        const isDoubleTap = currentTimestamp - lastTapTimestamp < 300 // e.g. 300 milliseconds
        lastTapTimestamp = currentTimestamp

        if (isDoubleTap && activeObject) {
          // Always compute the objects stack based on the currently active object
          objectsStack = c!.getObjects().filter(obj => activeObject.intersectsWithObject(obj))

          const pointer = c!.getPointer(o.e)

          // Sort objects by distance to pointer from their midpoints
          objectsStack.sort((a, b) => {
            const aMidpoint = {
              x: a.left + a.width / 2,
              y: a.top + a.height / 2
            }
            const bMidpoint = {
              x: b.left + b.width / 2,
              y: b.top + b.height / 2
            }

            return distance(aMidpoint, pointer) - distance(bMidpoint, pointer)
          })

          // Set the closest object (after the active one) to be the active object
          currentObjectIndex = 0 // The first object in the sorted list is the closest

          if (objectsStack[0] === activeObject && objectsStack.length > 1) {
            currentObjectIndex = 1 // If the first object is the current one, choose the next closest
          }

          // special edge case that probably collides with internal fabricjs logic
          if (multiSelectMode.value && selectedObjects.length == 1)
            await new Promise(resolve => setTimeout(resolve, 200))

          c!.setActiveObject(objectsStack[currentObjectIndex])
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'mouse:down',
      handler: async (o: any) => {
        // TODO this logic is very broken sadly
        // if (o.target && multiSelectMode.value) {
        //   const objectsThatContainPointer = c!
        //     .getObjects()
        //     .filter((obj: any) => obj.containsPoint(o.pointer, obj._getImageLines(obj.oCoords), true))
        //   const pointsNotInSelection = objectsThatContainPointer.filter(
        //     o => !getSelectedObjects().find(o2 => o2.id == o.id)
        //   )
        //
        //   if (pointsNotInSelection.length > 0) {
        //     await actionWithoutEvents(() => {
        //       const o = c!.getActiveObjects()
        //       c?.discardActiveObject()
        //       const newSelection = new fabric.ActiveSelection([...o, pointsNotInSelection[0]], {
        //         canvas: c!
        //       })
        //       c?.setActiveObject(newSelection)
        //       // setSelectedObjects(newSelection.getObjects())
        //       c?.requestRenderAll()
        //     })
        //     // setMouseClickTarget(o.target)
        //     // c!.setActiveObject(pointsNotInSelection[0])
        //   } else {
        //     // TODO does not work when we move the active selection
        //     // if (objectCountBeforeNewSelect.value != getSelectedObjects().length) return
        //     // const pointsInSelection = objectsThatContainPointer.filter(
        //     //   o => !!getSelectedObjects().find(o2 => o2.id == o.id)
        //     // )
        //     // removeTimeout = setTimeout(() => {
        //     //   if (pointsInSelection.length > 0) {
        //     //     console.log('fire!')
        //     //     removeObjectFromMultiSelect(pointsInSelection[0])
        //     //   }
        //     // }, 200)
        //   }
        // }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'object:moving',
      handler: () => {
        if (removeTimeout) {
          clearTimeout(removeTimeout)
          removeTimeout = null
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'mouse:down:before',
      handler: (o: any) => {
        setMouseClickTarget(o.target)
        // objectCountBeforeNewSelect.value = getSelectedObjects().length
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'touch:longpress',
      handler: (o: any) => {
        const touchType = o.e.type
        if (touchType != 'touchstart') return

        if (isText(selectedObjectsRef.value)) {
          exitEditing(selectedObjectsRef.value[0] as IText)
        }
        if (selectedObjectsRef.value.length > 0) {
          setMultiSelectMode(true)
          Haptics.impact({ style: ImpactStyle.Medium })
          c!.renderAll()
        }
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
    enableOnInitEvents()
  }

  function destroy() {
    c = undefined
  }

  function handleSelect(e: any) {
    let object: any = e.selected
    const { actionWithoutEvents } = useEventManager()

    if (multiSelectMode.value && object && selectedObjects && mouseClickTarget) {
      object = new fabric.ActiveSelection([...selectedObjects, ...object], { canvas: c })
      actionWithoutEvents(() => c?.setActiveObject(object))
    }

    if (object instanceof fabric.Group) setSelectedObjects(object.getObjects())
    else setSelectedObjects(object)
  }

  async function removeObjectFromMultiSelect(obj: fabric.Object) {
    actionWithoutEvents(() => {
      c?.discardActiveObject()
      const newSelection = new fabric.ActiveSelection(
        selectedObjects.filter(o => o.id != obj.id),
        { canvas: c }
      )
      c?.setActiveObject(newSelection)
      setSelectedObjects(newSelection.getObjects())
      if (newSelection.getObjects().length == 0) setMultiSelectMode(false)
      c?.requestRenderAll()
    })
  }

  function setSelectedObjects(objects: Array<SelectedObject> | undefined) {
    if (!objects) objects = []

    if (objects.length == 0) {
      c?.discardActiveObject()
      const { lastSelectedSelectTool, selectTool } = useDrawStore()
      // we switch back to lasso since it was the last selected tool but all logic lives in Select
      if (lastSelectedSelectTool == DrawTool.Lasso) selectTool(DrawTool.Lasso)
    }
    selectedObjects = objects
    selectedObjectsRef.value = objects
    c?.renderAll()
  }

  function enableOnInitEvents() {
    // empty
  }

  async function select(canvas: Canvas) {
    c!.isDrawingMode = false
    c!.selection = true
    setSelectionForObjects(c!.getObjects(), true)
    c?.renderAll()
  }

  function getSelectedObjects() {
    return selectedObjects
  }

  function setMultiSelectMode(mode: boolean) {
    multiSelectMode.value = mode
  }

  function setMouseClickTarget(obj: fabric.Object | undefined) {
    mouseClickTarget = obj
  }

  function getMouseClickTarget() {
    return mouseClickTarget
  }

  return {
    init,
    selectedObjectsRef,
    select,
    events,
    setSelectedObjects,
    getSelectedObjects,
    setMultiSelectMode,
    multiSelectMode,
    setMouseClickTarget,
    destroy,
    getMouseClickTarget
  }
})
