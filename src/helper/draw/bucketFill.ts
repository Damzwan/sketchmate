import FloodFill, { ColorRGBA } from 'q-floodfill'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw.store'
import { IPoint } from 'fabric/fabric-impl'
import { resetZoom } from '@/helper/draw/gesture.helper'
import { CustomFloodFill } from '@/utils/floodfill'

export async function bucketFill(c: fabric.Canvas, p: IPoint, scale = 0.5) {
  let startTime = performance.now()
  const { brushColor } = useDrawStore()
  const dpr = window.devicePixelRatio || 1

  const helper = c as any
  const lowerCanvas = helper.lowerCanvasEl as HTMLCanvasElement // this canvas contains the drawing data

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

  const imgData = downscaledCtx!.getImageData(0, 0, downscaledCanvas.width, downscaledCanvas.height)
  console.log(`Get image data took ${performance.now() - startTime} ms`)

  startTime = performance.now()
  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, Math.round(p.x * dpr * scale), Math.round(p.y * dpr * scale), 50)
  console.log(`Flood fill operation took ${performance.now() - startTime} ms`)

  startTime = performance.now()
  if (floodFill.modifiedPixelsCount == 0) return null

  const modifiedArea = floodFill.getModifiedArea()
  downscaledCtx!.putImageData(floodFill.imageData, 0, 0)

  // Create a new canvas to copy the filled area from the temp canvas
  const offscreenCanvas = document.createElement('canvas')
  const offscreenCtx = offscreenCanvas.getContext('2d')
  offscreenCanvas.width = modifiedArea.width / (scale * dpr)
  offscreenCanvas.height = modifiedArea.height / (scale * dpr)
  offscreenCtx!.drawImage(
    downscaledCanvas,
    modifiedArea.minX,
    modifiedArea.minY,
    modifiedArea.width,
    modifiedArea.height,
    0,
    0,
    offscreenCanvas.width,
    offscreenCanvas.height
  )

  console.log(`Drawing image on canvas took ${performance.now() - startTime} ms`)

  return await new Promise<fabric.Image>(resolve => {
    startTime = performance.now()
    fabric.Image.fromURL(offscreenCanvas.toDataURL(), img => {
      img.set({
        left: modifiedArea.minX / (scale * dpr),
        top: modifiedArea.minY / (scale * dpr)
      })
      console.log(`Fabric image setup took ${performance.now() - startTime} ms`)
      resolve(img)
    })
  })
}
