import { useSelect } from '@/service/draw/tools/select.tool'
import { exitEditing, getStaticObjWithAbsolutePosition, isText, setForSelectedObjects } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { Canvas } from 'fabric/fabric-impl'
import { popoverController } from '@ionic/vue'
import { ObjectType } from '@/types/draw.types'

export function setStrokeColor(c: Canvas, options: any) {
  const color = options['color']
  const { getSelectedObjects } = useSelect()
  const { addToUndoStack } = useHistory()

  const selectedObjects = getSelectedObjects()
  if (selectedObjects.length == 0) return

  addToUndoStack(
    selectedObjects.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )
  if (isText(selectedObjects)) exitEditing(selectedObjects[0])
  setForSelectedObjects(selectedObjects, { stroke: color })

  c.renderAll()
  popoverController.dismiss()
}

export function setFillColor(c: Canvas, options: any) {
  const color = options['color']
  const { getSelectedObjects } = useSelect()
  const { addToUndoStack } = useHistory()

  const selectedObjects = getSelectedObjects()
  if (selectedObjects.length == 0) return
  addToUndoStack(
    selectedObjects.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )

  if (isText(selectedObjects)) exitEditing(selectedObjects[0])
  setForSelectedObjects(selectedObjects, { fill: color })

  c.renderAll()
  popoverController.dismiss()
}

export function setBackgroundColor(c: Canvas, options: any) {
  const color = options['color']
  const { getSelectedObjects } = useSelect()
  const { addToUndoStack } = useHistory()

  const selectedObjects = getSelectedObjects()
  if (selectedObjects.length == 0) return

  addToUndoStack(
    selectedObjects.map(obj => getStaticObjWithAbsolutePosition(obj)),
    'object:modified',
    { color: true }
  )
  if (isText(selectedObjects)) exitEditing(selectedObjects[0])
  setForSelectedObjects(selectedObjects, { backgroundColor: color })

  c.renderAll()
  popoverController.dismiss()
}

// TODO nightmare code
export async function undoColoring(newObj: any, oldObj: any) {
  if (oldObj.type == ObjectType.group) {
    oldObj.getObjects().forEach((o: any) => {
      const matchingObj = newObj.getObjects().find((oo: any) => oo.id == o.id)
      if (oldObj.type == ObjectType.group) undoColoring(matchingObj, o)
      else
        setForSelectedObjects([matchingObj], {
          stroke: o.stroke,
          fill: o.fill,
          backgroundColor: o.backgroundColor
        })
    })
  } else
    await setForSelectedObjects([newObj], {
      stroke: oldObj.stroke,
      fill: oldObj.fill,
      backgroundColor: oldObj.backgroundColor
    })
}
