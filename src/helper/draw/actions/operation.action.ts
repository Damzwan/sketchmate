import { Canvas, IText } from 'fabric/fabric-impl'
import { useHistory } from '@/service/draw/history.service'
import { cloneObjects, isText, setObjectId } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { applyCurve } from '@/helper/draw/actions/text.action'
import { useSelect } from '@/service/draw/tools/select.tool'
import { SelectedObject } from '@/types/draw.types'

export async function copyObjects(c: Canvas, options: any) {
  const { customSaveAction } = useHistory()
  const offsetX = 50 // define the offset here
  const offsetY = 50

  await customSaveAction(async () => {
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

            setObjectId(cloned)
            c.add(cloned)
            resolve()
          })
      )
    )
    // Multiselect hack :))
    const { setMouseClickTarget } = useSelect()
    setMouseClickTarget(undefined)

    c!.setActiveObject(new fabric.ActiveSelection(clonedObjects, { canvas: c }))
    c.renderAll()
  })
}

export async function mergeObjects(c: Canvas, options: any) {
  const { customSaveAction, actionWithoutHistory } = useHistory()
  const { setSelectedObjects } = useSelect()
  const notSave = options['notSave']
  const fn = async () => {
    const objects: fabric.Object[] = options['objects']
    c.discardActiveObject()
    const select = new fabric.ActiveSelection(objects, { canvas: c })
    const group = select.toGroup()

    objects.forEach(obj => c.remove(obj))
    c.setActiveObject(group)
    setSelectedObjects([group])
    c.renderAll()
  }

  if (notSave) await actionWithoutHistory(fn)
  else await customSaveAction(fn)
}

export function deleteObjects(c: Canvas, options: any) {
  const { customSaveAction } = useHistory()
  c.discardActiveObject()
  const objects: fabric.Object[] = options['objects']
  customSaveAction(() => objects.forEach(obj => c?.remove(obj)))
}

export function bringToFront(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  objects.forEach(obj => c.bringToFront(obj))
  c.discardActiveObject()
}

export function bringToBack(c: Canvas, { objects }: { objects: SelectedObject[] }) {
  objects.forEach(obj => c.sendToBack(obj))
  c.discardActiveObject()
}
