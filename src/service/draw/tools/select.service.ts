import { Ref, ref } from 'vue'
import { DrawEvent, FabricEvent, SelectedObject, ToolService } from '@/types/draw.types'
import { findObjectById, isText, setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore, storeToRefs } from 'pinia'
import { useEventManager } from '@/service/draw/eventManager.service'
import { useDrawStore } from '@/store/draw/draw.store'

interface Select extends ToolService {
  lastSelectedObjects: Ref<Array<SelectedObject>>
  selectedObjectsRef: Ref<Array<SelectedObject>>
  lastModifiedObjects: Ref<Array<SelectedObject>>
  init: (c: Canvas) => void
  setSelectedObjects: (obj: SelectedObject[]) => void
  getSelectedObjects: () => SelectedObject[]
}

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined

  let selectedObjects: Array<SelectedObject> = []
  const { subscribe } = useEventManager()
  const selectedObjectsRef = ref<Array<SelectedObject>>([])
  const lastSelectedObjects = ref<Array<SelectedObject>>([])
  const lastModifiedObjects = ref<Array<SelectedObject>>([])

  const events: FabricEvent[] = [
    {
      on: 'selection:created',
      handler: e => setSelectedObjects(e.selected),
      type: DrawEvent.SetSelectedObjects
    },
    {
      on: 'selection:updated',
      handler: e => setSelectedObjects(e.selected),
      type: DrawEvent.SetSelectedObjects
    },
    {
      on: 'selection:cleared',
      handler: () => setSelectedObjects([]),
      type: DrawEvent.SetSelectedObjects
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
    enableOnInitEvents()
  }

  async function setSelectedObjects(objects: Array<SelectedObject> | undefined) {
    if (!objects) objects = []
    lastSelectedObjects.value = selectedObjects

    if (objects.length == 0) {
      if (isText(lastSelectedObjects.value)) {
        const text = lastSelectedObjects.value[0] as IText
        const { isEditingText } = storeToRefs(useDrawStore())
        if (isEditingText.value) {
          c?.setActiveObject(text)
          isEditingText.value = false
          return
        } else c?.discardActiveObject()
      } else c?.discardActiveObject()
    }
    selectedObjects = objects
    selectedObjectsRef.value = objects
    c?.renderAll()
  }

  function enableOnInitEvents() {
    subscribe({
      type: DrawEvent.SetModified,
      on: 'object:added',
      handler: e => {
        const obj = e.target as fabric.Object
        lastModifiedObjects.value = [obj]
      }
    })

    subscribe({
      type: DrawEvent.SetModified,
      on: 'object:modified',
      handler: e => {
        const obj = e.target as fabric.Object
        lastModifiedObjects.value = [obj]
      }
    })
  }

  function selectLastModifiedObjects(c: Canvas) {
    const ids: string[] = lastModifiedObjects.value.map((obj: any) => obj.id)
    const foundLastModifiedObjects = c.getObjects().filter((obj: any) => ids.includes(obj.id))
    if (foundLastModifiedObjects.length == 1) c.setActiveObject(foundLastModifiedObjects[0])
    else if (foundLastModifiedObjects.length > 1)
      c.setActiveObject(new fabric.ActiveSelection(foundLastModifiedObjects, { canvas: c! }))
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

  return {
    init,
    selectedObjectsRef,
    lastSelectedObjects,
    select,
    events,
    lastModifiedObjects,
    setSelectedObjects,
    getSelectedObjects
  }
})
