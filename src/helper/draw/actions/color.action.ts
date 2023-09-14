import { useSelect } from '@/service/draw/tools/select.tool'
import { exitEditing, getStaticObjWithAbsolutePosition, isText, setForSelectedObjects } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { Canvas } from 'fabric/fabric-impl'
import { ObjectType } from '@/types/draw.types'

export function setStrokeColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  const { addToUndoStack } = useHistory()

  if (selectedObjectsRef.length == 0) return

  addToUndoStack(
    selectedObjectsRef.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  setForSelectedObjects(selectedObjectsRef, { stroke: color })

  c.requestRenderAll()
}

export function setFillColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  const { addToUndoStack } = useHistory()

  if (selectedObjectsRef.length == 0) return
  addToUndoStack(
    selectedObjectsRef.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )

  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  setForSelectedObjects(selectedObjectsRef, { fill: color })

  c.requestRenderAll()
}

export function setBackgroundColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  const { addToUndoStack } = useHistory()

  if (selectedObjectsRef.length == 0) return

  addToUndoStack(
    selectedObjectsRef.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  setForSelectedObjects(selectedObjectsRef, { backgroundColor: color }, !color)

  c.renderAll()
}

// TODO is not really a color haha
export async function changeStrokeWidth(c: Canvas, options: any) {
  const strokeWidth = options['strokeWidth']
  const { selectedObjectsRef } = useSelect()
  const { addToUndoStack } = useHistory()

  if (selectedObjectsRef.length == 0) return
  addToUndoStack(
    selectedObjectsRef.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  setForSelectedObjects(selectedObjectsRef, { strokeWidth })

  c.requestRenderAll()
}

// TODO nightmare code
export async function undoColoring(newObj: any, oldObj: any) {
  if (oldObj.type == ObjectType.group) {
    if (oldObj.backgroundColor != newObj.backgroundColor) {
      await setForSelectedObjects([newObj], { backgroundColor: oldObj.backgroundColor }, true)
      return
    }
    newObj.set({
      stroke: oldObj.stroke,
      fill: oldObj.fill,
      backgroundColor: oldObj.backgroundColor,
      strokeWidth: oldObj.strokeWidth
    })
    oldObj.getObjects().forEach((o: any) => {
      const matchingObj = newObj.getObjects().find((oo: any) => oo.id == o.id)
      if (!matchingObj) return
      undoColoring(matchingObj, o)
    })
  } else
    await setForSelectedObjects([newObj], {
      stroke: oldObj.stroke,
      fill: oldObj.fill,
      backgroundColor: oldObj.backgroundColor,
      strokeWidth: oldObj.strokeWidth
    })
}

export function setCanvasBackground(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()

  const color = options['color']
  addToUndoStack([], 'canvasBackground', { prevColor: c.backgroundColor })
  c.setBackgroundColor(color, () => undefined)
  c.requestRenderAll()
}

export function flipObject(c: Canvas, options: any) {
  const flipX = options['flipX']
  const flipY = options['flipY']
  const { selectedObjectsRef } = useSelect()
  const { addToUndoStack } = useHistory()

  if (selectedObjectsRef.length == 0) return

  addToUndoStack(
    selectedObjectsRef.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { flip: true }
  )

  selectedObjectsRef.forEach(o =>
    o.set({
      flipX: flipX ? !o.flipX : o.flipX,
      flipY: flipY ? !o.flipY : o.flipY
    })
  )

  c.requestRenderAll()
}
