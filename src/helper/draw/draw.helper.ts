import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { ObjectType, SelectedObject } from '@/types/draw.types'
import { checkCanvasBounds } from '@/helper/draw/gesture.helper'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'

const eventsToDisable = [
  'mouse:down',
  'mouse:up',
  'mouse:move',
  'mouse:wheel',
  'touch:gesture',
  'touch:drag',
  'mouse:down:before',
  ''
]

const hammerEventsToDisable = ['pinch', 'pinchend', 'pinchstart']

export function resetZoom(c: Canvas) {
  c.setZoom(1)
  checkCanvasBounds(c)
}

export function findObjectById(canvas: fabric.Canvas, id: string) {
  return canvas.getObjects().find((obj: fabric.Object) => obj.id === id)
}

export function fabricateTouchUp(c: any) {
  const evt = new TouchEvent('touchend', {
    bubbles: true,
    cancelable: true,
    view: window
  })
  c.upperCanvasEl.dispatchEvent(evt)
}

export function setObjectSelection(obj: fabric.Object, enabled: boolean) {
  obj.set({
    hasBorders: enabled,
    selectable: enabled,
    hasControls: enabled,
    evented: enabled
  })
}

export function setSelectionForObjects(objects: fabric.Object[], enabled: boolean) {
  objects.forEach(obj => setObjectSelection(obj, enabled))
}

export async function cloneObjects(objects: Array<SelectedObject>) {
  return await Promise.all(
    objects.map(
      obj =>
        new Promise<SelectedObject>(resolve => {
          obj.clone((cloned: SelectedObject) => resolve(cloned))
        })
    )
  )
}

export function disableEventsHelper(c: Canvas, events: string[]) {
  events.forEach(e => c.off(e))
}

export function setObjectId(obj: any) {
  obj.id = uuidv4()
}

export async function enlivenObjects(objects: fabric.Object[]) {
  return await new Promise<fabric.Object[]>(resolve => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    fabric.util.enlivenObjects(objects, (enlivenedObjects: fabric.Object[]) => {
      resolve(enlivenedObjects)
    })
  })
}

export function isText(objects: fabric.Object[]) {
  return objects.length == 1 && objects[0].type == ObjectType.text
}

export function exitEditing(text: any) {
  if (text.type != ObjectType.text || !text.isEditing) return
  text.exitEditing()
  const { isEditingText } = storeToRefs(useDrawStore())
  isEditingText.value = false
}
