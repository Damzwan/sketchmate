import { Canvas, FabricObject, IText, Rect, StaticCanvas } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DocsItem, DocsKey } from '@/config/draw/docs.config'
import { compressImg, isMobile } from '../general.helper'
import { ObjectType } from '@/types/draw.types'
import { storeToRefs } from 'pinia'
import { ColorRGBA } from 'q-floodfill'
import { initCanvasOptions } from '@/helper/draw/drawInit.helper'
import { BACKGROUND } from '@/config/draw/draw.config'

export function hexWithOpacity(hex: string, opacityHex: string) {
  return hex.substring(0, 7) + opacityHex
}

export function percentToAlphaHex(opacity: number) {
  return Math.round((opacity * 255) / 100)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}

export function hexWithoutOpacity(hex: string) {
  return hex.substring(0, 7)
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

export function alphaHexToPercent(hex: string): number {
  // Convert hex to integer (0-255)
  const intValue = hex ? parseInt(hex, 16) : 255

  // Convert to percentage and round it
  return Math.round((intValue / 255) * 100)
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

const hexToRgb = (hex: string): [number, number, number] => {
  const bigint = parseInt(hexWithoutOpacity(hex).substring(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255

  return [r, g, b]
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

export function disableSelection() {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  c.selection = false // Disable group selection
  c.forEachObject((obj) => {
    obj.selectable = false // Make all objects non-selectable
  })
  c.requestRenderAll() // Re-render the canvas to apply changes
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

export async function canvasToBuffer(canvasDataUrl: string, size = 1920) {
  return await (await compressImg(canvasDataUrl, { returnType: 'blob', size: size })).arrayBuffer()
}

// TODO we should remove this one
export function resetZoom(c: Canvas) {
  c.setZoom(1)
  c.setViewportTransform([1, 0, 0, 1, 0, 0])
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

export function centerObjectInViewport(
  canvas: Canvas,
  object: FabricObject,
  containerSelector = '.canvas-container'
) {
  let rect: DOMRect | null = null

  const container = document.querySelector(containerSelector) as HTMLDivElement
  if (container) {
    rect = container.getBoundingClientRect()
  } else {
    // fallback to canvas element if container doesn't exist
    const canvasEl = canvas.upperCanvasEl as HTMLCanvasElement
    rect = canvasEl.getBoundingClientRect()
  }

  if (!rect) return

  // center of visible screen
  const clientCenter = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  }

  // Convert screen coords -> canvas coords
  const pointer = canvas.getPointer(clientCenter as any)

  // Position object in canvas space
  object.set({
    left: pointer.x,
    top: pointer.y,
    originX: 'center',
    originY: 'center'
  })

}

export function isText(objects: FabricObject[]) {
  return objects.length == 1 && objects[0].type == ObjectType.text
}

export function setObjectSelection(obj: FabricObject, enabled: boolean) {
  obj.set({
    hasBorders: enabled,
    selectable: enabled,
    hasControls: enabled,
    evented: enabled
  })
}

export function setSelectionForObjects(objects: FabricObject[], enabled: boolean) {
  objects.forEach(obj => setObjectSelection(obj, enabled))
}

export function opacityFromOpacityHex(color: string) {
  return parseInt(color.slice(-2), 16) / 255
}

export function hexWithTransparencyToNormal(hex: string) {
  if (hex.length === 9 && hex.startsWith('#')) {
    return hex.substring(0, 7)
  }
  return hex // Return the original if it's not an 8-character hex color
}

export function exitEditing(text: any) {
  if (text.type != ObjectType.text || !text.isEditing || text.text == '') return
  text.exitEditing()
  const { isEditingText } = storeToRefs(useDrawStore())
  isEditingText.value = false
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

export async function exportBoundingBoxImage(canvas: Canvas) {
  if (!canvas) return null

  if (canvas.getObjects().length === 0) {
    return { img: canvas.toDataURL({ multiplier: 2 }), aspect_ratio: canvas.width / canvas.height }
  }

  // Initialize bounding box extremes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  // Iterate over all objects to find the bounding box
  canvas.getObjects().forEach(obj => {
    const bounds = obj.getBoundingRect()
    minX = Math.min(minX, bounds.left)
    minY = Math.min(minY, bounds.top)
    maxX = Math.max(maxX, bounds.left + bounds.width)
    maxY = Math.max(maxY, bounds.top + bounds.height)
  })

  const width = maxX - minX
  const height = maxY - minY


  if (width <= 0 || height <= 0) return null


  const tempCanvas = new StaticCanvas(undefined, {
    backgroundColor: canvas.backgroundColor,
    width: width,
    height: height
  })


  const clonedItems = await Promise.all(canvas.getObjects().map(async obj => {
    const cloned = await obj.clone()
    cloned.set({
      left: cloned.left - minX,
      top: cloned.top - minY
    })
    return cloned
  }))
  tempCanvas.add(...clonedItems)

  tempCanvas.renderAll()

  const minTargetSize = 2000 // or 2500 for even higher quality

  const multiplierX = minTargetSize / width
  const multiplierY = minTargetSize / height

  const multiplier = Math.min(multiplierX, multiplierY, 6)


  return { img: tempCanvas.toDataURL({ multiplier: multiplier }), aspect_ratio: width / height }

}

export function isMac() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}


