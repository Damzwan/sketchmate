import { Canvas, StaticCanvas } from 'fabric'
import { compressImg } from '@/helper/general.helper'

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
    return { img: canvas.toDataURL({ multiplier: 2 }), aspect_ratio: canvas.width / canvas.height }
  }

  // 1. Save the user's current zoom and pan state
  const originalVpt: any = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]

  // 2. Reset to absolute 1:1 scale and 0,0 pan
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

  // 3. Initialize bounding box extremes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  // 4. Iterate over all objects to find the absolute bounding box
  objects.forEach(obj => {
    const bounds = obj.getBoundingRect() // Now returns clean, un-zoomed coordinates
    minX = Math.min(minX, bounds.left)
    minY = Math.min(minY, bounds.top)
    maxX = Math.max(maxX, bounds.left + bounds.width)
    maxY = Math.max(maxY, bounds.top + bounds.height)
  })

  const width = maxX - minX
  const height = maxY - minY

  // 5. Important: Restore viewport before returning if invalid!
  if (width <= 0 || height <= 0) {
    canvas.setViewportTransform(originalVpt)
    return null
  }

  const minTargetSize = 2000
  const multiplierX = minTargetSize / width
  const multiplierY = minTargetSize / height
  const multiplier = Math.min(multiplierX, multiplierY, 2)

  // 6. Export directly with the clean coordinates
  const img = canvas.toDataURL({
    left: minX,
    top: minY,
    width: width,
    height: height,
    multiplier: multiplier
  })

  // 7. Snap the user's zoom and pan back to exactly how they had it
  canvas.setViewportTransform(originalVpt)

  return { img, aspect_ratio: width / height }
}