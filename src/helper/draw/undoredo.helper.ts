import { ActiveSelection, type Canvas, type FabricObject } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { HistoryAction, useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'


export function undoSingleObject(
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
}

export function applyTransformations(
  selection: ActiveSelection,
  diff: { left: number; top: number; scaleX: number; scaleY: number; angle: number },
  hasActiveObject: boolean
): void {
  if (diff.angle === 0 && diff.scaleX === 0) {
    selection.set({
      left: selection.left - diff.left,
      top: selection.top - diff.top
    })
  } else if (Math.abs(diff.angle) > 0) {
    selection.rotate((selection.angle ?? 0) - diff.angle)
  } else if (Math.abs(diff.scaleX) > 0) {
    if (hasActiveObject) {
      selection.set({
        scaleX: (selection.scaleX ?? 1) - diff.scaleX,
        scaleY: (selection.scaleY ?? 1) - diff.scaleY
      })
    } else {
      selection.scale(1 / (1 + diff.scaleX))
    }
  }
}

export function undoActiveSelection(
  canvas: Canvas,
  activeSelection: ActiveSelection,
  diff: { left: number; top: number; scaleX: number; scaleY: number; angle: number }
): void {
  const objectIds: string[] = activeSelection._objects.map((obj: any) => obj.id)
  const allCanvasObjects: FabricObject[] = canvas.getObjects()
  const selectedObjects: FabricObject[] = allCanvasObjects.filter((obj: any) =>
    objectIds.includes(obj.id)
  )

  if (selectedObjects.length !== objectIds.length) {
    console.error('Some objects from the selection are missing')
    return
  }

  const activeObject = canvas.getActiveObject()
  const selection: ActiveSelection =
    (activeObject as ActiveSelection) ?? new ActiveSelection(selectedObjects, { canvas })

  applyTransformations(selection, diff, !!activeObject)
  canvas.setActiveObject(selection)

  if (!activeObject) {
    canvas.discardActiveObject()
  } else {
    selection.setCoords()
  }
}

export function handleErasedAction(params: HistoryAction, action: 'undo' | 'redo'): void {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack, addToUndoStack } = useDrawHistoryManager()

  const canvasObjects = params.objects.map((obj) => c.getObjects().find((o) => o.id == obj.id)) as FabricObject[]

  for (let i = 0; i < params.objects.length; i++) {
    const canvasObj = canvasObjects[i]
    if (!canvasObj) continue

    canvasObj.set({
      clipPath: params.objects[i].prevClipPath,
      prevClipPath: params.objects[i].clipPath?.toJSON()
    })
  }

  c.requestRenderAll()

  const stackAction = action === 'undo' ? addToRedoStack : addToUndoStack
  stackAction({ ...params, objects: canvasObjects.map((o) => o.toJSON()) })
}

export function moveObjectsToOriginalPosition(c: Canvas, params: any) {
  const prevObjectPositions = params.options.prevObjectPositions

  const canvasObjects = params.objects.map((o: any) => c.getObjects().find(oo => o.id == oo.id))

  for (let i = 0; i < canvasObjects.length; i++) {
    const obj = canvasObjects[i]
    c.moveObjectTo(obj!, prevObjectPositions[i])
  }

  c.requestRenderAll()
}
