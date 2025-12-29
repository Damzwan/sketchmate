import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import * as fabric from 'fabric'
import { type Canvas, FabricObject, FabricObjectProps, Group } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { drawActionMapping } from '@/draw/config/action.config'
import { DrawAction } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import { toObjectsIds } from '@/draw/helpers/object.helper'

export async function redoObjectAdded(action: HistoryAction<HistoryEvent.ObjectAdded>) {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()

  const objectsToRedo = action.params.objectJSON
  if (!objectsToRedo || !objectsToRedo) return

  const [enlivened] = await fabric.util.enlivenObjects<FabricObject>(objectsToRedo)

  c.add(enlivened)
  c.requestRenderAll()

  addToUndoStack(action)
}

export async function redoObjectsAdded(action: HistoryAction<HistoryEvent.ObjectsAdded>) {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()

  const objectsToRedo = action.params.objectsJSON
  if (!objectsToRedo || objectsToRedo.length === 0) return

  const enlivened = await fabric.util.enlivenObjects<FabricObject>(objectsToRedo)

  enlivened.forEach(enlivened => {
    // When insertedIndex is 0, this condition evaluates to false, because 0 is a falsy value in JavaScript.
    if (enlivened.insertedIndex !== undefined && enlivened.insertedIndex !== null) c.insertAt(enlivened.insertedIndex, enlivened) // used for bucket fill
    else c.add(enlivened)
  })
  c.requestRenderAll()

  addToUndoStack(action)
}

export function applyObjectModification(
  canvas: Canvas,
  obj: FabricObject,
  diff: { left: number; top: number; scaleX: number; scaleY: number; angle: number }
): void {
  const targetObject: FabricObject | undefined = canvas
    .getObjects()
    .find((canvasObj) => (canvasObj as any).id === (obj as any).id)

  if (!targetObject) {
    console.error('No objects to redo')
    return
  }

  targetObject.set({
    left: (targetObject.left ?? 0) - diff.left,
    top: (targetObject.top ?? 0) - diff.top,
    scaleX: (targetObject.scaleX ?? 1) - diff.scaleX,
    scaleY: (targetObject.scaleY ?? 1) - diff.scaleY,
    angle: (targetObject.angle ?? 0) - diff.angle
  })

  targetObject.setCoords()

  const { updateQuadTree } = useDrawObjectManager()
  updateQuadTree(targetObject)
}

export async function redoObjectModified(action: HistoryAction<HistoryEvent.ObjectModified>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const canvas = getCanvas()

  const { updateVisibility } = useDrawObjectManager()

  const params = action.params

  const objects = getObjectsById(params.objectIds)

  if (!objects) {
    console.error('No objects to undo')
    return
  }

  let diff = params.diff
  diff = {
    left: -diff.left,
    top: -diff.top,
    angle: -diff.angle,
    scaleX: -diff.scaleX,
    scaleY: -diff.scaleY
  }

  objects.forEach(object => {
    applyObjectModification(canvas, object, diff)
  })


  updateVisibility()
  canvas.requestRenderAll()
  addToUndoStack(action)
}

export async function redoObjectsCopied(action: HistoryAction<HistoryEvent.ObjectsCopied>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const c = getCanvas()
  const enlivenedObjects = await fabric.util.enlivenObjects<FabricObject>(action.params.objectsJSON)
  c.add(...enlivenedObjects)
  c.requestRenderAll()
  addToUndoStack(action)
}

export async function redoObjectsDeleted(action: HistoryAction<HistoryEvent.ObjectsDeleted>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()
  const objects = getObjectsById(action.params.objectsJSON.map(item => item.id))
  c.remove(...objects)
  c.requestRenderAll()
  addToUndoStack(action)
}

