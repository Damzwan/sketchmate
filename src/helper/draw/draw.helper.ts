import { Canvas, Group, IPoint, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawEvent, DrawTool, ObjectType, SelectedObject } from '@/types/draw.types'
import { checkCanvasBounds } from '@/helper/draw/gesture.helper'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { compressImg, isMobile } from '@/helper/general.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { mergeObjects } from '@/helper/draw/actions/operation.action'
import { EventBus } from '@/main'
import { useEventManager } from '@/service/draw/eventManager.service'

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

export function isPolygon(objects: fabric.Object[]) {
  return objects.length == 1 && objects[0].type == ObjectType.polygon
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

export async function setForSelectedObjects(objects: SelectedObject[], options: Partial<Group>) {
  for (const obj of objects) {
    if (obj.type == ObjectType.group) {
      // if (options.backgroundColor) await fillBackGroundForGroup(obj, options) TODO enable this sometime
      setForSelectedObjects((obj as Group).getObjects(), options)
    } else obj.set(options)
  }
}

export async function fillBackGroundForGroup(obj: SelectedObject, options: Partial<Group>) {
  const backgroundRect = new fabric.Rect({
    top: obj.top,
    left: obj.left,
    width: obj.width,
    height: obj.height,
    fill: options.backgroundColor,
    angle: obj.angle
  })

  const { getCanvas } = useDrawStore()
  await mergeObjects(getCanvas(), { objects: [backgroundRect, obj], notSave: true })
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

export function restoreSelectedObjects(c: Canvas, selectedObjects: SelectedObject[]) {
  const { multiSelectMode, setMultiSelectMode, setSelectedObjects } = useSelect()
  const multi = multiSelectMode
  setMultiSelectMode(false)
  const newSelectedObjects = selectedObjects.map((obj: any) => findObjectById(c!, obj.id)!).filter((obj: any) => !!obj)
  if (newSelectedObjects.length > 1) c!.setActiveObject(new fabric.ActiveSelection(newSelectedObjects, { canvas: c }))
  else if (newSelectedObjects.length == 1) c?.setActiveObject(newSelectedObjects[0])
  else {
    // TODO kinda hacky
    c.discardActiveObject()
    setSelectedObjects([])
  }
  setMultiSelectMode(multi)
  c.requestRenderAll()
}

export function isObjectSelected(selectedObjects: SelectedObject[], obj: SelectedObject): boolean {
  if (obj instanceof fabric.ActiveSelection) {
    const foundObjects = obj.getObjects().map(mappedObj => selectedObjects.find(obj2 => obj2.id == mappedObj.id))
    return foundObjects.every(o => !!o)
  }

  return !!selectedObjects.find(obj2 => obj2.id == obj.id)
}

export function findNearestPoint(clickPoint: IPoint, points: IPoint[], clickTolerance = 10): IPoint | undefined {
  for (const point of points) {
    const dx = clickPoint.x - point.x
    const dy = clickPoint.y - point.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance <= clickTolerance) return point
  }
  return undefined
}

export function objectsFromTarget(target: any): fabric.Object[] {
  return target.type == ObjectType.selection ? target._objects : [target]
}

export function exitShapeCreationMode() {
  const { setShapeCreationMode } = useDrawStore()
  const { unsubscribe, enableAllEvents } = useEventManager()

  const shapeEvents = ['mouse:down', 'mouse:move', 'mouse:up']
  shapeEvents.forEach(e => unsubscribe({ type: DrawEvent.ShapeCreation, on: e }))
  EventBus.emit('reset-shape-creation')
  EventBus.off('reset-shape-creation')
  EventBus.off('undo')
  EventBus.off('redo')
  enableAllEvents()
  setShapeCreationMode(undefined)

  const { selectTool } = useDrawStore()
  selectTool(DrawTool.Select)
}

export function getStaticObjWithAbsolutePosition(obj: fabric.Object) {
  const o = obj.toObject()
  const dim = obj.group
    ? fabric.util.transformPoint(obj.getPointByOrigin('left', 'top'), obj.group.calcTransformMatrix())
    : { x: obj.left!, y: obj.top! }
  o.left = dim.x
  o.top = dim.y
  return o
}

export function updateFreeDrawingCursor(c: Canvas, size: number, color: string, eraser = false) {
  const canvas: HTMLCanvasElement = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Failed to get canvas rendering context.')
  }

  // Draw the circle in the center
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI, false)
  ctx.fillStyle = color
  ctx.fill()

  if (eraser) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2 // Adjust this value for border thickness
    ctx.stroke()
  }

  // Convert to data URL
  const url = canvas.toDataURL('image/png')
  c.freeDrawingCursor = `url(${url}) ${size / 2} ${size / 2}, crosshair`
}

export function isColorTooLight(hex: string) {
  // Convert hex to RGB values
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  // Calculate the luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  // Set a threshold value (for instance, 0.7)
  return luminance > 0.9
}

export function percentToAlphaHex(opacity: number) {
  return Math.round((opacity * 255) / 100)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}
