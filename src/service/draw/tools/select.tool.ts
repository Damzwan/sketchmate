import { Ref, ref } from 'vue'
import { DrawEvent, DrawTool, FabricEvent, SelectedObject, ToolService } from '@/types/draw.types'
import { isText, setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore, storeToRefs } from 'pinia'
import { useEventManager } from '@/service/draw/eventManager.service'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'

interface Select extends ToolService {
  selectedObjectsRef: Ref<Array<SelectedObject>>
  lastModifiedObjects: Ref<Array<SelectedObject>>
  setSelectedObjects: (obj: SelectedObject[]) => void
  getSelectedObjects: () => SelectedObject[]
  setMultiSelectMode: (mode: boolean) => void
  multiSelectMode: Ref<boolean>
  setMouseClickTarget: (obj: fabric.Object | undefined) => void
}

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined

  let selectedObjects: Array<SelectedObject> = []
  const { subscribe } = useEventManager()
  const selectedObjectsRef = ref<Array<SelectedObject>>([])
  const multiSelectMode = ref(false)
  const lastModifiedObjects = ref<Array<SelectedObject>>([])
  const history = useHistory()

  let mouseClickTarget: fabric.Object | undefined = undefined

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

        if (isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          const { isEditingText } = storeToRefs(useDrawStore())
          if (isEditingText.value) {
            if (text.text == '') history.actionWithoutHistory(() => c!.remove(text))
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

  function setSelectedObjects(objects: Array<SelectedObject> | undefined) {
    if (!objects) objects = []

    if (objects.length == 0) {
      c?.discardActiveObject()
    }
    selectedObjects = objects
    selectedObjectsRef.value = objects
    c?.renderAll()
  }

  function enableOnInitEvents() {
    subscribe({
      type: DrawEvent.SetModified,
      on: 'object:added',
      handler: setModifiedObjects
    })

    subscribe({
      type: DrawEvent.SetModified,
      on: 'object:modified',
      handler: setModifiedObjects
    })

    subscribe({
      type: DrawEvent.SetModified,
      on: 'object:removed',
      handler: e => {
        const objects = c!.getObjects()
        if (objects.length == 0) return
        lastModifiedObjects.value = [objects[objects.length - 1]]
        selectLastModifiedObjects(c!)
      }
    })
  }

  function setModifiedObjects(e: any) {
    if (!(e && e.target)) return
    const obj = e.target as any
    const { selectedTool } = useDrawStore()

    setObjectSelection(obj, selectedTool == DrawTool.Select)
    if (obj['_objects']) lastModifiedObjects.value = obj['_objects']
    else lastModifiedObjects.value = [obj]
  }

  function selectLastModifiedObjects(c: Canvas) {
    const ids: string[] = lastModifiedObjects.value.map((obj: any) => obj.id)
    const foundLastModifiedObjects = c.getObjects().filter((obj: any) => ids.includes(obj.id))
    if (foundLastModifiedObjects.length == 1) c.setActiveObject(foundLastModifiedObjects[0])
    else if (foundLastModifiedObjects.length > 1)
      c.setActiveObject(new fabric.ActiveSelection(foundLastModifiedObjects, { canvas: c! }))
    c.renderAll()
  }

  async function select(canvas: Canvas) {
    c!.isDrawingMode = false
    c!.selection = true
    setSelectionForObjects(c!.getObjects(), true)
    selectLastModifiedObjects(canvas)
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

  return {
    init,
    selectedObjectsRef,
    select,
    events,
    lastModifiedObjects,
    setSelectedObjects,
    getSelectedObjects,
    setMultiSelectMode,
    multiSelectMode,
    setMouseClickTarget,
    destroy
  }
})
