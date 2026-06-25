import { BaseBrush, Point, Canvas, FabricImage } from 'fabric'
import * as fabric from 'fabric'

export class NeonBrush extends BaseBrush {
  protected declare _points: Point[]

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

    if (this._points.length > 0) {
      const img = this._flattenToImage()
      if (img) {
        this.canvas.fire('before:path:created', { path: img })
        this.canvas.add(img)
        this.canvas.fire('path:created', { path: img })
      }
    }

    this.canvas.clearContext(this.canvas.contextTop)
    this.canvas.renderOnAddRemove = originalRenderOnAddRemove
    this._points = []
    return false
  }

  private _flattenToImage(): FabricImage | null {
    const coreWidth = Math.max(2, this.width * 0.3)
    const blur = this.width * 1.5
    const margin = blur + coreWidth

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of this._points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    minX -= margin
    minY -= margin
    maxX += margin
    maxY += margin

    const w = Math.ceil(maxX - minX)
    const h = Math.ceil(maxY - minY)
    if (w <= 0 || h <= 0) return null

    const baseDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    const dpr = Math.min(baseDpr * 2, 3)

    const off = document.createElement('canvas')
    off.width = Math.ceil(w * dpr)
    off.height = Math.ceil(h * dpr)
    const ctx = off.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)

    // 1. Glow Pass
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = coreWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = this.color as string
    ctx.shadowBlur = blur
    ctx.globalAlpha = 0.9 // Slight compensation for downscaling concentration

    ctx.beginPath()
    let p1 = this._points[0]
    ctx.moveTo(p1.x - minX, p1.y - minY)
    for (let i = 1; i < this._points.length; i++) {
      const p2 = this._points[i]
      const mid = p1.midPointFrom(p2)
      ctx.quadraticCurveTo(p1.x - minX, p1.y - minY, (mid.x - minX), (mid.y - minY))
      p1 = p2
    }
    ctx.lineTo(p1.x - minX, p1.y - minY)
    ctx.stroke()

    // 2. Crisp Core Pass (Shadowless)
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.globalAlpha = 1.0
    ctx.stroke()

    const img = new FabricImage(off, {
      left: minX + w / 2,
      top: minY + h / 2,
      originX: 'center',
      originY: 'center',
      scaleX: 1 / dpr,
      scaleY: 1 / dpr,
      objectCaching: false,
      interactive: false
    })
    return img
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (!this._points.length) return
    this._saveAndTransform(ctx)

    const vpt = this.canvas.viewportTransform
    const zoom = vpt ? vpt[0] : 1
    const coreWidth = Math.max(2, this.width * 0.3)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 1. Glow Pass
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = coreWidth
    ctx.shadowColor = this.color as string
    ctx.shadowBlur = this.width * 1.5 * zoom
    ctx.globalAlpha = 0.9

    ctx.beginPath()
    let p1 = this._points[0]
    ctx.moveTo(p1.x, p1.y)
    for (let i = 1; i < this._points.length; i++) {
      const p2 = this._points[i]
      const mid = p1.midPointFrom(p2)
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y)
      p1 = p2
    }
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()


    // 2. Crisp Core Pass
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.globalAlpha = 1.0
    ctx.stroke()

    ctx.restore()
  }

  private _addPoint(point: Point) {
    if (this._points.length > 0 && point.eq(this._points[this._points.length - 1])) return false
    this._points.push(point)
    return true
  }
}