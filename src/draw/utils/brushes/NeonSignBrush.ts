import { BaseBrush, Point, Canvas, Path, Shadow } from 'fabric'
import * as fabric from 'fabric'

export class NeonBrush extends BaseBrush {
  declare protected _points: Point[]

  constructor(canvas: Canvas) {
    super(canvas)
    this.canvas = canvas
    this._points = []
  }

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
    const originalRenderOnAddRemove = this.canvas.renderOnAddRemove
    this.canvas.renderOnAddRemove = false

    let pathString = ''

    // We bend the glass tube using smooth quadratic curves
    if (this._points.length > 0) {
      let p1 = this._points[0]
      pathString += `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `

      for (let i = 1; i < this._points.length; i++) {
        const p2 = this._points[i]
        const mid = p1.midPointFrom(p2)
        pathString += `Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} `
        p1 = p2
      }
      pathString += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `
    }

    if (pathString) {
      // The Plasma Core: Thinner than the brush width and pure white
      const coreWidth = Math.max(2, this.width * 0.3)

      const path = new Path(pathString, {
        fill: '',
        stroke: '#ffffff', // Hot white center
        strokeWidth: coreWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        objectCaching: true,
        interactive: false
      })

      // The Radiological Halo: The colored glow radiating from the core
      path.set('shadow', new Shadow({
        color: this.color,
        blur: this.width * 1.5, // Wide, intense spread
        offsetX: 0,
        offsetY: 0,
        affectStroke: true
      }))

      this.canvas.fire('before:path:created', { path })
      this.canvas.add(path)
      this.canvas.fire('path:created', { path })
    }

    this.canvas.clearContext(this.canvas.contextTop)
    this.canvas.renderOnAddRemove = originalRenderOnAddRemove
    this.canvas.requestRenderAll()

    // Sterilize the instruments
    this._points = []
    return false
  }

  private _addPoint(point: Point) {
    // Glass tubing requires a steady hand; we only drop points if the mouse actually moves
    if (this._points.length > 0 && point.eq(this._points[this._points.length - 1])) {
      return false
    }
    this._points.push(point)
    return true
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (!this._points.length) return

    this._saveAndTransform(ctx)

    // Live Surgical Preview Setup
    const coreWidth = Math.max(2, this.width * 0.3)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = coreWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.shadowColor = this.color
    ctx.shadowBlur = this.width * 1.5

    ctx.beginPath()
    let p1 = this._points[0]
    ctx.moveTo(p1.x, p1.y)

    // Bend the live preview glass
    for (let i = 1; i < this._points.length; i++) {
      const p2 = this._points[i]
      const mid = p1.midPointFrom(p2)
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y)
      p1 = p2
    }
    ctx.lineTo(p1.x, p1.y)

    ctx.stroke()
    ctx.restore()
  }
}