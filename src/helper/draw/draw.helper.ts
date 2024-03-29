import { Canvas, Group, IPoint, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawEvent, DrawTool, ObjectType, SelectedObject } from '@/types/draw.types'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { compressImg, isMobile } from '@/helper/general.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { mergeObjects } from '@/helper/draw/actions/operation.action'
import { EventBus } from '@/main'
import { useEventManager } from '@/service/draw/eventManager.service'
import { DocsItem, DocsKey } from '@/config/draw/docs.config'
import { ColorRGBA } from 'q-floodfill'
import { ERASERS, PANMARGIN, PENMENUTOOLS } from '@/config/draw/draw.config'

// TODO we should remove this one
export function resetZoom(c: Canvas) {
  c.setZoom(1)
  c.setViewportTransform([1, 0, 0, 1, 0, 0])
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
  objects.filter(o => o.id != 'boundary').forEach(obj => setObjectSelection(obj, enabled))
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

export async function setForSelectedObjects(objects: SelectedObject[], options: Partial<Group>, magic = false) {
  for (const obj of objects) {
    if (obj.backgroundObject) continue
    if (obj.type == ObjectType.group) {
      obj.set(options)
      if (options.backgroundColor || magic)
        await fillBackGroundForGroup(obj as fabric.Group, options) // TODO enable this sometime
      else setForSelectedObjects((obj as Group).getObjects(), options)
    } else obj.set(options)
  }
}

export async function setColorForImage(img: fabric.Image, color: string) {
  img.filters?.push(
    new fabric.Image.filters.BlendColor({
      color: color,
      mode: 'tint'
    })
  )
  img.applyFilters()
}

export async function fillBackGroundForGroup(obj: fabric.Group, options: Partial<Group>) {
  const { actionWithoutEvents } = useEventManager()
  const { setSelectedObjects, getSelectedObjects } = useSelect()

  const existingBackgroundRect = obj.getObjects().find(o => o.backgroundObject)

  if (existingBackgroundRect) {
    await actionWithoutEvents(() => {
      obj.remove(existingBackgroundRect)
      obj.canvas!.remove(existingBackgroundRect)
    })
  }

  const shouldReselect = getSelectedObjects().length > 0

  if (!options.backgroundColor) {
    obj.set({ backgroundColor: undefined })
    obj.canvas?.renderAll()
    return
  }

  const a = obj.angle!
  obj.rotate(0)
  const backgroundRect = new fabric.Rect({
    top: obj.top,
    left: obj.left,
    width: obj.width,
    height: obj.height,
    fill: options.backgroundColor,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY
  })
  backgroundRect.backgroundObject = true
  obj.set({ backgroundColor: options.backgroundColor })

  const { getCanvas } = useDrawStore()
  await actionWithoutEvents(() => {
    obj._restoreObjectsState() // Restores each object state
    obj.canvas?.remove(obj)
  })
  const newGroup = await mergeObjects(getCanvas(), { objects: [backgroundRect, ...obj.getObjects()], notSave: true })
  newGroup.id = obj.id
  newGroup.set({ backgroundColor: options.backgroundColor })
  newGroup.rotate(a)

  if (shouldReselect) setSelectedObjects([newGroup]) // hack needed to update the property
  newGroup.canvas.renderAll()
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
  const { setShapeCreationMode, getCanvas } = useDrawStore()
  const { unsubscribe, enableAllEvents } = useEventManager()

  const c = getCanvas()

  const shapeEvents = ['mouse:down', 'mouse:move', 'mouse:up']
  shapeEvents.forEach(e => unsubscribe({ type: DrawEvent.ShapeCreation, on: e }))
  EventBus.emit('reset-shape-creation')
  enableAllEvents()
  setShapeCreationMode(undefined)

  const { selectTool } = useDrawStore()
  selectTool(DrawTool.Select)
  c.setActiveObject(c.getObjects().at(-1)!)
  c.requestRenderAll()
}

export function getStaticObjWithAbsolutePosition(obj: fabric.Object, activeObject: any | undefined) {
  const o = obj.toObject()
  const dim = obj.group
    ? fabric.util.transformPoint(obj.getPointByOrigin('left', 'top'), obj.group.calcTransformMatrix())
    : { x: obj.left!, y: obj.top! }
  o.left = dim.x
  o.top = dim.y

  // the new rotation and scale is only applied to the selection and not the individual objects...
  if (activeObject && activeObject._objects && activeObject._objects.includes(obj)){
    o.angle += activeObject.angle;
    o.scaleX *= activeObject.scaleX;
    o.scaleY *= activeObject.scaleY;
  }
  return o
}

export function updateFreeDrawingCursor(c: Canvas, size: number, color: string, eraser = false) {
  const adjustedSize = size * c.getZoom()

  const canvas: HTMLCanvasElement = document.createElement('canvas')
  canvas.width = adjustedSize
  canvas.height = adjustedSize
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Failed to get canvas rendering context.')
  }

  // Draw the circle in the center
  ctx.beginPath()
  ctx.arc(adjustedSize / 2, adjustedSize / 2, adjustedSize / 2, 0, 2 * Math.PI, false)
  ctx.fillStyle = color
  ctx.fill()

  if (eraser) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2 // Adjust this value for border thickness
    ctx.stroke()
  }

  // Convert to data URL
  const url = canvas.toDataURL('image/png')
  c.freeDrawingCursor = `url(${url}) ${adjustedSize / 2} ${adjustedSize / 2}, crosshair`
  c.setCursor(c.freeDrawingCursor)
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

