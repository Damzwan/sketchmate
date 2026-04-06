import { BaseBrush, Point, Canvas, FabricObject } from 'fabric'

export class PixelBrush extends BaseBrush {
  private _points: Point[] = []
  public pixelSize: number = 5
  // Notice we removed opacity; it's just a solid layout of blocks now
  private _currentBrushTip: { dx: number, dy: number }[] = []

  constructor(canvas: Canvas) {
    super(canvas)
  }

  private _generateBrushTip() {
    const tip = []
    const radius = this.width / 2
    const step = this.pixelSize

    const start = -Math.floor(radius / step) * step
    const end = Math.floor(radius / step) * step

    for (let dx = start; dx <= end; dx += step) {
      for (let dy = start; dy <= end; dy += step) {
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= radius) {
          // The magic pixel dust: solid core, scattered edges
          // We square the fraction to keep the center dense and edges sparse
          const probability = 1 - Math.pow(distance / radius, 3)

          if (Math.random() < probability || distance <= step) {
            tip.push({ dx, dy })
          }
        }
      }
    }
    return tip
  }

  onMouseDown(pointer: Point) {
    this._points = []
    this._currentBrushTip = this._generateBrushTip()
    this._addPoint(pointer, true) // Force add the first point
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer)) {
      this.canvas.clearContext(this.canvas.contextTop)
      this._render()
    }
  }

  onMouseUp() {
    if (this._points.length > 0) {
      const stroke = new PixelStroke(this._points, {
        fill: this.color,
        pixelSize: this.pixelSize,
        brushTip: this._currentBrushTip
      })
      this.canvas.add(stroke)
      this.canvas.clearContext(this.canvas.contextTop)
      this.canvas.fire('path:created', { path: stroke })
      this.canvas?.requestRenderAll()
    }
    return false
  }

  private _addPoint(pointer: Point, isFirstPoint = false) {
    const targetX = Math.floor(pointer.x / this.pixelSize) * this.pixelSize
    const targetY = Math.floor(pointer.y / this.pixelSize) * this.pixelSize

    if (this._points.length === 0 || isFirstPoint) {
      this._points.push(new Point(targetX, targetY))
      return true
    }

    const lastPoint = this._points[this._points.length - 1]

    if (targetX === lastPoint.x && targetY === lastPoint.y) {
      return false // Mouse hasn't moved to a new pixel cell yet
    }

    // --- BRESENHAM'S LINE ALGORITHM (The Sutures) ---
    // Interpolate points between lastPoint and current target
    let x0 = lastPoint.x
    let y0 = lastPoint.y
    const x1 = targetX
    const y1 = targetY

    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? this.pixelSize : -this.pixelSize
    const sy = y0 < y1 ? this.pixelSize : -this.pixelSize
    let err = dx - dy

    let pointsAdded = false

    while (true) {
      // Don't duplicate the very first point of the line
      if (x0 !== lastPoint.x || y0 !== lastPoint.y) {
        this._points.push(new Point(x0, y0))
        pointsAdded = true
      }

      if (Math.abs(x0 - x1) < this.pixelSize / 2 && Math.abs(y0 - y1) < this.pixelSize / 2) {
        break
      }

      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x0 += sx
      }
      if (e2 < dx) {
        err += dx
        y0 += sy
      }
    }

    return pointsAdded
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    ctx.save()
    const vpt = this.canvas.viewportTransform
    if (vpt) {
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
    }

    ctx.fillStyle = this.color

    for (const p of this._points) {
      for (const block of this._currentBrushTip) {
        // No more opacity! Just pure, healthy, solid pixels.
        ctx.fillRect(p.x + block.dx, p.y + block.dy, this.pixelSize, this.pixelSize)
      }
    }

    ctx.restore()
  }
}


export class PixelStroke extends FabricObject {
  static type = 'PixelStroke'

