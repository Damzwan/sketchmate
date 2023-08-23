import { Canvas, IText } from 'fabric/fabric-impl'
import { useHistory } from '@/service/draw/history.service'
import { cloneObjects, isText, setObjectId } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { applyCurve } from '@/helper/draw/actions/text.action'
import { useSelect } from '@/service/draw/tools/select.tool'
import { SelectedObject } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'

export async function copyObjects(c: Canvas, options: any) {
  const { actionWithoutHistory, addToUndoStack } = useHistory() // TODO should be replaced
  const offsetX = 10 // define the offset here
  const offsetY = 10

  await actionWithoutHistory(async () => {
    const objectsToCopy: fabric.Object[] = options['objects']
    c.discardActiveObject()

    const clonedObjects = await cloneObjects(objectsToCopy)

    await Promise.all(
      objectsToCopy.map(
        (original, index) =>
          new Promise<void>(resolve => {
            const cloned = clonedObjects[index]
            cloned.set({ left: original.left! + offsetX, top: original.top! + offsetY })

            // TODO Maybe use with restore actions since this is repeated in history.service.js
            if (isText([cloned])) {
              const text = cloned as IText
              if (text.isCurved) applyCurve(text, c)
            }

            setObjectId(cloned) // TODO is this necessary?
            c.add(cloned)
            resolve()
          })
      )
    )
    // Multiselect hack :))
    const { setMouseClickTarget } = useSelect()
    setMouseClickTarget(undefined)

    if (clonedObjects.length == 1) c.setActiveObject(clonedObjects[0])
    else c!.setActiveObject(new fabric.ActiveSelection(clonedObjects, { canvas: c }))

    addToUndoStack(clonedObjects, 'object:added')
    c.renderAll()
  })
}

export async function mergeObjects(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { actionWithoutEvents } = useEventManager()

  const notSave = options['notSave']

  const fn = async () => {
    const objects: fabric.Object[] = options['objects']
    c.discardActiveObject()
    const select = new fabric.ActiveSelection(objects, { canvas: c })
    const group = select.toGroup()

    objects.forEach(obj => c.remove(obj))

    c.setActiveObject(group)
    if (!notSave) addToUndoStack([group], 'merge')
    c.renderAll()
  }
  await actionWithoutEvents(fn)
}

export function deleteObjects(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug
  c.discardActiveObject()
  const objects: fabric.Object[] = options['objects']
  c.remove(...objects)
  addToUndoStack(objects, 'object:removed')
}

export function bringToFront(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug

  addToUndoStack(c.getObjects()!, 'layering')

  objects.forEach(obj => c.bringToFront(obj))
  c.discardActiveObject()
}

export function bringToBack(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug

  addToUndoStack(c.getObjects()!, 'layering')

  objects.forEach(obj => c.sendToBack(obj))
  c.discardActiveObject()
}
