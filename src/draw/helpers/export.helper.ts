import { ActiveSelection, Canvas, StaticCanvas } from 'fabric'
import { compressImg } from '@/helper/general.helper'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'

export async function canvasToBuffer(canvasDataUrl: string, size = 1920) {
  return await (await compressImg(canvasDataUrl, { returnType: 'blob', size: size })).arrayBuffer()
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

export async function exportBoundingBoxImage(canvas: Canvas) {
  if (!canvas) return null

  const objects = canvas.getObjects()
  if (objects.length === 0) {
    return { img: canvas.toDataURL(), aspect_ration: 1 }
  }

  // 1. Save original states
  const originalVpt = [...canvas.viewportTransform] as any
  const originalSkipOffscreen = canvas.skipOffscreen

  // Create a Map to store which objects were manually hidden vs culled
  const visibilityStates = new Map()

  // 2. Force all objects to be visible for the export
  objects.forEach(obj => {
    visibilityStates.set(obj, obj.visible)
    obj.visible = true // Temporary override
    obj.setCoords()    // Update coordinates in "World Space"
  })

  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

  // 3. Calculate Absolute Bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  objects.forEach(obj => {
    const bounds = obj.getBoundingRect()
    minX = Math.min(minX, bounds.left)
    minY = Math.min(minY, bounds.top)
    maxX = Math.max(maxX, bounds.left + bounds.width)
    maxY = Math.max(maxY, bounds.top + bounds.height)
  })

  const width = maxX - minX
  const height = maxY - minY

  if (width <= 0 || height <= 0) {
    // Restore and exit if empty
    objects.forEach(obj => obj.visible = visibilityStates.get(obj))
    canvas.setViewportTransform(originalVpt)
    return { img: canvas.toDataURL(), aspect_ration: 1 }
  }

  // 4. Export Logic
  const minTargetSize = 2000
  const multiplier = Math.min(minTargetSize / width, minTargetSize / height, 2)

  const img = canvas.toDataURL({
    left: minX,
    top: minY,
    width: width,
    height: height,
    multiplier: multiplier
  })

  // 5. Cleanup & Restoration
  // Restore the custom culling/visibility states
  objects.forEach(obj => {
    obj.visible = visibilityStates.get(obj)
  })

  canvas.skipOffscreen = originalSkipOffscreen
  canvas.setViewportTransform(originalVpt)

  // Re-run your custom culling logic here if necessary,
  // or simply re-render to let the current frame reflect the UI
  canvas.requestRenderAll()

  return { img, aspect_ratio: width / height }
}

export async function cloneCanvas(canvas: any) {
  const cloned = new StaticCanvas(undefined, {
    width: canvas.width,
    height: canvas.height
  })

  await cloned.loadFromJSON(canvas.toJSON())
  cloned.getObjects().forEach(obj => {
    obj.visible = true
    obj.setCoords()
  })
  cloned.renderAll()
  return cloned
}

export function computeBounds(objects: any[]) {
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const obj of objects) {
    const { left, top, width, height } = obj.getBoundingRect()

    minX = Math.min(minX, left)
    minY = Math.min(minY, top)
    maxX = Math.max(maxX, left + width)
    maxY = Math.max(maxY, top + height)
  }

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function relativeToAbsolute(bounds: any, rect: any) {
  return {
    x: bounds.minX + rect.x * bounds.width,
    y: bounds.minY + rect.y * bounds.height,
    w: rect.width * bounds.width,
    h: rect.height * bounds.height
  }
}

export function toDataURL(c: any, bounds: any, multiplier = 2) {
  return c.toDataURL({
    left: bounds.minX,
    top: bounds.minY,
    width: bounds.width,
    height: bounds.height,
    multiplier
  })
}

export async function cropCanvas(canvas: StaticCanvas, rect: any, threshold = 0.3) {
  const objects = canvas.getObjects()

  const bounds = computeBounds(objects)
  const abs = relativeToAbsolute(bounds, rect)


  const keepObjects = objects.filter(obj => {
    const b = obj.getBoundingRect()
    const xOverlap = Math.max(0, Math.min(b.left + b.width, abs.x + abs.w) - Math.max(b.left, abs.x))
    const yOverlap = Math.max(0, Math.min(b.top + b.height, abs.y + abs.h) - Math.max(b.top, abs.y))
    const intersectionArea = xOverlap * yOverlap
    const objArea = b.width * b.height
    return (intersectionArea / objArea) >= threshold
  })

  if (keepObjects.length === 0) return { image: '', json: null }

  const filteredBounds = computeBounds(keepObjects)

  const tempCanvasEl = document.createElement('canvas')
  const tempCanvas = new StaticCanvas(tempCanvasEl, {
    width: filteredBounds.width,
    height: filteredBounds.height,
    backgroundColor: canvas.backgroundColor
  })

  const clonedObjects = await Promise.all(keepObjects.map((obj: any) =>
    obj.clone()
  ))


  clonedObjects.forEach(obj => {
    obj.left = obj.left - filteredBounds.minX
    obj.top = obj.top - filteredBounds.minY

    obj.visible = true
    tempCanvas.add(obj)
  })

  tempCanvas.renderAll()

  const minTargetSize = 2000
  const multiplier = Math.min(minTargetSize / tempCanvas.width, minTargetSize / tempCanvas.height, 2)


  return {
    image: toDataURL(tempCanvas, computeBounds(clonedObjects), multiplier),
    json: tempCanvas
  }
}