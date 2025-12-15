import { useDrawStore } from '@/draw/store/draw.store'
import * as fabric from 'fabric'
import { ActiveSelection, Canvas, FabricObject, Group } from 'fabric'

import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { v4 as uuidv4 } from 'uuid'
import { useSelect } from '@/draw/store/tools/select.store'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { viewSavedButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { HistoryEvent } from '@/draw/types/drawHistory.types'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'
import { canvasToBuffer } from '@/draw/helpers/export.helper'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'


export async function removeObjects(objects: FabricObject[]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  if (objects.length === 0) return

  c.remove(...objects)
  c.requestRenderAll()

  c.fire('objectsDeleted', { target: objects })
}

export async function removeSelectedObjects() {
  const { getSelectedObjects, unSelect } = useSelect()
  const selected = getSelectedObjects()
  unSelect()
  await removeObjects(selected)
}


// TODO this should be the function that should be used with everything...
export function setPropertiesOfObjects(params: DrawActionParams[DrawAction.SetPropertiesOfObject]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()


  params.objects.forEach((obj: any) => {
    obj.set(params.properties)
  })
  c.requestRenderAll()
  c.fire('objects:changed', { target: params.objects, parameters: params.properties })
}


function sortObjectsByLayer(objects: FabricObject[], c: Canvas, reverse = false) {
  const sorted = objects.sort((a: any, b: any) => {
    return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
  })
  return reverse ? sorted.reverse() : sorted
}

export function moveObjectToFront(params: DrawActionParams[DrawAction.MoveObjectToFront]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c)

  const prevObjectPositions: number[] = []

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    prevObjectPositions.push(currI)
    c.bringObjectToFront(obj)
  })
  c.requestRenderAll()
  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectToFront,
    prevObjectPositions
  })
}

export function moveObjectToBack(params: DrawActionParams[DrawAction.MoveObjectToBack]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c, true)

  const prevObjectPositions: number[] = []

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    prevObjectPositions.push(currI)
    c.sendObjectToBack(obj)
  })
  c.requestRenderAll()
  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectToBack,
    prevObjectPositions
  })
}

export function moveObjectUpOneLayer(params: DrawActionParams[DrawAction.MoveObjectUpOneLayer]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c)
  const objectsLength = c.getObjects().length - 1

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    c.moveObjectTo(obj, Math.min(currI + 1, objectsLength))
  })
  c.requestRenderAll()
  c.fire('layer:changed', { target: params.objects, type: DrawAction.MoveObjectUpOneLayer })
}

export function moveObjectDownOneLayer(params: DrawActionParams[DrawAction.MoveObjectUpOneLayer]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c, true)

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    c.moveObjectTo(obj, Math.max(currI - 1, 0))
  })
  c.requestRenderAll()
  c.fire('layer:changed', { target: params.objects, type: DrawAction.MoveObjectDownOneLayer })
}

export async function copyObjects(params: DrawActionParams[DrawAction.CopyObject]) {
  const { getCanvas } = useDrawStore()
  const { actionWithoutEvents } = useDrawEventManager()
  const c = getCanvas()

  const offsetX = 10
  const offsetY = 10


  let clonedObjects: FabricObject[] = []
  await actionWithoutEvents(async () => {
    c.discardActiveObject()
    clonedObjects = await Promise.all(params.objects.map((obj: FabricObject) => obj.clone()))

    for (const obj of clonedObjects) {
      obj.set({ left: obj.left! + offsetX, top: obj.top! + offsetY })
      obj.id = uuidv4()
      c.add(obj)
    }

  })

  const newActiveObject =
    clonedObjects.length == 1 ? clonedObjects[0] : new ActiveSelection(clonedObjects, { canvas: c })
  c.setActiveObject(newActiveObject) // TODO
  c.requestRenderAll()

  c.fire('objectsCopied', { target: clonedObjects })


}

export async function mergeObjects(params: DrawActionParams[DrawAction.Merge]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const { actionWithoutEvents } = useDrawEventManager()
  const { addToUndoStackWithResetRedo } = useDrawHistoryManager()

  await actionWithoutEvents(() => {
    c.discardActiveObject()

    const group = new Group(params.objects, { canvas: c })
    const highestIndex = Math.max(...params.objects.map(obj => c.getObjects().indexOf(obj)))

    group.id = uuidv4()
    params.objects.forEach((obj: any) => c.remove(obj))
    c.insertAt(highestIndex - params.objects.length + 1, group)
    c.setActiveObject(group)


    addToUndoStackWithResetRedo({ type: HistoryEvent.Merge, params: { objectIds: [group.id], group: null } })
    c.requestRenderAll()
  })
}

