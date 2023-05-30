import FloodFill, { ColorRGBA } from 'q-floodfill'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw.store'
import { IPoint } from 'fabric/fabric-impl'
import { resetZoom } from '@/helper/draw/gesture.helper'

export async function floodfill(c: fabric.Canvas, p: IPoint) {
  const { brushColor } = useDrawStore()
  const dpr = window.devicePixelRatio || 1

  const ctx = c.getContext()

  const imgData = ctx.getImageData(0, 0, c.width! * dpr, c.height! * dpr)

  const floodFill = new FloodFill(imgData)
  floodFill.collectModifiedPixels = true
  floodFill.isSameColor = isSameColor
  floodFill.fill(brushColor, Math.round(p.x * dpr), Math.round(p.y * dpr), 50)

  const modifiedPixels = floodFill.modifiedPixels
  if (modifiedPixels.size == 0) return null

  // Find the bounding box of the modified area
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  modifiedPixels.forEach(pixel => {
    const [x, y] = pixel.split('|').map(Number)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  })

  // Calculate the width and height of the modified area
  const width = maxX - minX + 1
  const height = maxY - minY + 1

  // Create a new ImageData object for the modified area
  const modifiedImgData = new ImageData(width, height)

  // Copy the modified pixels into the new ImageData object
  modifiedPixels.forEach(pixel => {
    const [x, y] = pixel.split('|').map(Number)
    const index = (y - minY) * width + (x - minX)
    const srcIndex = y * floodFill.imageData.width + x
    modifiedImgData.data[index * 4] = floodFill.imageData.data[srcIndex * 4] // Red channel
    modifiedImgData.data[index * 4 + 1] = floodFill.imageData.data[srcIndex * 4 + 1] // Green channel
    modifiedImgData.data[index * 4 + 2] = floodFill.imageData.data[srcIndex * 4 + 2] // Blue channel
    modifiedImgData.data[index * 4 + 3] = floodFill.imageData.data[srcIndex * 4 + 3] // Alpha channel
  })

  // draw the image data on a canvas
  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = width
  offscreenCanvas.height = height
  const offscreenCtx = offscreenCanvas.getContext('2d')
  offscreenCtx!.imageSmoothingEnabled = false
  offscreenCtx!.putImageData(modifiedImgData, 0, 0)

  return await new Promise<fabric.Image>(resolve => {
    fabric.Image.fromURL(offscreenCanvas.toDataURL(), img => {
      img.set({
        left: minX / dpr,
        top: minY / dpr,
        scaleX: 1 / dpr,
        scaleY: 1 / dpr
      })
      resolve(img)
    })
  })
}

function isSameColor(a: ColorRGBA, b: ColorRGBA, tolerance = 0): boolean {
  const diffR = Math.abs(a.r - b.r)
  const diffG = Math.abs(a.g - b.g)
  const diffB = Math.abs(a.b - b.b)
  const maxDiff = Math.max(diffR, diffG, diffB)

  return maxDiff <= 100
}
