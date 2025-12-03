import { useDrawStore } from '@/store/draw/draw.store'
import { ActiveSelection, FabricObject, Group } from 'fabric'
import * as fabric from 'fabric'

import { DrawAction, DrawTool } from '@/types/draw.types'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { v4 as uuidv4 } from 'uuid'
import { canvasToBuffer, centerObjectInViewport } from '@/helper/draw/draw.helper'
import { useSelect } from '@/store/draw/tools/select.store'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { viewSavedButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'


export async function addObject(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const [obj] = await fabric.util.enlivenObjects<FabricObject>([params.obj])

  c.add(obj)
  c.requestRenderAll()
}

export async function removeObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  if (params.objects.length === 0) return

  c.remove(...params.objects)
  c.requestRenderAll()

  c.fire('objectsDeleted', { target: params.objects })

}

export async function removeSelectedObjects() {
  const { getSelectedObjects, unSelect } = useSelect()
  const selected = getSelectedObjects()
  unSelect()
  await removeObjects({ objects: selected })
}

export async function removeObjectByID(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  if (params.ids == 0) return

  const objects = c.getObjects().filter((obj) => params.ids.includes(obj.id))
  if (objects.length == 0) return

  c.remove(...objects)
  c.requestRenderAll()
}

export async function transformObjectById(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  params.objects.forEach((param: any) => {
    const obj = c.getObjects().find((obj) => obj.id == param.id)
    if (!obj) return
    obj.set({
      ...param.transform
    })
    obj.setCoords()
  })

  c.requestRenderAll()
}

// TODO this should be the function that should be used with everything...
export function setPropertiesOfObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const objects = params.convertObjectID
    ? params.objects.map((id: string) => c.getObjects().find((o) => o.id == id))
    : params.objects

  objects.forEach((obj: any) => {
    obj.set(params.parameters)
  })
  c.requestRenderAll()
  c.fire('objects:changed', { target: params.objects, parameters: params.parameters })
}

function processObjects(params: any, c: any) {
  return params.convertObjectID
    ? params.objects.map((id: string) => c.getObjects().find((o: FabricObject) => o.id === id))
    : params.objects
}

function sortObjectsByLayer(objects: any[], c: any, reverse = false) {
  const sorted = objects.sort((a: any, b: any) => {
    return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
  })
  return reverse ? sorted.reverse() : sorted
}

export function moveObjectToFront(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = processObjects(params, c)
  const sortedObjects = sortObjectsByLayer(objects, c)

  const prevObjectPositions: number[] = []

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    prevObjectPositions.push(currI)
    c.bringObjectToFront(obj)
  })
  c.requestRenderAll()
  c.fire('layer:changed', {
    target: objects,
    type: DrawAction.MoveObjectToFront,
    prevObjectPositions
  })
}

export function moveObjectToBack(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = processObjects(params, c)
  const sortedObjects = sortObjectsByLayer(objects, c, true)

  const prevObjectPositions: number[] = []

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    prevObjectPositions.push(currI)
    c.sendObjectToBack(obj)
  })
  c.requestRenderAll()
  c.fire('layer:changed', {
    target: objects,
    type: DrawAction.MoveObjectToBack,
    prevObjectPositions
  })
}

export function moveObjectUpOneLayer(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = processObjects(params, c)
  const sortedObjects = sortObjectsByLayer(objects, c)
  const objectsLength = c.getObjects().length - 1

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    c.moveObjectTo(obj, Math.min(currI + 1, objectsLength))
  })
  c.requestRenderAll()
  c.fire('layer:changed', { target: objects, type: DrawAction.MoveObjectUpOneLayer })
}

export function moveObjectDownOneLayer(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = processObjects(params, c)
  const sortedObjects = sortObjectsByLayer(objects, c, true)

  sortedObjects.forEach((obj: any) => {
    const currI = c.getObjects().indexOf(obj)
    c.moveObjectTo(obj, Math.max(currI - 1, 0))
  })
  c.requestRenderAll()
  c.fire('layer:changed', { target: objects, type: DrawAction.MoveObjectDownOneLayer })
}

