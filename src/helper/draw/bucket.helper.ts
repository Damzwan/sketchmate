import { Canvas, Point, Image, FabricImage } from 'fabric'
import { usePen } from '@/store/draw/tools/pen.store'
import { CustomFloodFill } from '@/utils/CustomFloodFill'
import { hex2RGBA, resetZoom } from '@/helper/draw/draw.helper'

export async function bucketFill(c: Canvas, p: Point, scale = 0.5) {
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

  downscaledCanvas.width = Math.ceil(offscreenCanvas.width / (dpr * scale * c.getZoom()))
  downscaledCanvas.height = Math.ceil(offscreenCanvas.height / (dpr * scale * c.getZoom()))
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

  const img = await FabricImage.fromURL(downscaledCanvas.toDataURL())
  const vpt = c.viewportTransform
  const offsetX = vpt[4]
  const offsetY = vpt[5]

  img.set({
    originX: 'center',
    originY: 'center',
    left: ((modifiedArea.minX + modifiedArea.width / 2) / (scale * dpr) - offsetX) / c.getZoom(),
    top: ((modifiedArea.minY + (modifiedArea.height / 2)) / (scale * dpr) - offsetY) / c.getZoom()
  })

  return img
}

function createDownScaledCanvas(c: Canvas, scale: number) {
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


  return downscaledCanvas
}