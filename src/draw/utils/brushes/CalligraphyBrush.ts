import { BaseBrush, Canvas, FabricImage, Point } from 'fabric'
import * as fabric from 'fabric'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'

// ------------------------------------------------------------------
// 1. DETERMINISTIC UTILITIES
// ------------------------------------------------------------------

export function seededRandom(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export interface RawPoint {
  x: number;
  y: number;
  time: number
}

// ------------------------------------------------------------------
// 2. THE BRUSH CONTROLLER
// ------------------------------------------------------------------

// @ts-ignore
export class CalligraphyBrush extends BaseBrush {
  width = 40
  private _rawPoints: RawPoint[] = []
  private _seed: number = 0

  // FIX: Added explicit drawing state to prevent the "menu switch ghost stroke" bug
  private _isDrawing: boolean = false

  constructor(canvas: Canvas) {
    super(canvas)
  }

  onMouseDown(pointer: Point) {
    this._isDrawing = true
    this._seed = Math.floor(Math.random() * 1000000)
    this._rawPoints = [{ x: pointer.x, y: pointer.y, time: Date.now() }]
    this.canvas.clearContext(this.canvas.contextTop)
  }

  onMouseMove(pointer: Point) {
    // FIX: Strict guardrail. Only draw if we explicitly started a stroke
    if (!this._isDrawing || !this._rawPoints || this._rawPoints.length === 0) return

    const lastPt = this._rawPoints[this._rawPoints.length - 1]
    const dx = pointer.x - lastPt.x
    const dy = pointer.y - lastPt.y

    // Small interpolation buffer
    if (Math.sqrt(dx * dx + dy * dy) > 2) {
      this._rawPoints.push({ x: pointer.x, y: pointer.y, time: Date.now() })
      this._drawTemporaryStroke()
    }
  }

  onMouseUp() {
    if (!this._isDrawing) return false
    this._isDrawing = false

    const finalMouseUpTime = Date.now()
    this.canvas.clearContext(this.canvas.contextTop)

    if (this._rawPoints && this._rawPoints.length > 1) {
      // 1. Generate the visual canvas as before
      const tempImg = generateCalligraphyImage(
        this._rawPoints,
        this._seed,
        this.color as string,
        this.width,
        finalMouseUpTime
      )

      if (tempImg) {
        // 2. Wrap it in our Sync-Friendly class
        const calligraphyStroke = new CalligraphyStroke(tempImg.getElement(), {
          ...tempImg.toObject(),
          seed: this._seed,
          rawPoints: [...this._rawPoints], // The raw DNA
          endTime: finalMouseUpTime,
          color: this.color,
          baseWidth: this.width
        })

        this.canvas.add(calligraphyStroke)
        this.canvas.fire('path:created', { path: calligraphyStroke })
        this.canvas.requestRenderAll()
      }
    }
    this._rawPoints = []
    return false
  }

  private _drawTemporaryStroke() {
    const ctx = this.canvas.contextTop
    this.canvas.clearContext(ctx)
    ctx.save()

    if (this.canvas.viewportTransform) {
      const v = this.canvas.viewportTransform
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5])
    }

    // FIX: Render the exact same visual logic for the live preview,
    // but pass `isTemp: true` to skip heavy splatters and ink pools.
    renderCalligraphyEngine(ctx, this._rawPoints, this._seed, this.color as string, this.width, Date.now(), true)

    ctx.restore()
  }
}

// ------------------------------------------------------------------
// 3. THE EPIC RENDER ENGINE (UNIFIED)
// ------------------------------------------------------------------

export function generateCalligraphyImage(
  rawPoints: RawPoint[],
  seed: number,
  color: string,
  baseWidth: number = 40,
  endTime: number = Date.now()
): FabricImage | null {
  if (rawPoints.length < 2) return null

  // Step 1: Calculate bounds first so we can size the offscreen canvas
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const padding = 100 // Safe padding for pools, splatters, and wide nibs

  rawPoints.forEach(p => {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  })

  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const dpr = 1
  const canvas = document.createElement('canvas')
  canvas.width = (maxX - minX) * dpr
  canvas.height = (maxY - minY) * dpr
  const ctx = canvas.getContext('2d')

  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.translate(-minX, -minY) // Offset the context to fit our bounding box

  // Step 2: Utilize the unified render engine
  renderCalligraphyEngine(ctx, rawPoints, seed, color, baseWidth, endTime, false)

  // Step 3: Return Fabric Image
  return new FabricImage(canvas, {
    left: minX, top: minY,
    originX: 'left', originY: 'top',
    scaleX: 1 / dpr, scaleY: 1 / dpr,
    objectCaching: true, interactive: false
  })
}

