import { PatternBrush, Point, Canvas, Path, Shadow, Pattern } from 'fabric'
import paperTexture from '@/assets/textures/paper2.jpg'
import { opacityFromOpacityHex } from '@/helper/draw/draw.helper'
import * as fabric from 'fabric'

export class WaterColorBrush extends PatternBrush {
  declare protected _points: Point[]
  declare protected oldEnd?: Point

  private paperTextureImg: HTMLImageElement

  constructor(canvas: Canvas) {
    super(canvas)
    this.canvas = canvas
    this._points = []
    this.paperTextureImg = new Image()
    this.paperTextureImg.src = paperTexture
  }

  /**
   * Returns a canvas with the watercolor pattern applied
   */
  getPatternSrc(): HTMLCanvasElement {
    const patternCanvas = document.createElement('canvas')
    const ctx = patternCanvas.getContext('2d')!
    patternCanvas.width = patternCanvas.height = 256

    // Draw paper texture
    ctx.drawImage(this.paperTextureImg, 0, 0, 256, 256)

    // Alpha gradient overlay
    const solidColor = this.color.slice(0, -2)
    const reducedAlpha1 = Math.round(0.7 * 255).toString(16).padStart(2, '0')
    const reducedAlpha2 = Math.round(0.4 * 255).toString(16).padStart(2, '0')

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, `${solidColor}${reducedAlpha1}`)
    gradient.addColorStop(1, `${solidColor}${reducedAlpha2}`)

    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    ctx.globalCompositeOperation = 'source-over'

    return patternCanvas
  }

  /**
   * Returns the actual pattern instance
   */
  getPattern(ctx: CanvasRenderingContext2D) {
    return ctx.createPattern(this.getPatternSrc(), 'repeat')
  }

  /**
   * Create a Path object using the pattern
   */
  createPath(pathData: fabric.util.TSimplePathData): Path {
    const path = super.createPath(pathData)
    const topLeft = path._getLeftTopCoords().scalarAdd(path.strokeWidth / 2)

    path.stroke = new Pattern({
      source: this.getPatternSrc(),
      offsetX: -topLeft.x,
      offsetY: -topLeft.y
    })

    path.opacity = opacityFromOpacityHex(this.color)

    if (this.shadow) {
      this.shadow.affectStroke = true
      path.shadow = new Shadow(this.shadow)
    }

    return path
  }

  /**
   * Draw the path as a smooth watercolor line on top canvas
   */
  onMouseDown(pointer: Point) {
    this._points = []
    this._addPoint(pointer)
    this._render()
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer) && this._points.length > 1) {
      this.canvas.clearContext(this.canvas.contextTop)
      this._render()
    }
  }

  onMouseUp() {
    this._finalizeAndAddPath()
    return false
  }

  private _addPoint(point: Point) {
    if (this._points.length > 1 && point.eq(this._points[this._points.length - 1])) {
      return false
    }

    // Add jagged points
    if (this._points.length > 0) {
      const prev = this._points[this._points.length - 1]
      const jagged = this._addJaggedness(prev, point)
      this._points.push(...jagged)
    }

    // Add the main point
    this._points.push(point)

    return true
  }


  private _addJaggedness(p1: Point, p2: Point) {
    const jaggedPoints: Point[] = []
    const num = 4
    for (let i = 1; i <= num; i++) {
      const t = i / (num + 1)
      const x = p1.x + t * (p2.x - p1.x) + (Math.random() - 0.5) * 5
      const y = p1.y + t * (p2.y - p1.y) + (Math.random() - 0.5) * 5
      jaggedPoints.push(new Point(x, y))
    }
    return jaggedPoints
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (!this._points.length) return

    this._saveAndTransform(ctx)
    ctx.beginPath()
    ctx.strokeStyle = this.getPattern(ctx) as unknown as string
    ctx.lineWidth = this.width

    let p1 = this._points[0]
    for (let i = 1; i < this._points.length; i++) {
      const p2 = this._points[i]
      const mid = p1.midPointFrom(p2)
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y)
      p1 = p2
    }

    ctx.stroke()
    ctx.restore()
  }


}
