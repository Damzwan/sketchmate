import { Ref, ref } from 'vue'
import { DrawEvent, FabricEvent, SelectedObject, ToolService } from '@/types/draw.types'
import { isText, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore, storeToRefs } from 'pinia'
import { useEventManager } from '@/service/draw/eventManager.service'
import { useDrawStore } from '@/store/draw/draw.store'

interface Select extends ToolService {
  selectedObjectsRef: Ref<Array<SelectedObject>>
  lastModifiedObjects: Ref<Array<SelectedObject>>
  setSelectedObjects: (obj: SelectedObject[]) => void
  getSelectedObjects: () => SelectedObject[]
}

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined

  let selectedObjects: Array<SelectedObject> = []
  const { subscribe, unsubscribe } = useEventManager()
  const selectedObjectsRef = ref<Array<SelectedObject>>([])
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
      handler: () => {
        if (isText(selectedObjects)) {
          const text = selectedObjects[0] as IText
          const { isEditingText } = storeToRefs(useDrawStore())
          if (isEditingText.value) {
            if (text.text == '') c!.remove(text)
            else {
              c?.setActiveObject(text)
              isEditingText.value = false
            }
            return
          }
        }
        setSelectedObjects([])
      },
      type: DrawEvent.SetSelectedObjects
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
    enableOnInitEvents()
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

  return {
    init,
    selectedObjectsRef,
    select,
    events,
    lastModifiedObjects,
    setSelectedObjects,
    getSelectedObjects
  }
})
