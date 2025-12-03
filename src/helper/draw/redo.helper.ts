import { useDrawStore } from '@/store/draw/draw.store'
import * as fabric from 'fabric'
import { HistoryAction, useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { FabricImage, FabricObject, Group, IText } from 'fabric'
import { DrawAction } from '@/types/draw.types'
import { handleErasedAction, undoActiveSelection, undoSingleObject } from '@/helper/draw/undoredo.helper'
import { fullErase } from '@/helper/draw/actions/erase.action'
import { EventBus } from '@/main'
import { drawActionMapping } from '@/config/draw/drawAction.config'
import { mergeObjects } from '@/helper/draw/actions/object.action'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'


export async function redoObjectAdded(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()

  const objectsToRedo = params.objects
  if (!objectsToRedo || objectsToRedo.length === 0) return

  const enlivened = await fabric.util.enlivenObjects<FabricObject>(objectsToRedo)

  c.add(...enlivened)
  c.requestRenderAll()

  addToUndoStack({
    ...params,
    objects: enlivened.map((o) => o.toJSON())
  })
}


export async function redoObjectModified(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const canvas = getCanvas()

  if (!params.objects.length) {
    console.error('No objects to undo')
    return
  }

  const objectToUndo = params.objects[0]
  let { diff } = params.options
  diff = {
    left: -diff.left,
    top: -diff.top,
    angle: -diff.angle,
    scaleX: -diff.scaleX,
    scaleY: -diff.scaleY
  }

  if (objectToUndo.isType('activeselection')) {
    undoActiveSelection(canvas, objectToUndo as fabric.ActiveSelection, diff)
  } else {
    undoSingleObject(canvas, objectToUndo, diff)
  }

  canvas.requestRenderAll()

  addToUndoStack({
    type: params.type,
    objects: [objectToUndo.toJSON()],
    options: params.options
  })
}

export async function redoErased(params: HistoryAction): Promise<void> {
  handleErasedAction(params, 'redo')
}

export async function redoFullErase(params: HistoryAction) {
  const { addToUndoStack } = useDrawHistoryManager()
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const prevCanvasJSON = c.toJSON() // we have to do this since events are not registered in undo/redo
  fullErase()
  addToUndoStack({ ...params, options: { prevCanvasJSON } })
}

export async function redoMoveObjectsToFront(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()

  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const prevObjectPositions = canvasObjects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectToFront]({ objects: canvasObjects })

  addToUndoStack({ type: params.type, objects: params.objects, options: { prevObjectPositions } })
}

export async function redoMoveObjectsToBack(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()

  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const prevObjectPositions = canvasObjects.map((o) => c.getObjects().indexOf(o!))
  drawActionMapping[DrawAction.MoveObjectToBack]({ objects: canvasObjects })

  addToUndoStack({ type: params.type, objects: params.objects, options: { prevObjectPositions } })
}

export async function redoMoveObjectsUpOneLayer(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects: canvasObjects })
  addToUndoStack({ type: params.type, objects: params.objects })
}

export async function redoMoveObjectsDownOneLayer(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects: canvasObjects })
  addToUndoStack({ type: params.type, objects: params.objects })
}

export async function redoFlipX(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.FlipX]({ objects: canvasObjects })
  addToUndoStack({ type: params.type, objects: params.objects })
}

export async function redoFlipY(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  drawActionMapping[DrawAction.FlipY]({ objects: canvasObjects })
  addToUndoStack({ type: params.type, objects: params.objects })
}

export async function redoObjectsCopied(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const enlivenedObjects = await fabric.util.enlivenObjects<FabricObject>(params.objects)
  c.add(...enlivenedObjects)
  c.requestRenderAll()
  addToUndoStack({ type: params.type, objects: enlivenedObjects })
}

export async function redoObjectsDeleted(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id)).filter(o => !!o)
  c.remove(...canvasObjects)
  c.requestRenderAll()
  addToUndoStack({ ...params, objects: params.objects.map((o) => o.toJSON()) })
}

export async function redoChangeBackgroundColor(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const previousColor = c.backgroundColor
  c.backgroundColor = params.options.previousColor
  params.options.previousColor = previousColor

  c.requestRenderAll()
  addToUndoStack(params)
}

export async function redoTextChanged(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))

  const staticTextObject = params.objects[0] as any
  const textObject = canvasObjects[0] as IText


  const prevText = textObject.text
  textObject.set('text', staticTextObject.oldText)
  textObject.oldText = prevText


  c.requestRenderAll()
  addToUndoStack({ ...params, objects: [textObject].map((o) => o.toJSON()) })
}

export async function redoTextStyleChanged(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()


  const c = getCanvas()
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))

  const textObject = canvasObjects[0] as IText

  const prevStyle: any = {}

  Object.entries(params.options.prevStyle).forEach(([key, value]) => {
    prevStyle[key] = textObject[key]
    textObject.set(key, value)
  })

  addToUndoStack({ ...params, objects: [textObject].map((o) => o.toJSON()), options: { prevStyle: prevStyle } })

}

export async function redoPolygonCreation(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()

  const c = getCanvas()
  const shape: any = c.getObjects().find((obj: any) => !!obj.isCreating)


  const currObj: any = c?.getObjects().find(o => o.id == shape.id)
  const points = currObj.points
  const lastPoint = params.options.lastPoint
  points.push(lastPoint)

  currObj.set({ points })
  currObj.dirty = true

  c?.requestRenderAll()
  EventBus.emit('rerenderPolygon')
  addToUndoStack({ ...params, objects: [currObj].map((o) => o.toJSON()) })
}

export async function redoObjectStyle(params: HistoryAction): Promise<void> {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToUndoStack } = useDrawHistoryManager()

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

  addToUndoStack({ ...params, options: { prevStyles: newPrevStyles } })
}

export function redoImgFilter(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToUndoStack } = useDrawHistoryManager()


  const prevFilter = params.options.prevFilter
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const img = canvasObjects[0] as FabricImage

  if (prevFilter) {
    img.filters?.push(prevFilter)
    addToUndoStack({ ...params, options: { prevFilter: null } })
  } else {
    const f = img.filters?.pop()
    addToUndoStack({ ...params, options: { prevFilter: f } })
  }

  img.applyFilters()
  c.requestRenderAll()
}

export async function redoMerge(params: HistoryAction) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToUndoStack } = useDrawHistoryManager()

  const group = params.options.group
  const canvasObjects = params.objects.map((o) => c.getObjects().find((oo) => o.id == oo.id))
  const [enlivenedGroup] = await fabric.util.enlivenObjects<Group>([group])

  c.add(enlivenedGroup)

  for (const obj of canvasObjects) {
    if (!obj) return
    c.remove(obj)
    enlivenedGroup.add(obj)
  }


  c.setActiveObject(enlivenedGroup)
  c.requestRenderAll()

  addToUndoStack({ type: 'merge', objects: [enlivenedGroup.toJSON()] })
}
