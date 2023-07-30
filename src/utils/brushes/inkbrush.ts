import { fabric } from 'fabric'
import { Canvas } from 'fabric/fabric-impl'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export class InkBrush extends fabric.BaseBrush {
  color = '#000'
  opacity = 1
  width = 30
  _baseWidth = 20
  _inkAmount = 7
  _lastPoint: fabric.Point | null = null
  _point: fabric.Point | null = null
  _range = 10
  _strokes: fabric.Stroke[] | null = null

  constructor(private canvas: Canvas, opt?: any) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    super(canvas)

    opt = opt || {}
    this.width = opt.width || canvas.freeDrawingBrush.width
    this.color = opt.color || canvas.freeDrawingBrush.color
    this.opacity = opt.opacity || canvas.contextTop.globalAlpha

    this._point = new fabric.Point(0, 0)
  }

  _render(pointer: fabric.Point): void {
    const point = this.setPointer(pointer)
    const subtractPoint = point.subtract(this._lastPoint as fabric.Point)
    const distance = point.distanceFrom(this._lastPoint as fabric.Point)

    for (let i = 0, len = this._strokes?.length || 0; i < len; i++) {
      const stroke = this._strokes![i]
      stroke.update(point, subtractPoint, distance)
      stroke.draw()
    }

    if (distance > 30) {
      this.drawSplash(point, this._inkAmount)
    }
  }

  onMouseDown(pointer: fabric.Point): void {
    this.canvas.contextTop.globalAlpha = this.opacity
    this._resetTip(pointer)
  }

  onMouseMove(pointer: fabric.Point): void {
    this._render(pointer)
  }

  onMouseUp(): void {
    this.convertToImg()
    this.canvas.contextTop.globalAlpha = 1
  }

  drawSplash(pointer: fabric.Point, maxSize: number): void {
    const ctx = this.canvas.contextTop
    const num = fabric.util.getRandom(12)
    const range = maxSize * 10

    ctx.save()
    for (let i = 0; i < num; i++) {
      const r = fabric.util.getRandom(range, 1)
      const c = fabric.util.getRandom(Math.PI * 2)
      const point = new fabric.Point(pointer.x + r * Math.sin(c), pointer.y + r * Math.cos(c))

      ctx.fillStyle = this.color
      ctx.beginPath()
      ctx.arc(point.x, point.y, fabric.util.getRandom(maxSize) / 2, 0, Math.PI * 2, false)
      ctx.fill()
    }
    ctx.restore()
  }

  setPointer(pointer: fabric.Point): fabric.Point {
    const point = new fabric.Point(pointer.x, pointer.y)

    this._lastPoint = fabric.util.object.clone(this._point as fabric.Point)
    this._point = point

    return point
  }

  _resetTip(pointer: fabric.Point): void {
    const point = this.setPointer(pointer)

    this._strokes = []
    this._range = this.width / 5 + this._baseWidth

    for (let i = 0, len = this._range; i < len; i++) {
      this._strokes[i] = new fabric.Stroke(
        this.canvas.contextTop,
        point,
        this._range,
        this.color,
        this.width,
        this._inkAmount
      )
    }
  }
}