export function alphaHexToPercent(hex: string): number {
  // Convert hex to integer (0-255)
  const intValue = hex ? parseInt(hex, 16) : 255

  // Convert to percentage and round it
  return Math.round((intValue / 255) * 100)
}

export function hexWithOpacity(hex: string, opacityHex: string) {
  return hex.substring(0, 7) + opacityHex
}

export function hexWithoutOpacity(hex: string) {
  return hex.substring(0, 7)
}

export function distance(point1: { x: number; y: number }, point2: { x: number; y: number }) {
  const dx = point2.x - point1.x
  const dy = point2.y - point1.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function hexWithTransparencyToNormal(hex: string) {
  if (hex.length === 9 && hex.startsWith('#')) {
    return hex.substring(0, 7)
  }
  return hex // Return the original if it's not an 8-character hex color
}

export function generateNextPrevForDocsItem(item: DocsItem) {
  if (!item.children) return {}
  const nextPrev: Partial<Record<DocsKey, (DocsKey | undefined)[]>> = {}

  for (let i = 0; i < item.children?.length; i++) {
    nextPrev[item.children[i]] = [
      i == 0 ? undefined : item.children[i - 1],
      i == item.children.length - 1 ? undefined : item.children[i + 1]
    ]
  }

  return nextPrev
}

const hexToRgb = (hex: string): [number, number, number] => {
  const bigint = parseInt(hexWithoutOpacity(hex).substring(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255

  return [r, g, b]
}

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  let r, g, b

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
}

export const getColorRecommendations = (hexColor: string): string[][] => {
  const [r, g, b] = hexToRgb(hexColor)
  const [h, s, l] = rgbToHsl(r, g, b)

  const recommendations: string[][] = []

  // First row: Similar colors with lightness variations (adaptive based on lightness)
  const offset = 3 // change according to how much variation you want
  const similarColorsLightness = [
    Math.min(100, l + 3 * offset),
    Math.min(100, l + 2 * offset),
    Math.min(100, l + offset),
    Math.max(0, l - offset),
    Math.max(0, l - 2 * offset),
    Math.max(0, l - 3 * offset)
  ]

  const similarColors = similarColorsLightness.map(lightness => {
    return [h, s, lightness]
  })

  recommendations.push(similarColors.map(([h, s, l]) => rgbToHex(...hslToRgb(h / 360, s / 100, l / 100))))

  // Second row: Contrasting colors
  const contrastingColors = [
    [(h + 180) % 360, s, l], // Complementary color
    [(h + 90) % 360, s, 50], // Perpendicular hue with mid lightness
    [(h + 270) % 360, s, 50], // Another perpendicular hue with mid lightness
    [(h + 120) % 360, s, 50], // Another hue with mid lightness
    [(h + 240) % 360, s, 50], // Another hue with mid lightness
    [(h + 60) % 360, s, 50] // Another hue with mid lightness
  ]

  recommendations.push(contrastingColors.map(([h, s, l]) => rgbToHex(...hslToRgb(h / 360, s / 100, l / 100))))

  return recommendations
}

export function isMac() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

export function hex2RGBA(hex: string): ColorRGBA {
  let parsedHex = hex.startsWith('#') ? hex.slice(1) : hex

  // Convert 4-digit hex (with alpha) to 8-digits and 3-digit hex to 6-digits.
  if (parsedHex.length === 4) {
    parsedHex =
      parsedHex[0] +
      parsedHex[0] +
      parsedHex[1] +
      parsedHex[1] +
      parsedHex[2] +
      parsedHex[2] +
      parsedHex[3] +
      parsedHex[3]
  } else if (parsedHex.length === 3) {
    parsedHex = parsedHex[0] + parsedHex[0] + parsedHex[1] + parsedHex[1] + parsedHex[2] + parsedHex[2]
  }

  // Check for valid lengths (either 6 without alpha or 8 with alpha)
  if (parsedHex.length !== 6 && parsedHex.length !== 8) {
    throw new Error(`Invalid HEX color ${parsedHex}.`)
  }

  const r = parseInt(parsedHex.slice(0, 2), 16)
  const g = parseInt(parsedHex.slice(2, 4), 16)
  const b = parseInt(parsedHex.slice(4, 6), 16)
  const a = parsedHex.length === 8 ? parseInt(parsedHex.slice(6, 8), 16) : 255

  return {
    r,
    g,
    b,
    a
  }
}

export function exitColorPickerMode() {
  const { unsubscribe } = useEventManager()
  const { getCanvas, selectedTool } = useDrawStore()
  const { colorPickerMode } = storeToRefs(useDrawStore())

  const c = getCanvas()

  unsubscribe({ type: DrawEvent.ColorPicker, on: 'mouse:down' })
  setTimeout(() => {
    unsubscribe({ type: DrawEvent.ColorPicker, on: 'selection:cleared' })
  }, 50)

  colorPickerMode.value = false
  if (selectedTool == DrawTool.Pen || ERASERS.includes(selectedTool)) {
    setTimeout(() => {
      c.isDrawingMode = true
    }, 50)
  } else if (selectedTool != DrawTool.Bucket) setSelectionForObjects(c.getObjects(), true)
  c.requestRenderAll()
}

export function exitTextAddingMode() {
  const { unsubscribe } = useEventManager()
  const { getCanvas, selectedTool } = useDrawStore()
  const { addTextMode } = storeToRefs(useDrawStore())

  const c = getCanvas()

  unsubscribe({ type: DrawEvent.AddText, on: 'mouse:down' })

  addTextMode.value = false
  if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
    setTimeout(() => {
      c.isDrawingMode = true
    }, 50)
  }
  c.requestRenderAll()
}

export function checkForIntersectionsWithSelectedObject(canvas: fabric.Canvas) {
  return canvas
    .getObjects()
    .some(o => !canvas.getActiveObjects().includes(o) && o.intersectsWithObject(canvas.getActiveObject()!))
}

export async function createSketchFromDataURL(dataURL: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Create an Image object from the Data URL
    const img = new Image()
    img.crossOrigin = 'Anonymous'

    img.src = dataURL

    img.onload = async () => {
      // Function to apply filters to a canvas element
      const filter = (bmp: ImageBitmap, filters = ''): HTMLCanvasElement => {
        const canvas = Object.assign(document.createElement('canvas'), {
          width: bmp.width,
          height: bmp.height
        }) as HTMLCanvasElement
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.filter = filters
          ctx.drawImage(bmp, 0, 0)
        }
        return canvas
      }

      // Function to merge two canvases into one to generate a sketch-like image
      const generateSketch = (bnw: HTMLCanvasElement, blur: HTMLCanvasElement): HTMLCanvasElement => {
        const canvas = document.createElement('canvas')
        canvas.width = bnw.width
        canvas.height = bnw.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(bnw, 0, 0, canvas.width, canvas.height)
          ctx.globalCompositeOperation = 'color-dodge'
          ctx.drawImage(blur, 0, 0, canvas.width, canvas.height)
        }
        return canvas
      }

      // Create a bitmap from the loaded image
      const bmp = await createImageBitmap(img)

      // Generate a black & white and blur canvas using filter()
      const bnw = filter(bmp, 'grayscale(1)')
      const blur = filter(bmp, 'grayscale(1) invert(1) blur(5px)')

      // Merge / combine `bnw` and `blur` canvas
      const sketchImg = generateSketch(bnw, blur)

      // Convert the canvas to Data URL
      const sketchDataURL = sketchImg.toDataURL('image/png')

      // Resolve the promise with the sketch Data URL
      resolve(sketchDataURL)
    }

    img.onerror = () => {
      reject(new Error('Failed to load image from Data URL'))
    }
  })
}