export async function redoObjectStyle(action: HistoryAction<HistoryEvent.ObjectStyleChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { getObjectsById } = useDrawObjectManager()
  const { addToUndoStack } = useDrawHistoryManager()

  const prevStyles = action.params.prevStyles

  const canvasObjects = getObjectsById(action.params.objectIds)
  const newPrevStyles = canvasObjects.map((item) => {
    const newPrevStyle: any = {}
    Object.entries(prevStyles[0]).forEach(([key, value]) => {
      // @ts-ignore
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

  addToUndoStack({ ...action, params: { ...action.params, prevStyles: newPrevStyles } })
}

export async function redoFlipX(action: HistoryAction<HistoryEvent.FlipX>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.FlipX]({ objects: objects })
  addToUndoStack(action)
}

export async function redoFlipY(action: HistoryAction<HistoryEvent.FlipY>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()

  const objects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.FlipY]({ objects: objects })
  addToUndoStack(action)
}

export function getObjectDiff(
  obj: FabricObject,
  original: Partial<FabricObjectProps>,
  reverse = false
) {
  const diff = {
    left: (obj.left ?? 0) - (original.left ?? 0),
    top: (obj.top ?? 0) - (original.top ?? 0),
    scaleX: (obj.scaleX ?? 1) - (original.scaleX ?? 1),
    scaleY: (obj.scaleY ?? 1) - (original.scaleY ?? 1),
    angle: (obj.angle ?? 0) - (original.angle ?? 0)
  }

  if (reverse) {
    (Object.keys(diff) as (keyof typeof diff)[]).forEach((key) => {
      diff[key] = -diff[key]
    })
  }

  return diff
}


export function undoObjectAdded(action: HistoryAction<HistoryEvent.ObjectAdded>) {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()
  const c = getCanvas()


  const objectsToUndoJSON = action.params.objectJSON
  if (!objectsToUndoJSON) return

  const object = getObjectById(objectsToUndoJSON.id)
  if (!object) return
  c?.remove(object)


  c?.requestRenderAll()

  addToRedoStack(action)
}

export function undoObjectsAdded(action: HistoryAction<HistoryEvent.ObjectsAdded>) {
  const { getCanvas } = useDrawStore()
  const { unSelect } = useSelect()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()
  const c = getCanvas()

  unSelect()

  const objectsToUndoJSON = action.params.objectsJSON


  if (!objectsToUndoJSON || objectsToUndoJSON.length === 0) return

  // Remove each matching object by ID
  objectsToUndoJSON.forEach((obj) => {
    const canvasObj = getObjectById(obj.id)
    if (!canvasObj) return
    c?.remove(canvasObj)
  })

  c?.requestRenderAll()

  addToRedoStack(action)
}

export async function undoObjectModified(action: HistoryAction<HistoryEvent.ObjectModified>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()
  const { updateVisibility } = useDrawObjectManager()


  const canvas = getCanvas()

  if (!action.params.objectIds) {
    console.error('No objects to undo')
    return
  }

  const objectsToUndo = getObjectsById(action.params.objectIds)
  const diff = action.params.diff

  if (!objectsToUndo) return

  objectsToUndo.forEach((obj) => {
    applyObjectModification(canvas, obj, diff)
  })


  updateVisibility()
  canvas.requestRenderAll()

  addToRedoStack(action)
}

export async function undoFlipX(action: HistoryAction<HistoryEvent.FlipX>): Promise<void> {
  const { getObjectsById } = useDrawObjectManager()

  const { addToRedoStack } = useDrawHistoryManager()
  const canvasObjects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.FlipX]({ objects: canvasObjects })
  addToRedoStack(action)
}

export async function undoFlipY(action: HistoryAction<HistoryEvent.FlipY>): Promise<void> {
  const { getObjectsById } = useDrawObjectManager()
  const { addToRedoStack } = useDrawHistoryManager()
  const canvasObjects = getObjectsById(action.params.objectIds)
  drawActionMapping[DrawAction.FlipY]({ objects: canvasObjects })
  addToRedoStack(action)
}

export async function undoObjectsCopied(action: HistoryAction<HistoryEvent.ObjectsCopied>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()

  const { unSelect } = useSelect()
  const c = getCanvas()
  const canvasObjects = getObjectsById(toObjectsIds(action.params.objectsJSON as FabricObject[]))
  c.remove(...canvasObjects)
  unSelect()
  c.requestRenderAll()
  addToRedoStack(action)
}

export async function undoObjectsDeleted(action: HistoryAction<HistoryEvent.ObjectsDeleted>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()

  const c = getCanvas()

  const objects = action.params.objectsJSON

  const enlivenedObjects = await fabric.util.enlivenObjects<FabricObject>(objects)
  c.add(...enlivenedObjects)
  c.requestRenderAll()
  addToRedoStack(action)
}

export async function undoObjectStyle(action: HistoryAction<HistoryEvent.ObjectStyleChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()


  const prevStyles = action.params.prevStyles

  const canvasObjects = getObjectsById(action.params.objectIds)
  const newPrevStyles = canvasObjects.map((item) => {
    const newPrevStyle: any = {}
    Object.entries(prevStyles[0]).forEach(([key, value]) => {
      // @ts-ignore
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

  action.params.prevStyles = newPrevStyles

  c.requestRenderAll()


  addToRedoStack({ ...action })
}

export function undoMerge(action: HistoryAction<HistoryEvent.Merge>) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()


  // Find merged group object on canvas
  const objects = getObjectsById(action.params.objectIds)
  const mergedObject = objects[0] as fabric.Group
  let mergedObjectIndex = c.getObjects().indexOf(mergedObject)


  const newObjectsIds: string[] = []

  c.remove(mergedObject)

  // Add all child objects back to canvas with absolute positions
  mergedObject.forEachObject((obj, i) => {
    mergedObject.remove(obj)
    c.insertAt(mergedObjectIndex + i, obj)
    obj.setCoords()
    newObjectsIds.push(obj.id)
  })


  action.params.group = mergedObject.toJSON()
  action.params.objectIds = newObjectsIds


  // Prepare redo entry with absolute coordinates
  addToRedoStack({ ...action })
  c.requestRenderAll()
}

export async function redoMerge(action: HistoryAction<HistoryEvent.Merge>) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectsById } = useDrawObjectManager()


  const group = action.params.group
  const canvasObjects = getObjectsById(action.params.objectIds)
  const [enlivenedGroup] = await fabric.util.enlivenObjects<Group>([group])

  const highestIndex = Math.max(...canvasObjects.map(obj => c.getObjects().indexOf(obj)))
  c.insertAt(highestIndex - canvasObjects.length + 1, enlivenedGroup)

  for (const obj of canvasObjects) {
    if (!obj) return
    c.remove(obj)
    enlivenedGroup.add(obj)
  }


  c.setActiveObject(enlivenedGroup)
  c.requestRenderAll()

  addToUndoStack({ ...action, params: { ...action.params, objectIds: [enlivenedGroup.id] } })
}