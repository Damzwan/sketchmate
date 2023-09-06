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
  const doubleTapTimeout = 200
  let unselectInMultiselectTimeout: any

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
      on: 'mouse:down',
      handler: async (o: any) => {
        if (removeTimeout) return
        const activeObject = c!.getActiveObject()

        const currentTimestamp = new Date().getTime()
        const isDoubleTap = currentTimestamp - lastTapTimestamp < doubleTapTimeout
        lastTapTimestamp = currentTimestamp

        if (isDoubleTap && activeObject) {
          clearTimeout(unselectInMultiselectTimeout)
          unselectInMultiselectTimeout = undefined
          // Always compute the objects stack based on the currently active object
          objectsStack = c!.getObjects().filter(obj => activeObject.intersectsWithObject(obj))
          if (objectsStack.length == 0) return

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
          if (multiSelectMode.value && selectedObjects.length == 1) {
            removeTimeout = setTimeout(() => {
              c!.setActiveObject(objectsStack[currentObjectIndex])
              removeTimeout = null
            }, 300)
          } else c!.setActiveObject(objectsStack[currentObjectIndex])
        } else if (multiSelectMode.value && activeObject) {
          if (unselectInMultiselectTimeout) return
          unselectInMultiselectTimeout = setTimeout(() => {
            actionWithoutEvents(async () => {
              const a = c?.getActiveObjects()
              c?.discardActiveObject()
              c?.getObjects().forEach(o => o.setCoords())
              unselectInMultiselectTimeout = undefined
              const pointer = c!.getPointer(o.e)
              const point = new fabric.Point(pointer.x, pointer.y)
              const selectedObjectsInPointer = c!
                .getObjects()
                .filter(
                  obj => obj.containsPoint(point, (obj as any)._getImageLines(obj.oCoords), true) && a!.includes(obj)
                )

              if (selectedObjectsInPointer.length == 0) return
              selectedObjectsInPointer.sort((a, b) => {
                const centerA = a.getCenterPoint()
                const centerB = b.getCenterPoint()
                const distanceA = distance({ x: centerA.x, y: centerA.y }, { x: pointer.x, y: pointer.y })
                const distanceB = distance({ x: centerB.x, y: centerB.y }, { x: pointer.x, y: pointer.y })

                return distanceA - distanceB
              })
              await removeObjectFromMultiSelect(selectedObjectsInPointer[0])
            })
          }, doubleTapTimeout)
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
          clearTimeout(unselectInMultiselectTimeout)
          unselectInMultiselectTimeout = undefined
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
        if (multiSelectMode.value) return
        const touchType = o.e.type
        if (touchType != 'touchstart') return

        if (isText(selectedObjectsRef.value)) {
          console.log('si')
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
