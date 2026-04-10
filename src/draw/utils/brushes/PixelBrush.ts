import { BaseBrush, Canvas, FabricObject, Point } from 'fabric'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'
import * as fabric from 'fabric'

export class PixelBrush extends BaseBrush {
  private _points: Point[] = []
  public pixelSize: number = 5

  // Vital signs: tracking the stamp instead of coordinates
  private _stampCanvas!: HTMLCanvasElement
  private _stampSize: number = 0

  constructor(canvas: Canvas) {
    super(canvas)
  }

  // TREATMENT: Generate a single bitmap stamp of the brush tip
  private _generateBrushTipCanvas() {
    const radius = this.width / 2
    const step = this.pixelSize

    // Calculate the safe dimensions for the stamp
    const gridMax = Math.ceil(radius / step) * step
    this._stampSize = (gridMax * 2) + step

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = this._stampSize
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = this.color as string

    const center = this._stampSize / 2
    const start = -Math.floor(radius / step) * step
    const end = Math.floor(radius / step) * step

    for (let dx = start; dx <= end; dx += step) {
      for (let dy = start; dy <= end; dy += step) {
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= radius) {
          const probability = 1 - Math.pow(distance / radius, 3)
          if (Math.random() < probability || distance <= step) {
            // Draw relative to the center of our tiny stamp canvas
            ctx.fillRect(center + dx - (step / 2), center + dy - (step / 2), step, step)
          }
        }
      }
    }
    return canvas
  }

  onMouseDown(pointer: Point) {
    this._points = []
    this._stampCanvas = this._generateBrushTipCanvas() // Bake the stamp!
    this._addPoint(pointer, true)
  }

  // RE-ATTACHED ORGAN: The mouse move handler
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
        stampCanvas: this._stampCanvas,
        stampSize: this._stampSize,
        stampDataUrl: this._stampCanvas.toDataURL() // Keep for syncing/saving
      })
      this.canvas.add(stroke)
      this.canvas.clearContext(this.canvas.contextTop)
      this.canvas.fire('path:created', { path: stroke })
      this.canvas?.requestRenderAll()
    }
    return false
  }

  // RE-ATTACHED ORGAN: Bresenham's Line Algorithm (The Sutures)
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

    const offset = this._stampSize / 2

    // Look how healthy this loop is now!
    for (const p of this._points) {
      ctx.drawImage(this._stampCanvas, p.x - offset, p.y - offset)
    }

    ctx.restore()
  }
}

export class PixelStroke extends FabricObject {
  static type = 'PixelStroke'

  // Update cache properties to track the stamp
  static cacheProperties = [...FabricObject.cacheProperties, 'points', 'pixelSize', 'stampSize', 'stampDataUrl', 'minX', 'minY']

  public points: Point[]
  public pixelSize: number
  public stampCanvas?: HTMLCanvasElement
  public stampSize: number
  public stampDataUrl?: string
  public minX: number = 0
  public minY: number = 0

  constructor(pointsOrOptions: Point[] | any, options: any = {}) {
    const isInitialEntry = Array.isArray(pointsOrOptions)
    const data = isInitialEntry ? options : pointsOrOptions
    const points = isInitialEntry ? pointsOrOptions : (data.points || [])

    super(data)

    this.points = points
    this.pixelSize = data.pixelSize || 5
    this.stampCanvas = data.stampCanvas
    this.stampSize = data.stampSize || 0
    this.stampDataUrl = data.stampDataUrl
    this.minX = data.minX || 0
    this.minY = data.minY || 0

    this.originX = 'left'
    this.originY = 'top'

    if (typeof data.left !== 'number') {
      this._calcDimensions()
    }
  }

  private _calcDimensions() {
    if (!this.points.length) return

    let minX = this.points[0].x, maxX = this.points[0].x
    let minY = this.points[0].y, maxY = this.points[0].y

    for (const p of this.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    this.minX = minX
    this.minY = minY

    // Padding is just the size of our stamp!
    this.width = (maxX - minX) + this.stampSize
    this.height = (maxY - minY) + this.stampSize
    this.left = minX - (this.stampSize / 2)
    this.top = minY - (this.stampSize / 2)
  }

  _render(ctx: CanvasRenderingContext2D) {
    if (!this.stampCanvas) return

    const halfWidth = this.width / 2
    const halfHeight = this.height / 2
    const offset = this.stampSize / 2

    // The nested loop is entirely gone.
    for (const p of this.points) {
      const renderX = (p.x - this.minX) - halfWidth - offset + (this.stampSize / 2)
      const renderY = (p.y - this.minY) - halfHeight - offset + (this.stampSize / 2)

      ctx.drawImage(this.stampCanvas, renderX, renderY)
    }
  }

  toObject(additionalProperties: string[] = []) {
    return super.toObject([
      'left',
      'top',
      'points',
      'pixelSize',
      'stampDataUrl',
      'stampSize',
      'minX',
      'minY',
      ...additionalProperties
    ])
  }

  static async fromObject(object: any) {
    if (object.stampDataUrl && !object.stampCanvas) {
      const img = await fabric.util.loadImage(object.stampDataUrl)

      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = object.stampSize
      canvas.getContext('2d')?.drawImage(img, 0, 0)

      // Inject the newly created canvas back into the options object
      object.stampCanvas = canvas
    }

    // 2. Proceed with normal enlivenment
    const enlivenedProps = await enlivenStrokeProps(object)
    return new PixelStroke(enlivenedProps)
  }

}