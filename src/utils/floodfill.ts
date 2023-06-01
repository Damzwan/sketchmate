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
}