export function opacityFromOpacityHex(color: string) {
  return parseInt(color.slice(-2), 16) / 255
}

export function renderPanBoundary() {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sizeMultiplier = 1.5 // used to counteract the conflicting behaviour of checkCanvasBoundary when our zoom is smaller than 1
  const { actionWithoutEvents } = useEventManager()
  actionWithoutEvents(() => {
    c.remove(c.getObjects().find(o => o.id == 'boundary')!)
    const rect = new fabric.Rect({
      left: -PANMARGIN * sizeMultiplier,
      top: -PANMARGIN * sizeMultiplier,
      stroke: '#FF7F7F',
      fill: undefined,
      strokeWidth: PANMARGIN * sizeMultiplier,
      width: c!.width! + PANMARGIN * sizeMultiplier,
      height: c.height! + PANMARGIN * sizeMultiplier,
      hasBorders: false,
      selectable: false,
      hasControls: false,
      evented: false,
      erasable: false
    })
    rect.id = 'boundary'
    c.add(rect)
    c.requestRenderAll()
  })
}

export function activateRenderPanBoundaryListener(c: Canvas) {
  const events = ['undo', 'redo', 'add_to_undo_stack']

  events.forEach(e => {
    EventBus.on(e, renderPanBoundary)
  })
  renderPanBoundary()
}

export function disableRenderPanBoundaryListener() {
  const events = ['undo', 'redo', 'add_to_undo_stack']

  events.forEach(e => {
    EventBus.off(e, renderPanBoundary)
  })
}
