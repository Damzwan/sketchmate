import { ColorRGBA, colorToRGBA, getColorAtPixel, isSameColor, setColorAtPixel } from 'q-floodfill'

type PixelCoords = {
  x: number
  y: number
}

/**
 * [startX, endX, y, parentY]
 */
type LineQueued = [number, number, number, number]

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
  private _queue: Array<LineQueued> = []
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
    if (this.isSameColor(this._replacedColor, this._newColor, this._tolerance)) {
      return
    }

    this.addToQueue([x, x, y, -1])
    this.fillQueue()
  }

  private addToQueue(line: LineQueued): void {
    this._queue.push(line)
  }

  private popFromQueue(): LineQueued | undefined {
    if (!this._queue.length) {
      return undefined
    }
    return this._queue.pop()
  }

  private isValidTarget(pixel: PixelCoords | null): boolean {
    if (pixel === null) {
      return false
    }
    const pixelColor = this.getColorAtPixel(this.imageData, pixel.x, pixel.y)
    return this.isSameColor(this._replacedColor, pixelColor, this._tolerance)
  }

  private fillLineAt(x: number, y: number): [number, number] {
    if (!this.isValidTarget({ x, y })) {
      return [-1, -1]
    }
    this.setPixelColor(this._newColor, { x, y })
    let minX = x
    let maxX = x
    let px = this.getPixelNeighbour('left', minX, y)
    while (px && this.isValidTarget(px)) {
      this.setPixelColor(this._newColor, px)
      minX = px.x
      px = this.getPixelNeighbour('left', minX, y)
    }
    if (px) this.setPixelColor(this._newColor, px)
    px = this.getPixelNeighbour('right', maxX, y)
    while (px && this.isValidTarget(px)) {
      this.setPixelColor(this._newColor, px)
      maxX = px.x
      px = this.getPixelNeighbour('right', maxX, y)
    }
    if (px) this.setPixelColor(this._newColor, px)
    return [minX, maxX]
  }

  private fillQueue(): void {
    let line = this.popFromQueue()
    while (line) {
      const [start, end, y, parentY] = line
      let currX = start
      while (currX !== -1 && currX <= end) {
        const [lineStart, lineEnd] = this.fillLineAt(currX, y)
        if (lineStart !== -1) {
          if (lineStart >= start && lineEnd <= end && parentY !== -1) {
            if (parentY < y && y + 1 < this.imageData.height) {
              this.addToQueue([lineStart, lineEnd, y + 1, y])
            }
            if (parentY > y && y > 0) {
              this.addToQueue([lineStart, lineEnd, y - 1, y])
            }
          } else {
            if (y > 0) {
              this.addToQueue([lineStart, lineEnd, y - 1, y])
            }
            if (y + 1 < this.imageData.height) {
              this.addToQueue([lineStart, lineEnd, y + 1, y])
            }
          }
        }
        if (lineEnd === -1 && currX <= end) {
          currX += 1
        } else {
          currX = lineEnd + 1
        }
      }
      line = this.popFromQueue()
    }
  }

  private setPixelColor(color: ColorRGBA, pixel: PixelCoords): void {
    this.setColorAtPixel(this.imageData, color, pixel.x, pixel.y)
    this.modifiedPixelsCount++
    this.collectModifiedPixels && this.modifiedPixels.add(`${pixel.x}|${pixel.y}`)
    this.modifiedMinX = Math.min(this.modifiedMinX, pixel.x)
    this.modifiedMinY = Math.min(this.modifiedMinY, pixel.y)
    this.modifiedMaxX = Math.max(this.modifiedMaxX, pixel.x)
    this.modifiedMaxY = Math.max(this.modifiedMaxY, pixel.y)
  }

  private getPixelNeighbour(direction: 'left' | 'right', x: number, y: number): PixelCoords | null {
    x = x | 0
    y = y | 0
    let coords: PixelCoords
    switch (direction) {
      case 'right':
        coords = { x: (x + 1) | 0, y }
        break
      case 'left':
        coords = { x: (x - 1) | 0, y }
        break
    }
    if (coords.x >= 0 && coords.x < this.imageData.width) {
      return coords
    }
    return null
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
