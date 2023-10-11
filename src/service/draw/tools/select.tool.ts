import { Ref, ref } from 'vue'
import { DrawEvent, DrawTool, FabricEvent, SelectedObject, ToolService } from '@/types/draw.types'
import { exitEditing, isPolygon, isText, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore, storeToRefs } from 'pinia'
import { useEventManager } from '@/service/draw/eventManager.service'
import { useDrawStore } from '@/store/draw/draw.store'
import { disableEditing } from '@/helper/draw/actions/polyEdit.action'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { EventBus } from '@/main'

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

  const removeTimeout: ReturnType<typeof setTimeout> | null = null
  let unselectInMultiselectTimeout: any
  let functionToCall: any

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
      type: DrawEvent.SetSelectedObjects,
      on: 'mouse:up',
      handler: async (o: any) => {
        const currentTimestamp = new Date().getTime()
        if (functionToCall && currentTimestamp - lastTapTimestamp < 200) await functionToCall()
        functionToCall = undefined
      }
    },
    {
      type: DrawEvent.SetSelectedObjects,
      on: 'mouse:down:before',
      handler: async (o: any) => {
        const { isEditingText } = useDrawStore()

        if (removeTimeout || isEditingText) return
        const activeObject = c!.getActiveObject()

        lastTapTimestamp = new Date().getTime()

        if (!multiSelectMode.value && activeObject && !o.e.shiftKey) {
          const a = c?.getActiveObjects()
          if (!a || isText(a)) return
          functionToCall = () => {
            if (!c?.getActiveObject()) return
            const pointer = c!.getPointer(o.e, true)

            objectsStack = c!.getObjects().filter(obj => {
              const isObjectNotSelected = !a?.includes(obj)
              const isPointerWithinObject = obj.containsPoint(
                pointer as any,
                (obj as any)._getImageLines(obj.oCoords),
                true
              )
              return isPointerWithinObject && isObjectNotSelected
            })
            if (objectsStack.length == 0) return

            objectsStack.sort((a, b) => {
              return b.isContainedWithinObject(a) ? 1 : -1
            })

            // special edge case that probably collides with internal fabricjs logic
            // Only happens in pc mode
            c!.setActiveObject(objectsStack[0])
          }
        } else if (multiSelectMode.value) {
          const a = c?.getActiveObjects()
          functionToCall = () => {
            actionWithoutEvents(async () => {
              if (!c?.getActiveObject()) return
              const aa = c?.getActiveObjects()
              c?.discardActiveObject()
              c?.getObjects().forEach(o => o.setCoords())
              unselectInMultiselectTimeout = undefined
              const pointer = c!.getPointer(o.e, true)
              const point = new fabric.Point(pointer.x, pointer.y)
              const selectedObjectsInPointer = c!
                .getObjects()
                .filter(obj => obj.containsPoint(point, (obj as any)._getImageLines(obj.oCoords), true))

              const newObjectsToAdd = selectedObjectsInPointer.filter(
                obj =>
                  !a!.includes(obj) &&
                  a?.every(obj2 =>
                    obj2.containsPoint(point, (obj2 as any)._getImageLines(obj2.oCoords), true)
                      ? obj.isContainedWithinObject(obj2)
                      : true
                  )
              )

              if (newObjectsToAdd.length > 0) {
                newObjectsToAdd.sort((a, b) => {
                  return b.isContainedWithinObject(a) ? 1 : -1
                })
                const newSelectedObjects = [...(a ? a : []), ...newObjectsToAdd.slice(0, 1)]
                c?.setActiveObject(
                  new fabric.ActiveSelection(newSelectedObjects, {
                    canvas: c
                  })
                )
                setSelectedObjects(newSelectedObjects)
                c?.requestRenderAll()
                return
              }
              if (selectedObjectsInPointer.length == 0) {
                c?.setActiveObject(
                  new fabric.ActiveSelection(aa, {
                    canvas: c
                  })
                )
                setSelectedObjects(aa)
                c?.requestRenderAll()
                return
              }
              const objectsToUnselect = selectedObjectsInPointer.filter(obj => a!.includes(obj))

              objectsToUnselect.sort((a, b) => {
                return b.isContainedWithinObject(a) ? 1 : -1
              })
              await removeObjectFromMultiSelect(objectsToUnselect[0])
            })
          }
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'object:moving',
      handler: o => {
        if (unselectInMultiselectTimeout) {
          const xChange = Math.abs(o.transform.original.left - o.target.left)
          const yChange = Math.abs(o.transform.original.top - o.target.top)
          if (xChange <= 0.5 && yChange <= 0.5) return
          clearUnSelectTimeout()
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'object:rotating',
      handler: () => {
        if (unselectInMultiselectTimeout) {
          clearUnSelectTimeout()
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'object:scaling',
      handler: () => {
        if (unselectInMultiselectTimeout) {
          clearUnSelectTimeout()
        }
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'mouse:down:before',
      handler: (o: any) => {
        setMouseClickTarget(o.target)
      }
    },
    {
      type: DrawEvent.SetModified,
      on: 'touch:longpress',
      handler: (o: any) => {
        if (multiSelectMode.value) return
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
    EventBus.on('rotating', clearUnSelectTimeout)
    EventBus.on('scaling', clearUnSelectTimeout)
  }

  function clearUnSelectTimeout() {
    clearTimeout(unselectInMultiselectTimeout)
    unselectInMultiselectTimeout = undefined
    functionToCall = undefined
  }

  function destroy() {
    c = undefined
  }

  function handleSelect() {
    let object: any = c?.getActiveObjects()
    const { actionWithoutEvents } = useEventManager()

    if (multiSelectMode.value && object && selectedObjects && mouseClickTarget) {
      object = new fabric.ActiveSelection([...selectedObjects, ...object], { canvas: c })
      actionWithoutEvents(() => c?.setActiveObject(object))
    }

    if (object instanceof fabric.Group) setSelectedObjects(object.getObjects())
    else setSelectedObjects(object)
  }

  async function removeObjectFromMultiSelect(obj: fabric.Object) {
    await actionWithoutEvents(() => {
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

  async function select() {
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
