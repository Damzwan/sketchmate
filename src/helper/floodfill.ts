import { Point } from '@/types/draw.types'

export function floodFill(
  startX: number,
  startY: number,
  startColor: [number, number, number],
  fillColor: [number, number, number],
  canvasData: ImageData,
  width: number,
  height: number
) {
  const pixelStack: Point[] = [{ x: startX, y: startY }]

  for (let i = 0; i < canvasData.data.length; i++) {
    canvasData.data[i] = 0
  }

  // while (pixelStack.length > 0) {
  //   console.log(pixelStack.length)
  //   const newPos = pixelStack.pop() as Point
  //
  //   const pixelPos = calcPixelPos(newPos, width)
  //   if (!matchStartColor(canvasData, pixelPos, startColor)) continue
  //   colorPixel(canvasData, pixelPos, fillColor)
  //
  //   if (inBounds({ x: newPos.x - 1, y: newPos.y }, width, height)) pixelStack.push({ x: newPos.x - 1, y: newPos.y })
  //   if (inBounds({ x: newPos.x + 1, y: newPos.y }, width, height)) pixelStack.push({ x: newPos.x + 1, y: newPos.y })
  //   if (inBounds({ x: newPos.x, y: newPos.y - 1 }, width, height)) pixelStack.push({ x: newPos.x, y: newPos.y - 1 })
  //   if (inBounds({ x: newPos.x, y: newPos.y + 1 }, width, height)) pixelStack.push({ x: newPos.x, y: newPos.y + 1 })
  // }
}

function matchStartColor(canvasData: ImageData, pixelPos: number, startColor: [number, number, number]): boolean {
  const r: number = canvasData.data[pixelPos]
  const g: number = canvasData.data[pixelPos + 1]
  const b: number = canvasData.data[pixelPos + 2]

  return r === startColor[0] && g === startColor[1] && b === startColor[2]
}

function colorPixel(canvasData: ImageData, pixelPos: number, fillColor: number[], a = 255): void {
  canvasData.data[pixelPos] = fillColor[0]
  canvasData.data[pixelPos + 1] = fillColor[1]
  canvasData.data[pixelPos + 2] = fillColor[2]
  canvasData.data[pixelPos + 3] = a
}

function calcPixelPos(point: Point, width: number) {
  return (point.y * width + point.x) * 4
}

function inBounds(point: Point, width: number, height: number) {
  const inWidth = point.x > 0 && point.x < width
  const inHeight = point.y > 0 && point.y < height
  return inWidth && inHeight
}