export async function flipXObjects(params: DrawActionParams[DrawAction.FlipX]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  setPropertiesOfObjects({ objects: params.objects, properties: { flipX: !params.objects[0].flipX } })
  c.fire('flip', { direction: 'flipX', target: params.objects })
}

export async function flipYObjects(params: DrawActionParams[DrawAction.FlipY]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  setPropertiesOfObjects({ objects: params.objects, properties: { flipY: !params.objects[0].flipY } })
  c.fire('flip', { direction: 'flipY', target: params.objects })
}

export async function unselectObjects() {
  const { unSelect } = useSelect()
  unSelect()
}

export async function saveFabricObject(params: DrawActionParams[DrawAction.SaveFabricObject]) {
  const { user } = useAuthStore()
  const { loadingText, isLoading } = storeToRefs(useDrawUIStore())
  const { createSaved } = useAPI()
  const { toast } = useToast()

  const { getCanvas } = useDrawStore()
  const c = getCanvas()


  isLoading.value = true
  loadingText.value = 'Saving drawing...'

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  if (params.objects.length > 1) {
    c.discardActiveObject()
  }

  // Calculate the bounding box for the objects
  params.objects.forEach(obj => {
    const boundingRect = obj.getBoundingRect() // Pass true to get a box that surrounds the entire object even if it's rotated
    minX = Math.min(minX, boundingRect.left)
    minY = Math.min(minY, boundingRect.top)
    maxX = Math.max(maxX, boundingRect.left + boundingRect.width)
    maxY = Math.max(maxY, boundingRect.top + boundingRect.height)
  })

  const width = maxX - minX
  const height = maxY - minY

  const tempCanvas = new fabric.StaticCanvas(undefined, { width: width, height: height })

  const clonedObjects = await Promise.all(params.objects.map((obj: FabricObject) => obj.clone()))

  // Add objects to the canvas
  clonedObjects.forEach(obj => {
    obj.set({
      left: obj.left! - minX,
      top: obj.top! - minY
    })

    tempCanvas.add(obj)
  })

  tempCanvas.renderAll()

  if (params.objects.length > 1) {
    c.setActiveObject(new ActiveSelection(params.objects, { canvas: c }))
  }

  // Save canvas as JSON and DataURL
  const json = JSON.stringify(tempCanvas.toJSON())
  const img = await canvasToBuffer(tempCanvas.toDataURL())

  const saved = await createSaved({ _id: user!._id, drawing: json, img: img })
  user!.saved.push(saved!)

  isLoading.value = false
  toast('Saved drawing', { buttons: [viewSavedButton], duration: ToastDuration.medium })


  c.requestRenderAll()
}

export async function addSavedFabricObjectToCanvas(params: DrawActionParams[DrawAction.AddSavedDrawingToCanvas]) {
  const { getCanvas } = useDrawStore()
  const { selectTool, selectedTool } = useToolSelection()
  const { actionWithoutEvents } = useDrawEventManager()

  const c = getCanvas()
  if (!c) return
  const json = params.json

  // Enliven
  let objects = await fabric.util.enlivenObjects<FabricObject>(json.objects)
  objects.forEach(obj => obj.set('id', uuidv4()))

  await actionWithoutEvents(() => {
    if (objects.length === 1) {
      const obj = objects[0]

      centerObjectInViewport(c, obj)
      c.add(obj)
      obj.setCoords()

      c.setActiveObject(obj)
    } else {
      const selection = new fabric.ActiveSelection(objects, { canvas: c })

      centerObjectInViewport(c, selection)

      selection.forEachObject(obj => {
        c.add(obj)
        obj.setCoords()
      })

      selection.removeAll()

    }
  })

  if (selectedTool !== DrawTool.Select) {
    selectTool(DrawTool.Select)
  }

  c.fire('objects:added', { target: objects })

  if (objects.length === 1) {
    c.setActiveObject(objects[0])
  } else {
    c.setActiveObject(new fabric.ActiveSelection(objects, { canvas: c }))

  }


  c.requestRenderAll()
}




