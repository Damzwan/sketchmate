import { Canvas, IText } from 'fabric/fabric-impl'
import { useHistory } from '@/service/draw/history.service'
import { cloneObjects, isText, setObjectId } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { applyCurve } from '@/helper/draw/actions/text.action'
import { useSelect } from '@/service/draw/tools/select.tool'
import { SelectedObject } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'

export async function copyObjects(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { actionWithoutEvents } = useEventManager()
  const { setSelectedObjects } = useSelect()

  const offsetX = 10 // define the offset here
  const offsetY = 10

  await actionWithoutEvents(async () => {
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
    setSelectedObjects(clonedObjects)

    addToUndoStack(clonedObjects, 'object:added')
    c.renderAll()
  })
}

export async function mergeObjects(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { actionWithoutEvents } = useEventManager()
  const { setSelectedObjects } = useSelect()

  const notSave = options['notSave']
  const noReset = options['noReset']

  const fn = async () => {
    c.discardActiveObject()
    const objects: fabric.Object[] = options['objects']
    const select = new fabric.ActiveSelection(objects, { canvas: c })
    const group = select.toGroup()
    group.fill = undefined

    objects.forEach(obj => c.remove(obj))

    if (!notSave) addToUndoStack([group], 'merge', { noReset })
    c.setActiveObject(group)
    setSelectedObjects([group]) // Necessary since selections are not updated

    c.renderAll()
    return group
  }
  return await actionWithoutEvents(fn)
}

export function deleteObjects(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug
  const objects: fabric.Object[] = options['objects']
  c.discardActiveObject()
  c.remove(...objects)
  addToUndoStack(objects, 'object:removed')
  c.requestRenderAll()
}

export function bringToFront(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug

  addToUndoStack(c.getObjects()!, 'layering')

  const sortedObjects = objects.sort((a, b) => {
    return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
  })

  // Call bringToFront iteratively
  sortedObjects.forEach(obj => c.bringToFront(obj))
  c.requestRenderAll()
}

export function moveUpOneLayer(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug
  addToUndoStack(c.getObjects()!, 'layering')

  const objectsLength = c.getObjects().length - 1

  const sortedObjects = objects.sort((a, b) => {
    return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
  })

  sortedObjects.forEach(obj => {
    const currI = c.getObjects().indexOf(obj)
    c.moveTo(obj, Math.min(currI + 1, objectsLength))
  })
  c.requestRenderAll()
}

export function moveDownOneLayer(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fuck this bug
  addToUndoStack(c.getObjects()!, 'layering')

  const sortedObjects = objects
    .sort((a, b) => {
      return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
    })
    .reverse() // Reverse the sorted array to process the highest layers first

  sortedObjects.forEach(obj => {
    const currI = c.getObjects().indexOf(obj)
    c.moveTo(obj, Math.max(currI - 1, 0))
  })
  c.requestRenderAll()
}

export function bringToBack(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  const { addToUndoStack } = useHistory()
  const { setMouseClickTarget } = useSelect()
  setMouseClickTarget(undefined) // TODO fix this bug

  addToUndoStack(c.getObjects()!, 'layering')

  const sortedObjects = objects
    .sort((a, b) => {
      return c.getObjects().indexOf(a) - c.getObjects().indexOf(b)
    })
    .reverse() // Reverse the sorted array to process the highest layers first

  sortedObjects.forEach(obj => c.sendToBack(obj))
  c.requestRenderAll()
}
