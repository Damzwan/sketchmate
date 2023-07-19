import { Canvas, Group, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawTool, ObjectType, SelectedObject } from '@/types/draw.types'
import { checkCanvasBounds } from '@/helper/draw/gesture.helper'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { compressImg, isMobile, isNative } from '@/helper/general.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
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
  if (text.type != ObjectType.text || !text.isEditing || text.text == '') return
  text.exitEditing()
  const { isEditingText } = storeToRefs(useDrawStore())
  isEditingText.value = false
}

export async function canvasToBuffer(canvasDataUrl: string) {
  return await (await compressImg(canvasDataUrl, { returnType: 'blob' })).arrayBuffer()
}

export function setForSelectedObjects(objects: SelectedObject[], options: Partial<Group>) {
  objects.forEach(obj => {
    if (obj.type == ObjectType.group) setForSelectedObjects((obj as Group).getObjects(), options)
    else obj.set(options)
  })
}

export function focusText(text: IText) {
  if (isMobile()) {
    setTimeout(() => {
      text.enterEditing()
      text.hiddenTextarea!.focus() // This line is especially important for mobile
    }, 300)
  } else {
    setTimeout(() => {
      text.enterEditing()
      text.hiddenTextarea!.focus() // This line is especially important for mobile
    }, 200)
  }
}

export function initSelectWithObjects(c: Canvas, objects: SelectedObject[]) {
  // TODO create a helper for this
  const { selectTool } = useDrawStore()
  selectTool(DrawTool.Select)

  if (objects.length == 1) c!.setActiveObject(objects[0])
  else c!.setActiveObject(new fabric.ActiveSelection(objects, { canvas: c! }))

  // TODO somehow doing an active selection will not allow you to merge since it is treated as a single object
  const { setSelectedObjects } = useSelect()
  setSelectedObjects(objects)
}

export function getTextWidth(text: string, fontSize: number, fontFace: string): number {
  const canvas: HTMLCanvasElement = document.createElement('canvas')
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d')
  if (context) {
    context.font = fontSize + 'px ' + fontFace
    return context.measureText(text).width
  } else {
    throw new Error('Could not get canvas context')
  }
}

export function splitStringToWidth(text: string, fontSize: number, fontFace: string, maxWidth: number): string {
  let result = ''
  let line = ''

  // Remove existing newlines
  text = text.replace(/\n/g, '')

  for (let i = 0; i < text.length; i++) {
    const testLine: string = line + text.charAt(i)
    const testWidth: number = getTextWidth(testLine, fontSize, fontFace)
    if (testWidth > maxWidth) {
      result += line + '\n'
      line = text.charAt(i)
    } else {
      line = testLine
    }
  }
  result += line
  return result
}
