import { BaseBrush, FabricObject, Point } from 'fabric'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'

// @ts-ignore
export class CustomCircleBrush extends BaseBrush {
  width = 10
  private _activePoints: { x: number; y: number; r: number; a: number }[] = []

  onMouseDown(pointer: Point) {
    this._activePoints = []
    this._addCirclePoint(pointer)
    this.canvas.clearContext(this.canvas.contextTop)
    this._renderTemp()
  }

  onMouseMove(pointer: Point) {
    if (!this._activePoints.length) return

    const lastPoint = this._activePoints[this._activePoints.length - 1]
    const distance = Math.sqrt(Math.pow(pointer.x - lastPoint.x, 2) + Math.pow(pointer.y - lastPoint.y, 2))

    // DECIMATION STRATEGY:
    // Only add a new circle if we've moved significantly (25% of brush width)
    // This prevents the "Action size" from exploding during slow movements.
    if (distance > this.width / 4) {
      this._addCirclePoint(pointer)
      this.canvas.clearContext(this.canvas.contextTop)
      this._renderTemp()
    }
  }

  private _addCirclePoint(p: Point) {
    // Replicating Fabric's original randomness logic but storing it once
    const radius = (Math.random() * 40 + (this.width - 20)) / 2
    const opacity = Math.random()

    this._activePoints.push({
      x: p.x,
      y: p.y,
      r: Math.max(0.5, radius),
      a: opacity
    })
  }

  onMouseUp() {
    if (this._activePoints.length > 0) {
      const stroke = new CircleStroke({
        pointsData: [...this._activePoints],
        fill: this.color
      })

      this.canvas.add(stroke)
      this.canvas.fire('path:created', { path: stroke })
    }
    this._activePoints = []
    this.canvas.clearContext(this.canvas.contextTop)
    this.canvas.requestRenderAll()
    return false
  }

  private _renderTemp() {
    const ctx = this.canvas.contextTop
    if (!ctx) return
    this._saveAndTransform(ctx)

    ctx.fillStyle = this.color as string
    for (const p of this._activePoints) {
      ctx.globalAlpha = p.a
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

export class CircleStroke extends FabricObject {
  static type = 'circlestroke'

  // Add minX and minY to cache so Fabric tracks changes
  static cacheProperties = [...FabricObject.cacheProperties, 'pointsData', 'minX', 'minY']

  public pointsData: { x: number; y: number; r: number; a: number }[] = []
  public minX: number = 0
  public minY: number = 0

  constructor(options: any) {
    super(options)

    // Store the anchors from the options (crucial for loading from JSON)
    this.minX = options.minX || 0
    this.minY = options.minY || 0

    if (options.compressedTrace && Array.isArray(options.compressedTrace)) {
      this.pointsData = []
      let lastX = 0, lastY = 0
      for (let i = 0; i < options.compressedTrace.length; i += 4) {
        let ix = options.compressedTrace[i]
        let iy = options.compressedTrace[i + 1]
        const ir = options.compressedTrace[i + 2]
        const ia = options.compressedTrace[i + 3]

        if (i > 0) {
          ix += lastX
          iy += lastY
        }
        lastX = ix; lastY = iy

        this.pointsData.push({
          x: ix / 10,
          y: iy / 10,
          r: ir / 10,
          a: ia / 100
        })
      }
    } else {
      this.pointsData = options.pointsData || []
    }

    // Only calculate dimensions if they weren't provided (New stroke vs Loaded stroke)
    if (typeof options.left !== 'number' || !options.minX) {
      this._calcDimensions()
    }

    this.originX = 'left'
    this.originY = 'top'
  }

  public _calcDimensions() {
    if (!this.pointsData.length) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    let maxR = 0

    for (const p of this.pointsData) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
      if (p.r > maxR) maxR = p.r
    }

    this.minX = minX
    this.minY = minY
    this.width = (maxX - minX) + (maxR * 2)
    this.height = (maxY - minY) + (maxR * 2)
    this.left = minX - maxR
    this.top = minY - maxR
  }

  _render(ctx: CanvasRenderingContext2D) {
    if (!this.pointsData.length) return

    ctx.save()
    ctx.fillStyle = this.fill as string

    // 1. Calculate the relative top-left offset
    const rx = -(this.width / 2)
    const ry = -(this.height / 2)

    // 2. Find maxR again to align with the padding used in _calcDimensions
    let maxR = 0
    for (const p of this.pointsData) if (p.r > maxR) maxR = p.r

    // 3. Anchor precisely to the calculated min boundaries
    const startX = this.minX - maxR
    const startY = this.minY - maxR

    for (const p of this.pointsData) {
      const localX = (p.x - startX) + rx
      const localY = (p.y - startY) + ry

      ctx.globalAlpha = p.a
      ctx.beginPath()
      ctx.arc(localX, localY, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  toObject(additionalProperties: string[] = []) {
    const flatTrace: number[] = []
    let lastX = 0, lastY = 0

    for (let i = 0; i < this.pointsData.length; i++) {
      const p = this.pointsData[i]
      const ix = Math.round(p.x * 10)
      const iy = Math.round(p.y * 10)
      const ir = Math.round(p.r * 10)
      const ia = Math.round(p.a * 100)

      if (i === 0) {
        flatTrace.push(ix, iy, ir, ia)
      } else {
        flatTrace.push(ix - lastX, iy - lastY, ir, ia)
      }
      lastX = ix; lastY = iy
    }

    // CRITICAL: We MUST explicitly save 'minX' and 'minY'
    const baseObj = super.toObject([
      'fill',
      'minX',
      'minY',
      'clipPath',
      ...additionalProperties
    ])

    return {
      ...baseObj,
      type: this.type,
      compressedTrace: flatTrace
    }
  }

  static async fromObject(object: any) {
    const enlivenedProps = await enlivenStrokeProps(object)
    return new CircleStroke(enlivenedProps)
  }
}