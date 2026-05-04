import { Canvas, StaticCanvas } from 'fabric'
import { compressImg, yieldToMain } from '@/helper/general.helper'
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

export async function exportBoundingBoxImage(
  canvas: Canvas,
  options: { maxSize?: number; asBuffer?: boolean; quality?: number, signal?: AbortSignal } = {}
) {
  const settings = {
    maxSize: options.maxSize || 2000,
    asBuffer: options.asBuffer || false,
    quality: options.quality || 0.8,
    signal: options.signal
  }

  const mode: string = 'main'

  let result
  if (mode === 'worker') {
    // result = await exportWithWebWorker(canvas, settings)
  } else {
    result = await exportWithMainThreadChunking(canvas, settings)
  }


  return result
}

/**
 * VERSION 1: Main Thread with RequestAnimationFrame Chunking
 * Focus: Prevents UI lockup by yielding control every few objects.
 */
async function exportWithMainThreadChunking(
  canvas: Canvas,
  options: { maxSize: number; asBuffer: boolean; quality: number; signal?: AbortSignal }
): Promise<{ img: string | ArrayBuffer, aspect_ratio: number } | null> {
  const { signal } = options
  const objects = canvas.getObjects()

  if (objects.length === 0) return null

  const TIME_BUDGET_MS = 8

  await yieldToMain()

  // 2. 🧮 TIME-BUDGETED BOUNDING BOX CALCULATION
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let frameStartTime = performance.now()

  for (let i = 0; i < objects.length; i++) {
    if (signal?.aborted) return null

    // @ts-ignore
    const bound = objects[i].getBoundingRect(true)
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)

    // Yield if we've spent too much time doing math
    if (performance.now() - frameStartTime > TIME_BUDGET_MS) {
      await yieldToMain()
      frameStartTime = performance.now() // Reset timer
    }
  }

  // Calculate Canvas Dimensions
  const padding = 50
  const width = (maxX + padding) - (minX - padding)
  const height = (maxY + padding) - (minY - padding)
  const scale = Math.min(options.maxSize / width, options.maxSize / height)

  const nativeCanvas = document.createElement('canvas')
  nativeCanvas.width = width * scale
  nativeCanvas.height = height * scale
  const ctx = nativeCanvas.getContext('2d', { alpha: true })
  if (!ctx) return null

  ctx.fillStyle = canvas.backgroundColor as any
  ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height)
  ctx.save()
  ctx.scale(scale, scale)
  ctx.translate(-(minX - padding), -(minY - padding))

  canvas.skipOffscreen = false

  // 3. 🎨 TIME-BUDGETED RENDERING
  // Instead of a fixed chunk size of 30, we render as many as we can in 8ms.
  frameStartTime = performance.now()

  for (let i = 0; i < objects.length; i++) {
    if (signal?.aborted) return null

    const obj = objects[i]
    const wasVisible = obj.visible
    obj.visible = true
    obj.objectCaching = false // Critical for clean high-res export
    obj.render(ctx)
    obj.objectCaching = true
    obj.visible = wasVisible

    // Yield if this object pushed us over our 8ms budget
    if (performance.now() - frameStartTime > TIME_BUDGET_MS) {
      await yieldToMain()
      frameStartTime = performance.now() // Reset timer
    }
  }

  if (signal?.aborted) return null

  canvas.skipOffscreen = true
  ctx.restore()

  // 4. GENERATE BLOB
  return new Promise((resolve, reject) => {
    if (signal) {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }

    nativeCanvas.toBlob(async (blob) => {
      if (!blob) return resolve(null)
      const result = options.asBuffer
        ? await blob.arrayBuffer()
        : URL.createObjectURL(blob)

      resolve({ img: result, aspect_ratio: width / height })
    }, 'image/webp', options.quality)
  })
}

/**
 * VERSION 2: Off-Thread via Web Worker
 * Focus: Moves heavy rendering logic entirely off the main thread.
 */
async function exportWithWebWorker(
  canvas: Canvas,
  options: { maxSize: number; asBuffer: boolean; quality: number }
): Promise<{ img: string | ArrayBuffer, aspect_ratio: number } | null> {
  const objects = canvas.getObjects()

  // 1. Serialization (The main thread cost)
  const serialStart = performance.now()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  objects.forEach(obj => {
    const bound = obj.getBoundingRect(true)
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)
  })

  const padding = 50
  const width = (maxX + padding) - (minX - padding)
  const height = (maxY + padding) - (minY - padding)
  const scale = Math.min(options.maxSize / width, options.maxSize / height)

  const serializedObjects = objects.map(obj => {
    const json = obj.toObject()
    json.left -= (minX - padding)
    json.top -= (minY - padding)
    return json
  })
  const serialTime = performance.now() - serialStart
  console.log(`[Metric] Worker Serialization Time: ${serialTime.toFixed(2)}ms`)

  // 2. Worker Execution
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = async (e) => {
      worker.terminate()
      if (e.data.error) return resolve(null)

      const blob = e.data.blob
      const result = options.asBuffer
        ? await blob.arrayBuffer()
        : URL.createObjectURL(blob)

      resolve({ img: result, aspect_ratio: width / height })
    }

    worker.postMessage({
      objects: serializedObjects,
      width,
      height,
      scale,
      backgroundColor: canvas.backgroundColor
    })
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