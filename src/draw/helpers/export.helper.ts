import { Canvas, StaticCanvas } from 'fabric'
import { compressImg } from '@/helper/general.helper'
import { CANVAS_SIZE } from '@/draw/config/canvas.config'

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

function emptyCanvasImage(c: Canvas) {
  return { img: c.toDataURL(), aspect_ratio: 1 }
}

export async function exportBoundingBoxImage(canvas: Canvas): Promise<{ img: string, aspect_ratio: number } | null> {
  const objects = canvas?.getObjects()
  if (!canvas || !objects || objects.length === 0) return emptyCanvasImage(canvas)

  // 1. CALCULATE ABSOLUTE BOUNDS
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  objects.forEach(obj => {
    // @ts-ignore
    const bound = obj.getBoundingRect(true)
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)
  })

  const padding = 10
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const width = maxX - minX
  const height = maxY - minY

  if (width <= 0 || height <= 0) return emptyCanvasImage(canvas)

  const maxPreviewTarget = 2000
  const scale = Math.min(maxPreviewTarget / width, maxPreviewTarget / height)

  const exportWidth = width * scale
  const exportHeight = height * scale

  const nativeCanvas = document.createElement('canvas')
  nativeCanvas.width = exportWidth
  nativeCanvas.height = exportHeight
  const ctx = nativeCanvas.getContext('2d', { alpha: true })
  if (!ctx) return emptyCanvasImage(canvas)

  ctx.fillStyle = canvas.backgroundColor as any
  ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height)

  ctx.save()
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  canvas.skipOffscreen = false
  objects.forEach(obj => {
    const wasVisible = obj.visible
    obj.visible = true
    obj.objectCaching = false
    obj.render(ctx)
    obj.objectCaching = true
    obj.visible = wasVisible
  })
  canvas.skipOffscreen = true

  ctx.restore()

  // OFF-THREAD ENCODING
  return new Promise((resolve) => {
    nativeCanvas.toBlob((blob) => {
      if (!blob) return resolve(null)

      resolve({
        img: URL.createObjectURL(blob),
        aspect_ratio: width / height
      })
    }, 'image/webp', 0.8)
  })
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
    left: bounds.minX + rect.x * bounds.width,
    top: bounds.minY + rect.y * bounds.height,
    width: rect.width * bounds.width,
    height: rect.height * bounds.height
  }
}


export async function cropCanvas(canvas: StaticCanvas, relativeRect: any): Promise<{
  img: string,
  aspect_ratio: number
} | null> {
  const objects = canvas?.getObjects()
  if (!canvas || !objects || objects.length === 0) return null

  // Step A: Convert the relative UI rect into an absolute World rect
  const totalBounds = computeBounds(objects)
  const absCrop = relativeToAbsolute(totalBounds, relativeRect)

  if (absCrop.width <= 0 || absCrop.height <= 0) return null

  // Step B: Set up the native clipping canvas
  const maxPreviewTarget = 2000
  const scale = Math.min(maxPreviewTarget / absCrop.width, maxPreviewTarget / absCrop.height)

  const nativeCanvas = document.createElement('canvas')
  nativeCanvas.width = absCrop.width * scale
  nativeCanvas.height = absCrop.height * scale

  const ctx = nativeCanvas.getContext('2d', { alpha: true })
  if (!ctx) return null

  ctx.fillStyle = canvas.backgroundColor as any
  ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height)

  // Step C: Shift the camera to target ONLY the crop area
  ctx.save()
  ctx.scale(scale, scale)
  // Shift the origin so the top-left of the crop box is exactly at [0, 0]
  ctx.translate(-absCrop.left, -absCrop.top)

  // Step D: The blind render loop
  canvas.skipOffscreen = false
  objects.forEach(obj => {
    const wasVisible = obj.visible
    obj.visible = true
    obj.objectCaching = false
    obj.render(ctx)
    obj.objectCaching = true
    obj.visible = wasVisible
  })

  ctx.restore()
  canvas.skipOffscreen = true

  // Step E: Off-thread encoding
  return new Promise((resolve) => {
    nativeCanvas.toBlob((blob) => {
      if (!blob) return resolve(null)

      resolve({
        img: URL.createObjectURL(blob),
        aspect_ratio: absCrop.width / absCrop.height
      })
    }, 'image/webp', 0.8)
  })
}

export async function exportCroppedJson(canvas: Canvas | StaticCanvas, relativeRect: any, threshold = 0.3) {
  const objects = canvas?.getObjects()
  if (!canvas || !objects || objects.length === 0) return null

  // 1. Map the relative UI crop to absolute world coordinates
  const totalBounds = computeBounds(objects)
  const absCrop = relativeToAbsolute(totalBounds, relativeRect)

  // 2. Mathematical Intersection Filtering
  const keepObjects = objects.filter(obj => {
    // @ts-ignore
    const b = obj.getBoundingRect(true)

    const xOverlap = Math.max(0, Math.min(b.left + b.width, absCrop.left + absCrop.width) - Math.max(b.left, absCrop.left))
    const yOverlap = Math.max(0, Math.min(b.top + b.height, absCrop.top + absCrop.height) - Math.max(b.top, absCrop.top))

    const intersectionArea = xOverlap * yOverlap
    const objArea = b.width * b.height

    return (intersectionArea / objArea) >= threshold
  })

  if (keepObjects.length === 0) return null

  const tempCanvas = new StaticCanvas(undefined, {
    width: absCrop.width,
    height: absCrop.height,
    backgroundColor: canvas.backgroundColor
  })

  const clonedObjects = await Promise.all(
    keepObjects.map(obj => obj.clone())
  )

  // 2. CALCULATE THE SHIFT TO CENTER
  // Find the exact center of the cropped area
  const cropCenterX = absCrop.left + (absCrop.width / 2)
  const cropCenterY = absCrop.top + (absCrop.height / 2)

  // The spot we want the crop to land on (the center of the workspace)
  const targetCenterX = CANVAS_SIZE / 2
  const targetCenterY = CANVAS_SIZE / 2

  // The delta distance to move every object
  const shiftX = targetCenterX - cropCenterX
  const shiftY = targetCenterY - cropCenterY

  clonedObjects.forEach(obj => {
    obj.set({
      left: obj.left + shiftX,
      top: obj.top + shiftY
    })
    tempCanvas.add(obj)
  })

  const jsonOutput = tempCanvas.toJSON()
  tempCanvas.dispose()

  return jsonOutput
}