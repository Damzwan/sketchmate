import FloodFill, { ColorRGBA } from 'q-floodfill'

type PixelCoords = {
  x: number
  y: number
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export class CustomFloodFill extends FloodFill {
  public modifiedMinX = Number.POSITIVE_INFINITY
  public modifiedMinY = Number.POSITIVE_INFINITY
  public modifiedMaxX = Number.NEGATIVE_INFINITY
  public modifiedMaxY = Number.NEGATIVE_INFINITY

  constructor(imageData: ImageData) {
    super(imageData)
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

  private fillLineAt(x: number, y: number): [number, number] {
    if (!this.isValidTarget({ x, y }) && !this.isPossibleAntiAliasedPixel({ x, y })) {
      return [-1, -1]
    }
    this.setPixelColor(this._newColor, { x, y })
    let minX = x
    let maxX = x
    let px = this.getPixelNeighbour('left', minX, y)
    while (px && (this.isValidTarget(px) || this.isPossibleAntiAliasedPixel(px))) {
      this.setPixelColor(this._newColor, px)
      minX = px.x
      px = this.getPixelNeighbour('left', minX, y)
    }
    px = this.getPixelNeighbour('right', maxX, y)
    while (px && (this.isValidTarget(px) || this.isPossibleAntiAliasedPixel(px))) {
      this.setPixelColor(this._newColor, px)
      maxX = px.x
      px = this.getPixelNeighbour('right', maxX, y)
    }
    return [minX, maxX]
  }

  private isPossibleAntiAliasedPixel(pixel: PixelCoords | null): boolean {
    if (pixel === null) {
      return false
    }
    const pixelColor = this.getColorAtPixel(this.imageData, pixel.x, pixel.y)

    // Collect all neighbors
    const neighbors = this.getPixelNeighbors(pixel)

    // Define a function that checks if a pixel color is different from the current pixel's color
    const isDifferentFromCurrentColor = (neighbor: PixelCoords): boolean => {
      const neighborColor = this.getColorAtPixel(this.imageData, neighbor.x, neighbor.y)
      return !this.isSameColor(neighborColor, pixelColor, 0)
    }

    // A pixel is possibly anti-aliased if at least 7 of its neighbors have a different color
    const differentColorCount = neighbors.filter(isDifferentFromCurrentColor).length
    return differentColorCount >= 7
  }

  // Add a method to get all neighboring pixels of a given pixel
  private getPixelNeighbors(pixel: PixelCoords): PixelCoords[] {
    const { x, y } = pixel
    const neighbors = []

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue // Skip the center pixel
        if (x + i >= 0 && x + i < this.imageData.width && y + j >= 0 && y + j < this.imageData.height) {
          neighbors.push({ x: x + i, y: y + j })
        }
      }
    }

    return neighbors
  }
}
