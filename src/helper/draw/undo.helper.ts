import { HistoryAction, useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { useDrawStore } from '@/store/draw/draw.store'
import {
  handleErasedAction,
  moveObjectsToOriginalPosition,
  undoActiveSelection,
  undoSingleObject
} from '@/helper/draw/undoredo.helper'
import * as fabric from 'fabric'
import { ActiveSelection, FabricImage, FabricObject, Group, IText } from 'fabric'
import { DrawAction } from '@/types/draw.types'
import { useSelect } from '@/store/draw/tools/select.store'
import { EventBus } from '@/main'
import { drawActionMapping } from '@/config/draw/drawAction.config'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'


export function undoObjectAdded(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const { unSelect } = useSelect()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()

  unSelect()

  const objectsToUndo = params.objects


  if (!objectsToUndo || objectsToUndo.length === 0) return

  // Remove each matching object by ID
  objectsToUndo.forEach((obj) => {
    const canvasObj = c?.getObjects().find((o) => o.id === obj.id)
    if (canvasObj) {
      c?.remove(canvasObj)
    }
  })

  c?.requestRenderAll()

  // Save JSON version of all removed objects
  addToRedoStack({
    ...params,
    objects: objectsToUndo.map((o) => o.toJSON())
  })
}


export async function undoObjectModified(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const canvas = getCanvas()

  if (!params.objects.length) {
    console.error('No objects to undo')
    return
  }

  const objectToUndo = params.objects[0]
  const { diff } = params.options

  if (objectToUndo.isType('activeselection')) {
    undoActiveSelection(canvas, objectToUndo as ActiveSelection, diff)
  } else {
    undoSingleObject(canvas, objectToUndo, diff)
  }

  canvas.requestRenderAll()

  addToRedoStack({
    type: params.type,
    objects: [objectToUndo.toJSON()],
    options: params.options
  })
}

export async function undoErased(params: HistoryAction): Promise<void> {
  handleErasedAction(params, 'undo')
}

export async function undoFullErase(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()

  await c.loadFromJSON(params.options.prevCanvasJSON)
  c.requestRenderAll()
  addToRedoStack({ type: 'fullErase', objects: [] })
}

export async function undoMoveObjectsToFront(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  moveObjectsToOriginalPosition(c, params)
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoMoveObjectsToBack(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  moveObjectsToOriginalPosition(c, params)
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoMoveObjectsUpOneLayer(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects: canvasObjects })
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoMoveObjectsDownOneLayer(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects: canvasObjects })
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoFlipX(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.FlipX]({ objects: canvasObjects })
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoFlipY(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.FlipY]({ objects: canvasObjects })
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoObjectsCopied(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { unSelect } = useSelect()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id)) as FabricObject[]
  c.remove(...canvasObjects)
  unSelect()
  c.requestRenderAll()
  addToRedoStack({ type: params.type, objects: params.objects })
}

export async function undoObjectsDeleted(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()

  const c = getCanvas()

  const objects = params.objects

  const enlivenedObjects = await fabric.util.enlivenObjects<FabricObject>(objects)
  c.add(...enlivenedObjects)
  c.requestRenderAll()
  addToRedoStack({ ...params, objects: params.objects.map((o) => o.toJSON()) })
}

export async function undoChangeBackgroundColor(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const previousColor = c.backgroundColor
  c.backgroundColor = params.options.previousColor
  params.options.previousColor = previousColor

  c.requestRenderAll()
  addToRedoStack(params)
}

export async function undoTextChanged(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const staticTextObject = params.objects[0] as any
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))

  const textObject = canvasObjects[0] as IText

  const prevText = textObject.text
  textObject.set('text', staticTextObject.oldText)
  textObject.oldText = prevText


  c.requestRenderAll()
  addToRedoStack({ ...params, objects: [textObject].map((o) => o.toJSON()) })
}

export async function undoTextStyleChanged(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))

  const textObject = canvasObjects[0] as any
  const prevStyle: any = {}

  Object.entries(params.options.prevStyle).forEach(([key, value]) => {
    prevStyle[key] = textObject[key]
    textObject.set(key, value)
  })

  addToRedoStack({ ...params, objects: [textObject].map((o) => o.toJSON()), options: { prevStyle: prevStyle } })
}

export async function undoPolygonCreation(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()

  const c = getCanvas()
  const shape: any = c.getObjects().find((obj: any) => !!obj.isCreating)


  const currObj: any = c?.getObjects().find(o => o.id == shape.id)
  const points = currObj.points
  const lastPoint = points[points.length - 1]
  points.pop()

  currObj.set({ points })
  currObj.dirty = true

  c?.requestRenderAll()
  EventBus.emit('rerenderPolygon')
  addToRedoStack({ ...params, objects: [currObj].map((o) => o.toJSON()), options: { lastPoint: lastPoint } })
}

export async function undoObjectStyle(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()

  const prevStyles = params.options.prevStyles

  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const newPrevStyles = canvasObjects.map((item) => {
    const newPrevStyle: any = {}
    Object.entries(prevStyles[0]).forEach(([key, value]) => {
      newPrevStyle[key] = item[key]
    })
    return newPrevStyle
  })

  for (let i = 0; i < canvasObjects.length; i++) {
    const canvasObject = canvasObjects[i]
    if (!canvasObject) return
    const style = prevStyles[i]
    canvasObject.set(style)
  }

  c.requestRenderAll()


  addToRedoStack({ ...params, options: { prevStyles: newPrevStyles } })
}

export function undoImgFilter(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()


  const prevFilter = params.options.prevFilter
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const img = canvasObjects[0] as FabricImage

  if (prevFilter) {
    img.filters?.push(prevFilter)
    addToRedoStack({ ...params, options: { prevFilter: null } })
  } else {
    const f = img.filters?.pop()
    addToRedoStack({ ...params, options: { prevFilter: f } })
  }

  img.applyFilters()
  c.requestRenderAll()
}

export function undoMerge(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()

  // Find merged group object on canvas
  const objects = params.objects.map(o =>
    c.getObjects().find(oo => o.id === oo.id)
  )
  const mergedObject = objects[0] as fabric.Group


  const newObjects: FabricObject[] = []

  c.remove(mergedObject)

  // Add all child objects back to canvas with absolute positions
  mergedObject.forEachObject(obj => {
    mergedObject.remove(obj)
    c.add(obj)
    obj.setCoords()
    newObjects.push(obj)
  })


  // Prepare redo entry with absolute coordinates
  addToRedoStack({
    type: 'merge',
    objects: newObjects.map(o => o.toJSON()),
    options: { group: mergedObject.toJSON() }
  })

  c.requestRenderAll()
}
