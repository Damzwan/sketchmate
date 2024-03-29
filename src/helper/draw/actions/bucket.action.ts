import { fabric } from 'fabric'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { hex2RGBA, resetZoom } from '@/helper/draw/draw.helper'
import { CustomFloodFill } from '@/utils/CustomFloodFill'
import { usePen } from '@/service/draw/tools/pen.tool'

export async function bucketFill(c: fabric.Canvas, p: IPoint, scale = 0.5) {
  let startTime = performance.now()
  const { brushColorWithOpacity } = usePen()
  const dpr = window.devicePixelRatio || 1

  const downscaledCanvas = createDownScaledCanvas(c, scale)
  const downscaledCtx = downscaledCanvas.getContext('2d')

  const imgData = downscaledCtx!.getImageData(0, 0, downscaledCanvas.width, downscaledCanvas.height)
  const brushColor = brushColorWithOpacity()

  startTime = performance.now()
  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, Math.round(p.x * dpr * scale), Math.round(p.y * dpr * scale), 10)
  const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor))

  if (floodFill.modifiedPixelsCount == 0) return null

  const modifiedArea = floodFill.getModifiedArea()

  const offscreenCanvas = document.createElement('canvas')
  const offscreenCtx = offscreenCanvas.getContext('2d')
  offscreenCanvas.width = modifiedImgData.width
  offscreenCanvas.height = modifiedImgData.height
  offscreenCtx!.putImageData(modifiedImgData, 0, 0)

  downscaledCanvas.width = Math.ceil(offscreenCanvas.width / (dpr * scale))
  downscaledCanvas.height = Math.ceil(offscreenCanvas.height / (dpr * scale))
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

  return await new Promise<fabric.Image>(resolve => {
    fabric.Image.fromURL(downscaledCanvas.toDataURL(), img => {
      img.set({
        left: modifiedArea.minX / (scale * dpr),
        top: modifiedArea.minY / (scale * dpr)
      })
      console.log(`Floodfill took ${performance.now() - startTime} ms`)
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
  c.renderAll()

  return downscaledCanvas
}
