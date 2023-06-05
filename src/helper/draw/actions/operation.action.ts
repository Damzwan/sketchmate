import { Canvas } from 'fabric/fabric-impl'
import { useHistory } from '@/service/draw/history.service'
import { cloneObjects, setObjectId } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'

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
            setObjectId(cloned)
            c.add(cloned)
            resolve()
          })
      )
    )
    c!.setActiveObject(new fabric.ActiveSelection(clonedObjects, { canvas: c }))
    c.renderAll()
  })
}

export function mergeObjects(c: Canvas, options: any) {
  const { customSaveAction } = useHistory()
  customSaveAction(async () => {
    const objects: fabric.Object[] = options['objects']
    c.discardActiveObject()
    const select = new fabric.ActiveSelection(objects, { canvas: c })
    const group = select.toGroup()
    c.setActiveObject(new fabric.ActiveSelection([group], { canvas: c }))
    objects.forEach(obj => c.remove(obj))
    c.renderAll()
  })
}

export function deleteObjects(c: Canvas, options: any) {
  const { customSaveAction } = useHistory()
  c.discardActiveObject()
  const objects: fabric.Object[] = options['objects']
  customSaveAction(() => objects.forEach(obj => c?.remove(obj)))
}
