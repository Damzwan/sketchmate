import { BaseBrush, Point, Canvas, FabricObject } from 'fabric'
import * as fabric from 'fabric'

export class CharcoalBrush extends BaseBrush {
  private _trace: CharcoalPoint[] = []
  private _stampCanvas!: HTMLCanvasElement
  private _stampSize: number = 0
  private _lastPoint?: Point

  private _drawnDistance: number = 0
  // Slashed the dosage: The charcoal will now run out much faster
  public maxDistance: number = 600

  constructor(canvas: Canvas) {
    super(canvas)
  }

  private _generateStamp() {
    this._stampSize = this.width * 2
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = this._stampSize
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = this.color
    const coreOffset = this.width / 2

    // Generate a harsh, blocky, irregular charcoal grain
    for (let i = 0; i < (this.width * 15); i++) {
      const x = Math.random() * this.width + (this._stampSize - this.width) / 2
      const y = Math.random() * this.width + (this._stampSize - this.width) / 2

      ctx.globalAlpha = Math.random() * 0.7 + 0.1
      // Using rectangles instead of arcs for a crunchier, flakier texture
      const grainSize = Math.random() * 2 + 1
      ctx.fillRect(x, y, grainSize, grainSize)
    }
    this._stampCanvas = canvas
  }

  onMouseDown(pointer: Point) {
    this._trace = []
    this._drawnDistance = 0
    this._generateStamp()
    this._lastPoint = pointer
    this._addPoint(pointer, true)
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer)) {
      this.canvas.clearContext(this.canvas.contextTop)
      this._render()
    }
  }

  onMouseUp() {
    if (this._trace.length > 0) {
      // We pass everything inside one options object to keep the constructor consistent
      const stroke = new CharcoalStroke({
        trace: [...this._trace], // Spread to create a copy of the array
        stampCanvas: this._stampCanvas,
        stampSize: this._stampSize,
        fill: this.color,
        // Optional: Save the dataURL immediately if you want to avoid
        // generating it repeatedly during multiple clones
        stampDataUrl: this._stampCanvas.toDataURL()
      })

      this.canvas.add(stroke)
      this.canvas.clearContext(this.canvas.contextTop)
      this.canvas.fire('path:created', { path: stroke })
      this.canvas?.requestRenderAll()
    }

    this._lastPoint = undefined
    return false
  }

  private _addPoint(pointer: Point, isFirstPoint = false) {
    if (isFirstPoint) {
      this._trace.push({ x: pointer.x, y: pointer.y, opacity: 1, offsetX: 0, offsetY: 0 })
      return true
    }

    if (!this._lastPoint) return false

    const distance = this._lastPoint.distanceFrom(pointer)
    // The spacing dictates how close the interpolated stamps are.
    // Tighter spacing = denser line.
    const spacing = Math.max(1, this.width / 5)

    if (distance < spacing) return false // Prevent blood clots (buildup) when stationary

    // --- THE SUTURES: Linear Interpolation ---
    const steps = Math.floor(distance / spacing)
    let pointsAdded = false

    for (let i = 1; i <= steps; i++) {
      this._drawnDistance += spacing
      const fadeRatio = Math.max(0, 1 - (this._drawnDistance / this.maxDistance))

      if (fadeRatio <= 0) break // The charcoal stick is empty

      // Calculate the exact coordinate between the last point and current mouse position
      const t = i / steps
      const x = this._lastPoint.x + (pointer.x - this._lastPoint.x) * t
      const y = this._lastPoint.y + (pointer.y - this._lastPoint.y) * t

      // Micro-jitter to ensure the edge looks slightly crumbly
      const jitter = this.width / 6
      const offsetX = (Math.random() - 0.5) * jitter
      const offsetY = (Math.random() - 0.5) * jitter

      this._trace.push({ x, y, opacity: fadeRatio, offsetX, offsetY })
      pointsAdded = true
    }

    this._lastPoint = pointer
    return pointsAdded
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    ctx.save()
    const vpt = this.canvas.viewportTransform
    if (vpt) {
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
    }

    const radius = this._stampSize / 2

    for (const p of this._trace) {
      ctx.globalAlpha = p.opacity
      ctx.drawImage(this._stampCanvas, p.x + p.offsetX - radius, p.y + p.offsetY - radius)
    }

    ctx.restore()
  }
}


interface CharcoalPoint {
  x: number
  y: number
  opacity: number
  offsetX: number
  offsetY: number
}

export class CharcoalStroke extends FabricObject {
  static type = 'CharcoalStroke'

  // Include custom properties in cache check
  static cacheProperties = [...FabricObject.cacheProperties, 'trace', 'stampSize', 'stampDataUrl', 'minX', 'minY']

  public trace: any[]
  public stampCanvas?: HTMLCanvasElement
  public stampSize: number
  public stampDataUrl?: string

  // These are the "Anchors" that prevent the shifting bug
  public minX: number = 0
  public minY: number = 0

  constructor(options: any) {
    super(options)

    this.trace = options.trace || []
    this.stampSize = options.stampSize || 0
    this.stampCanvas = options.stampCanvas
    this.stampDataUrl = options.stampDataUrl

    // Restore anchors if they exist (cloning/JSON), otherwise they'll be set in _calcDimensions
    this.minX = options.minX || 0
    this.minY = options.minY || 0

    this.originX = 'left'
    this.originY = 'top'
    this.objectCaching = true

    // ONLY calculate dimensions if we don't have them (initial creation)
    if (typeof options.left !== 'number') {
      this._calcDimensions()
    }
  }

  private _calcDimensions() {
    if (!this.trace.length) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

    for (const p of this.trace) {
      const px = p.x + p.offsetX
      const py = p.y + p.offsetY
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }

    const radius = this.stampSize / 2

    // Store the STATIC anchors
    this.minX = minX
    this.minY = minY

    this.width = (maxX - minX) + this.stampSize
    this.height = (maxY - minY) + this.stampSize

    // Set the initial global position
    this.left = minX - radius
    this.top = minY - radius
  }

  _render(ctx: CanvasRenderingContext2D) {
    if (!this.stampCanvas) return;

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

    // CRITICAL: Save the state so eraser settings don't bleed into stamps
    ctx.save();

    for (const p of this.trace) {
      const localX = (p.x + p.offsetX - this.minX) - halfWidth;
      const localY = (p.y + p.offsetY - this.minY) - halfHeight;

      // We set alpha per-stamp. ctx.save/restore isn't needed inside the loop
      // but we MUST ensure we don't multiply alpha if the context already has one.
      ctx.globalAlpha = p.opacity;
      ctx.drawImage(this.stampCanvas, localX, localY);
    }

    ctx.restore();
  }

  toObject(additionalProperties: string[] = []) {
    return super.toObject([
      'left',
      'top',
      'trace',
      'stampSize',
      'stampDataUrl',
      'minX',
      'minY', // Crucial: save the anchors!
      ...additionalProperties
    ])
  }

  static async fromObject(object: any) {
    if (object.stampDataUrl && !object.stampCanvas) {
      const img = await fabric.util.loadImage(object.stampDataUrl)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = object.stampSize
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      object.stampCanvas = canvas
    }
    return new CharcoalStroke(object)
  }
}

