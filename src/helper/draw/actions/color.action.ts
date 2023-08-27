import { useSelect } from '@/service/draw/tools/select.tool'
import { exitEditing, getStaticObjWithAbsolutePosition, isText, setForSelectedObjects } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { Canvas } from 'fabric/fabric-impl'
import { popoverController } from '@ionic/vue'
import { ObjectType } from '@/types/draw.types'
import { BLACK } from '@/config/draw/draw.config'

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
  setForSelectedObjects(selectedObjectsRef, { stroke: color || BLACK })

  c.renderAll()
  popoverController.dismiss()
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

  c.renderAll()
  popoverController.dismiss()
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
  setForSelectedObjects(selectedObjectsRef, { backgroundColor: color })

  c.renderAll()
  popoverController.dismiss()
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

  c.renderAll()
}

// TODO nightmare code
export async function undoColoring(newObj: any, oldObj: any) {
  if (oldObj.type == ObjectType.group) {
    if (oldObj.backgroundColor != newObj.backgroundColor) {
      setForSelectedObjects([newObj], { backgroundColor: oldObj.backgroundColor }, true)
      return
    }
    oldObj.getObjects().forEach((o: any) => {
      const matchingObj = newObj.getObjects().find((oo: any) => oo.id == o.id)
      if (!matchingObj) return
      if (oldObj.type == ObjectType.group) undoColoring(matchingObj, o)
      else
        setForSelectedObjects([matchingObj], {
          stroke: o.stroke,
          fill: o.fill,
          backgroundColor: o.backgroundColor,
          strokeWidth: oldObj.strokeWidth
        })
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