  // Track minX/minY as "anchors" to keep the pixels locked in place
  static cacheProperties = [...FabricObject.cacheProperties, 'points', 'pixelSize', 'brushTip', 'minX', 'minY']

  public points: Point[]
  public pixelSize: number
  public brushTip: { dx: number; dy: number }[]
  public minX: number = 0
  public minY: number = 0

  constructor(pointsOrOptions: Point[] | any, options: any = {}) {
    // Handle both styles: new PixelStroke(points, options) AND new PixelStroke(options)
    const isInitialEntry = Array.isArray(pointsOrOptions)
    const data = isInitialEntry ? options : pointsOrOptions
    const points = isInitialEntry ? pointsOrOptions : (data.points || [])

    super(data)

    this.points = points
    this.pixelSize = data.pixelSize || 5
    this.brushTip = data.brushTip || []
    this.minX = data.minX || 0
    this.minY = data.minY || 0

    this.originX = 'left'
    this.originY = 'top'

    // Only calculate if we are creating from scratch (not cloning)
    if (typeof data.left !== 'number') {
      this._calcDimensions()
    }
  }

  private _calcDimensions() {
    if (!this.points.length) return

    let minX = this.points[0].x, maxX = this.points[0].x
    let minY = this.points[0].y, maxY = this.points[0].y

    let maxDx = 0, maxDy = 0
    for (const block of this.brushTip) {
      if (Math.abs(block.dx) > maxDx) maxDx = Math.abs(block.dx)
      if (Math.abs(block.dy) > maxDy) maxDy = Math.abs(block.dy)
    }

    for (const p of this.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    // Set our anchors
    this.minX = minX
    this.minY = minY

    this.width = (maxX - minX) + (maxDx * 2) + this.pixelSize
    this.height = (maxY - minY) + (maxDy * 2) + this.pixelSize
    this.left = minX - maxDx
    this.top = minY - maxDy
  }

  _render(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.fill as string

    const halfWidth = this.width / 2
    const halfHeight = this.height / 2

    // Use a fixed calculation relative to the internal bounds
    // maxDx is the padding we applied in _calcDimensions
    const maxDx = (this.width - (this.pixelSize + (Math.max(...this.points.map(p => p.x)) - this.minX))) / 2

    for (const p of this.points) {
      for (const block of this.brushTip) {
        // We subtract the static minX anchor instead of the dynamic this.left
        const localX = (p.x - this.minX) - halfWidth + block.dx + (this.width / 2 - (this.width / 2 - maxDx))
        const localY = (p.y - this.minY) - halfHeight + block.dy + (this.height / 2 - (this.height / 2 - maxDx))

        // Simplified: (Point Position - Anchor) - HalfDimension + Jitter
        const finalX = (p.x - this.minX) - halfWidth + (this.width - (Math.max(...this.points.map(pt => pt.x)) - this.minX + this.pixelSize)) / 2 + block.dx
        const finalY = (p.y - this.minY) - halfHeight + (this.height - (Math.max(...this.points.map(pt => pt.y)) - this.minY + this.pixelSize)) / 2 + block.dy

        // Cleanest version for your specific math:
        const renderX = (p.x - this.minX) - halfWidth + (this.width / 2 - ((Math.max(...this.points.map(pt => pt.x)) - this.minX) / 2)) - (this.pixelSize / 2) + block.dx
        const renderY = (p.y - this.minY) - halfHeight + (this.height / 2 - ((Math.max(...this.points.map(pt => pt.y)) - this.minY) / 2)) - (this.pixelSize / 2) + block.dy

        ctx.fillRect(renderX, renderY, this.pixelSize, this.pixelSize)
      }
    }
  }

  toObject(additionalProperties: string[] = []) {
    return super.toObject([
      'left',
      'top',
      'points',
      'pixelSize',
      'brushTip',
      'minX',
      'minY',
      ...additionalProperties
    ])
  }

  static async fromObject(object: any) {
    return new PixelStroke(object)
  }
}