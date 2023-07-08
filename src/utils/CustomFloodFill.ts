import { ColorRGBA, colorToRGBA, getColorAtPixel, isSameColor, setColorAtPixel } from 'q-floodfill'

type PixelCoords = {
  x: number
  y: number
}

/**
 * [startX, endX, y, parentY]
 */
type LineQueued = [number, number]

export class CustomFloodFill {
  public imageData: ImageData
  public isSameColor: typeof isSameColor
  public setColorAtPixel: typeof setColorAtPixel
  public getColorAtPixel: typeof getColorAtPixel
  public colorToRGBA: typeof colorToRGBA
  public collectModifiedPixels = false
  public modifiedPixelsCount = 0
  public modifiedPixels: Set<string> = new Set()

  public modifiedMinX = Number.POSITIVE_INFINITY
  public modifiedMinY = Number.POSITIVE_INFINITY
  public modifiedMaxX = Number.NEGATIVE_INFINITY
  public modifiedMaxY = Number.NEGATIVE_INFINITY

  private _tolerance = 0
  private queue: Array<LineQueued> = []
  private _replacedColor: ColorRGBA
  private _newColor: ColorRGBA
  private baseColor = colorToRGBA('#000000')

  constructor(imageData: ImageData) {
    this.imageData = imageData
    this._replacedColor = this.baseColor
    this._newColor = this.baseColor
    // Allow for custom implementations of the following methods
    this.isSameColor = isSameColor
    this.setColorAtPixel = setColorAtPixel
    this.getColorAtPixel = getColorAtPixel
    this.colorToRGBA = colorToRGBA
  }

  /**
   * color should be in CSS format - rgba, rgb, or HEX
   */
  public fill(color: string, x: number, y: number, tolerance: number): void {
    this._newColor = this.colorToRGBA(color)
    this._replacedColor = this.getColorAtPixel(this.imageData, x, y)
    this._tolerance = tolerance
    this.resetModifiedArea()
    if (this.isSameColor(this._replacedColor, this._newColor, this._tolerance)) {
      return
    }

    // Initialize the visited array
    const visited = Array.from({ length: this.imageData.height }, () => new Array(this.imageData.width).fill(false))

    this.queue.push([x, y])
    visited[y][x] = true

    while (this.queue.length) {
      const [curX, curY] = this.queue.pop()!
      this.setPixelColor(this._newColor, curX, curY)

      // Get all neighbors within radius and color them
      const neighbors = this.getNeighboursWithinRadius(curX, curY, 1)
      for (const { x: nX, y: nY } of neighbors) {
        if (!visited[nY][nX]) {
          if (this.isValidTarget(nX, nY)) {
            this.queue.push([nX, nY])
            visited[nY][nX] = true
          } else {
            this.setPixelColor(this._newColor, nX, nY)
          }
        }
      }
    }
  }

  private getNeighboursWithinRadius(x: number, y: number, radius: number): PixelCoords[] {
    const neighbours = []
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        if (i === 0 && j === 0) continue // Skip the center pixel
        if (this.isInRange(x + i, y + j)) {
          neighbours.push({ x: x + i, y: y + j })
        }
      }
    }
    return neighbours
  }

  private isInRange(x: number, y: number): boolean {
    return x >= 0 && x < this.imageData.width && y >= 0 && y < this.imageData.height
  }
  private isValidTarget(x: number, y: number) {
    if (x <= -1 || x >= this.imageData.width || y <= -1 || y >= this.imageData.height) return false
    const pixelColor = this.getColorAtPixel(this.imageData, x, y)
    return this.isSameColor(this._replacedColor, pixelColor, this._tolerance)
  }

  private setPixelColor(color: ColorRGBA, curX: number, curY: number): void {
    this.setColorAtPixel(this.imageData, color, curX, curY)
    this.modifiedPixelsCount++
    this.collectModifiedPixels && this.modifiedPixels.add(`${curX}|${curY}`)
    this.modifiedMinX = Math.min(this.modifiedMinX, curX)
    this.modifiedMinY = Math.min(this.modifiedMinY, curY)
    this.modifiedMaxX = Math.max(this.modifiedMaxX, curX)
    this.modifiedMaxY = Math.max(this.modifiedMaxY, curY)
  }

  private resetModifiedArea() {
    this.modifiedMinX = Number.POSITIVE_INFINITY
    this.modifiedMinY = Number.POSITIVE_INFINITY
    this.modifiedMaxX = Number.NEGATIVE_INFINITY
    this.modifiedMaxY = Number.NEGATIVE_INFINITY
  }

  public getModifiedArea() {
    return {
      minX: this.modifiedMinX,
      minY: this.modifiedMinY,
      maxX: this.modifiedMaxX,
      maxY: this.modifiedMaxY,
      width: this.modifiedMaxX - this.modifiedMinX + 1,
      height: this.modifiedMaxY - this.modifiedMinY + 1
    }
  }

  public getModifiedImageData(fillColor: ColorRGBA) {
    const { minX, minY, maxX, maxY, width, height } = this.getModifiedArea()
    const modifiedImageData = new ImageData(width, height)

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const color = this.getColorAtPixel(this.imageData, x, y)

        if (this.isSameColor(color, fillColor)) {
          this.setColorAtPixel(modifiedImageData, color, x - minX, y - minY)
        }
      }
    }

    return modifiedImageData
  }
}
