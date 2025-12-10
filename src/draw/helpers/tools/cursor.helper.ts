import { Canvas } from 'fabric'

export function updateFreeDrawingCursor(c: Canvas, size: number, color: string, eraser = false) {
  const adjustedSize = size * c.getZoom()

  const canvas: HTMLCanvasElement = document.createElement('canvas')
  canvas.width = adjustedSize
  canvas.height = adjustedSize
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Failed to get canvas rendering context.')
  }

  // Draw the circle in the center
  ctx.beginPath()
  ctx.arc(adjustedSize / 2, adjustedSize / 2, adjustedSize / 2, 0, 2 * Math.PI, false)
  ctx.fillStyle = color
  ctx.fill()

  if (eraser) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2 // Adjust this value for border thickness
    ctx.stroke()
  }

  // Convert to data URL
  const url = canvas.toDataURL('image/png')
  c.freeDrawingCursor = `url(${url}) ${adjustedSize / 2} ${adjustedSize / 2}, crosshair`
  c.setCursor(c.freeDrawingCursor)
}