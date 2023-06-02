import { colorToRGBA } from 'q-floodfill'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw.store'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { CustomFloodFill } from '@/utils/floodfill'
import { resetZoom } from '@/helper/draw/draw.helper'

export async function bucketFill(c: fabric.Canvas, p: IPoint, scale = 0.5) {
  let startTime = performance.now()
  const { brushColor } = useDrawStore()
  const dpr = window.devicePixelRatio || 1

  const downscaledCanvas = createDownScaledCanvas(c, scale)
  const downscaledCtx = downscaledCanvas.getContext('2d')

  const imgData = downscaledCtx!.getImageData(0, 0, downscaledCanvas.width, downscaledCanvas.height)
  console.log(`Get image data took ${performance.now() - startTime} ms`)

  startTime = performance.now()
  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, Math.round(p.x * dpr * scale), Math.round(p.y * dpr * scale), 50)
  const modifiedImgData = floodFill.getModifiedImageData(colorToRGBA(brushColor))
  console.log(`Flood fill operation took ${performance.now() - startTime} ms`)

  startTime = performance.now()
  if (floodFill.modifiedPixelsCount == 0) return null

  const modifiedArea = floodFill.getModifiedArea()

  const offscreenCanvas = document.createElement('canvas')
  const offscreenCtx = offscreenCanvas.getContext('2d')
  offscreenCanvas.width = modifiedImgData.width
  offscreenCanvas.height = modifiedImgData.height
  offscreenCtx!.putImageData(modifiedImgData, 0, 0)

  downscaledCanvas.width = offscreenCanvas.width / (dpr * scale)
  downscaledCanvas.height = offscreenCanvas.height / (dpr * scale)
  downscaledCtx!.drawImage(
    offscreenCanvas,
    0,
    0,
    offscreenCanvas.width,
    offscreenCanvas.height,
    0,
    0,
    downscaledCanvas.width,
    downscaledCanvas.height
  )

  console.log(`Drawing image on canvas took ${performance.now() - startTime} ms`)

  return await new Promise<fabric.Image>(resolve => {
    startTime = performance.now()
    fabric.Image.fromURL(downscaledCanvas.toDataURL(), img => {
      img.set({
        left: modifiedArea.minX / (scale * dpr),
        top: modifiedArea.minY / (scale * dpr)
      })
      console.log(`Fabric image setup took ${performance.now() - startTime} ms`)
      resolve(img)
    })
  })
}

function createDownScaledCanvas(c: Canvas, scale: number) {
  const helper = c as any
  const lowerCanvas = helper.lowerCanvasEl as HTMLCanvasElement // this canvas contains the drawing data

  const oldZoom = c.getZoom()
  const oldViewportTransform = c.viewportTransform

  resetZoom(c)
  c.renderAll()

  // Create a downscaled version of the original image
  const downscaledCanvas = document.createElement('canvas')
  downscaledCanvas.width = lowerCanvas.width * scale
  downscaledCanvas.height = lowerCanvas.height * scale
  const downscaledCtx = downscaledCanvas.getContext('2d')
  downscaledCtx!.drawImage(
    lowerCanvas,
    0,
    0,
    lowerCanvas.width,
    lowerCanvas.height,
    0,
    0,
    downscaledCanvas.width,
    downscaledCanvas.height
  )

  c.setViewportTransform(oldViewportTransform!)
  c.setZoom(oldZoom)

  return downscaledCanvas
}