/**
 * The core drawing logic decoupled from the canvas wrapper.
 * This guarantees the live preview and final render are 100% identical.
 */
function renderCalligraphyEngine(
  ctx: CanvasRenderingContext2D,
  rawPoints: RawPoint[],
  seed: number,
  color: string,
  baseWidth: number,
  endTime: number,
  isTemp: boolean
) {
  const random = seededRandom(seed)
  const nibAngle = -Math.PI / 4 // 45-degree calligraphy nib
  const maxInkDistance = 2500

  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  let currentDist = 0
  let lastWidth = baseWidth * 0.6

  // 1. Core Ribbon Rendering
  for (let i = 1; i < rawPoints.length; i++) {
    const p1 = rawPoints[i - 1]
    const p2 = rawPoints[i]

    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 0.5) continue

    currentDist += distance
    const timeDiff = Math.max(1, p2.time - p1.time)
    const velocity = distance / timeDiff

    // Calculate thickness based heavily on stroke angle vs nib angle
    const angle = Math.atan2(dy, dx)
    const angleDiff = angle - nibAngle

    // Perpendicular = thick, Parallel = thin
    const widthRatio = 0.15 + 0.85 * Math.abs(Math.sin(angleDiff))
    const targetWidth = Math.max(baseWidth * 0.1, baseWidth * widthRatio - (velocity * 2))

    // Smooth the width transitions
    const currentWidth = lastWidth + (targetWidth - lastWidth) * 0.2

    // Ink depletion fading
    const inkRemaining = Math.max(0.25, 1 - (currentDist / maxInkDistance))
    ctx.globalAlpha = inkRemaining

    // --- THE RIBBON TECHNIQUE ---
    // Instead of drawing a line, we calculate the edges of the chisel tip
    // and draw a filled polygon. This gives true calligraphy crispness.
    const w1 = lastWidth / 2
    const w2 = currentWidth / 2

    // Perpendicular angle for the flat edge of the nib
    const perpAngle = nibAngle + Math.PI / 2

    const p1Left = { x: p1.x + Math.cos(perpAngle) * w1, y: p1.y + Math.sin(perpAngle) * w1 }
    const p1Right = { x: p1.x - Math.cos(perpAngle) * w1, y: p1.y - Math.sin(perpAngle) * w1 }
    const p2Left = { x: p2.x + Math.cos(perpAngle) * w2, y: p2.y + Math.sin(perpAngle) * w2 }
    const p2Right = { x: p2.x - Math.cos(perpAngle) * w2, y: p2.y - Math.sin(perpAngle) * w2 }

    ctx.beginPath()
    ctx.moveTo(p1Left.x, p1Left.y)
    ctx.lineTo(p1Right.x, p1Right.y)
    ctx.lineTo(p2Right.x, p2Right.y)
    ctx.lineTo(p2Left.x, p2Left.y)
    ctx.closePath()
    ctx.fill()

    // Splatters & Bristles (Only render on final image to keep temp strokes ultra-fast)
    if (!isTemp) {
      if (velocity > 1.5 && random() > 0.8) {
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.ellipse(
          p2.x + (random() - 0.5) * baseWidth,
          p2.y + (random() - 0.5) * baseWidth,
          random() * 2 + 1, random() + 0.5,
          angle, 0, Math.PI * 2
        )
        ctx.fill()
      }

      if (velocity > 2.5) {
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.lineWidth = random() * 2
        ctx.moveTo(p1.x + (random() - 0.5) * currentWidth, p1.y + (random() - 0.5) * currentWidth)
        ctx.lineTo(p2.x + (random() - 0.5) * currentWidth, p2.y + (random() - 0.5) * currentWidth)
        ctx.stroke()
      }
    }

    lastWidth = currentWidth
  }

  // 2. Ink Pooling (Final render only)
  if (!isTemp && rawPoints.length > 0) {
    const lastRawPoint = rawPoints[rawPoints.length - 1]
    const timeHeld = endTime - lastRawPoint.time

    if (timeHeld > 150) {
      const poolRadius = Math.min(baseWidth * 0.8, (timeHeld / 100) * (baseWidth * 0.2))
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.arc(lastRawPoint.x, lastRawPoint.y, poolRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1.0 // Reset
}

export class CalligraphyStroke extends FabricImage {
  static type = 'CalligraphyStroke'
  // Added 'compressedTrace' to cacheProperties to ensure it's tracked
  static cacheProperties = [...FabricImage.cacheProperties, 'seed', 'endTime', 'color', 'baseWidth', 'compressedTrace']

  public seed: number = 0
  public rawPoints: RawPoint[] = []
  public endTime: number = 0
  public color: string = '#000000'
  public baseWidth: number = 40

  constructor(element: any, options: any) {
    // FabricImage constructor expects the element first
    super(element, options)

    this.seed = options.seed
    this.color = options.color
    this.baseWidth = options.baseWidth
    this.endTime = options.endTime

    // INFLATION: Logic moved to a helper to keep constructor clean
    if (options.compressedTrace) {
      this.rawPoints = this._inflateTrace(options.compressedTrace)
    } else {
      this.rawPoints = options.rawPoints || []
    }
  }

  private _inflateTrace(compressed: number[]): RawPoint[] {
    const inflated: RawPoint[] = []
    let lastX = 0, lastY = 0, lastTime = 0
    for (let i = 0; i < compressed.length; i += 3) {
      let ix = compressed[i]
      let iy = compressed[i + 1]
      let it = compressed[i + 2]

      if (i > 0) {
        ix += lastX
        iy += lastY
        it += lastTime
      }
      lastX = ix
      lastY = iy
      lastTime = it
      inflated.push({ x: ix / 10, y: iy / 10, time: it })
    }
    return inflated
  }

  // @ts-ignore
  toObject(additionalProperties: string[] = []) {
    const flatTrace: number[] = []
    let lastX = 0, lastY = 0, lastTime = 0

    for (let i = 0; i < this.rawPoints.length; i++) {
      const p = this.rawPoints[i]
      const ix = Math.round(p.x * 10)
      const iy = Math.round(p.y * 10)
      const it = p.time

      if (i === 0) {
        flatTrace.push(ix, iy, it)
      } else {
        flatTrace.push(ix - lastX, iy - lastY, it - lastTime)
      }
      lastX = ix
      lastY = iy
      lastTime = it
    }


    const baseObj = super.toObject([
      'seed',
      'color',
      'baseWidth',
      'endTime',
      ...additionalProperties
    ] as any)

    // Remove the heavy DataURL/Src to keep the sync payload small
    delete (baseObj as any).src

    return {
      ...baseObj,
      compressedTrace: flatTrace
    }
  }

  static async fromObject(object: any) {
    // 1. If we are syncing, we won't have an image element or src
    if (!object.src) {
      // Manually inflate the trace to regenerate the image
      const tempPoints: RawPoint[] = []
      let lastX = 0, lastY = 0, lastTime = 0
      const compressed = object.compressedTrace || []

      for (let i = 0; i < compressed.length; i += 3) {
        let ix = compressed[i], iy = compressed[i + 1], it = compressed[i + 2]
        if (i > 0) {
          ix += lastX
          iy += lastY
          it += lastTime
        }
        lastX = ix
        lastY = iy
        lastTime = it
        tempPoints.push({ x: ix / 10, y: iy / 10, time: it })
      }

      // 2. Generate the actual HTMLCanvasElement
      const calligraphyImg = generateCalligraphyImage(
        tempPoints,
        object.seed,
        object.color,
        object.baseWidth,
        object.endTime
      )

      if (calligraphyImg) {
        // Use the generated canvas as the element for the new FabricImage
        const enlivenedProps = await enlivenStrokeProps(object)
        return new CalligraphyStroke(calligraphyImg.getElement(), enlivenedProps)
      }
    }

    // Fallback to standard FabricImage loading if src exists
    return fabric.util.enlivenObjects([object]).then((enlivened) => enlivened[0])
  }
}