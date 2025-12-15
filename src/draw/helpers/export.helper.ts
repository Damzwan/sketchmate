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
      top: cloned.top - minY,
      visible: true
    })
    return cloned
  }))
  tempCanvas.add(...clonedItems)

  tempCanvas.renderAll()

  const minTargetSize = 2000

  const multiplierX = minTargetSize / width
  const multiplierY = minTargetSize / height

  const multiplier = Math.min(multiplierX, multiplierY, 2)


  return { img: tempCanvas.toDataURL({ multiplier: multiplier }), aspect_ratio: width / height }

}