export async function copyObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const { actionWithoutEvents } = useDrawEventManager()
  const c = getCanvas()
  const objects = processObjects(params, c)

  const offsetX = 10
  const offsetY = 10

  c.discardActiveObject()

  const clonedObjects = await Promise.all(objects.map((obj: FabricObject) => obj.clone()))

  for (const obj of clonedObjects) {
    obj.set({ left: obj.left! + offsetX, top: obj.top! + offsetY })
    obj.id = uuidv4()
    await actionWithoutEvents(() => {
      c.add(obj)
    })
  }

  c.fire('objectsCopied', { target: clonedObjects })

  const newActiveObject =
    clonedObjects.length == 1 ? clonedObjects[0] : new ActiveSelection(clonedObjects, { canvas: c })
  c.setActiveObject(newActiveObject) // TODO
  c.requestRenderAll()
}

// TODO this triggers bad events
export async function mergeObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = processObjects(params, c)

  const { actionWithoutEvents } = useDrawEventManager()
  const { addToUndoStack } = useDrawHistoryManager()

  await actionWithoutEvents(() => {
    c.discardActiveObject()

    const group = new Group(objects, { canvas: c })
    group.id = uuidv4()
    objects.forEach((obj: any) => c.remove(obj))
    c.add(group)
    c.setActiveObject(group)


    addToUndoStack({ type: 'merge', objects: [group.toJSON()] })
    c.requestRenderAll()
  })
}

export async function flipXObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const objects = processObjects(params, c)

  setPropertiesOfObjects({
    objects: objects,
    parameters: { flipX: !objects[0].flipX }
  })
  c.fire('flip', { direction: 'flipX', target: objects })
}

export async function flipYObjects(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const objects = processObjects(params, c)

  setPropertiesOfObjects({
    objects: objects,
    parameters: { flipY: !objects[0].flipY }
  })
  c.fire('flip', { direction: 'flipY', target: objects })
}

export async function unselectObjects() {
  const { unSelect } = useSelect()
  unSelect()
}

export async function saveFabricObject(options: any) {
  const { user } = useAuthStore()
  const { loadingText, isLoading } = storeToRefs(useDrawStore())
  const { createSaved } = useAPI()
  const { toast } = useToast()

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const objects: fabric.Object[] = options['objects']

  isLoading.value = true
  loadingText.value = 'Saving drawing...'

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  if (objects.length > 1) {
    c.discardActiveObject()
  }

  // Calculate the bounding box for the objects
  objects.forEach(obj => {
    const boundingRect = obj.getBoundingRect() // Pass true to get a box that surrounds the entire object even if it's rotated
    minX = Math.min(minX, boundingRect.left)
    minY = Math.min(minY, boundingRect.top)
    maxX = Math.max(maxX, boundingRect.left + boundingRect.width)
    maxY = Math.max(maxY, boundingRect.top + boundingRect.height)
  })

  const width = maxX - minX
  const height = maxY - minY

  const tempCanvas = new fabric.StaticCanvas(null, { width: width, height: height })

  const clonedObjects = await Promise.all(objects.map((obj: FabricObject) => obj.clone()))

  // Add objects to the canvas
  clonedObjects.forEach(obj => {
    obj.set({
      left: obj.left! - minX,
      top: obj.top! - minY
    })

    tempCanvas.add(obj)
  })

  tempCanvas.renderAll()

  if (objects.length > 1) {
    c.setActiveObject(new ActiveSelection(objects, { canvas: c }))
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

export async function addSavedFabricObjectToCanvas(options: any) {
  const { getCanvas, selectTool, selectedTool } = useDrawStore()
  const { actionWithoutEvents } = useDrawEventManager()

  const c = getCanvas()
  const json = options.json

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




