import { BaseBrush, Canvas, Path, Point, Shadow } from 'fabric'
import { opacityFromOpacityHex } from '@/draw/utils/color.utils'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'

export class WaterColorBrush extends BaseBrush {
  declare protected _basePoints: Point[]
  declare protected _bristlePoints: Point[][]

  constructor(canvas: Canvas) {
    super(canvas)
  }

  onMouseDown(pointer: Point) {
    this._basePoints = []
    this._bristlePoints = [[], [], []]
    if (this.canvas.contextTop?.canvas) {
      (this.canvas.contextTop.canvas as HTMLElement).style.mixBlendMode = 'multiply'
    }
    this._addPoint(pointer)
    this._render()
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer) && this._basePoints.length > 1) {
      this.canvas.clearContext(this.canvas.contextTop)
      this._render()
    }
  }

  onMouseUp() {
    // Use the static helper to get the path string
    const pathString = WaterColorStroke.buildPathString(this._basePoints, this.width)

    if (pathString) {
      const baseOpacity = opacityFromOpacityHex(this.color) || 0.6

      const path = new WaterColorStroke(pathString, {
        fill: '',
        stroke: this.color,
        strokeWidth: this.width * 0.8,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        opacity: baseOpacity * 0.5,
        globalCompositeOperation: 'multiply',
        objectCaching: true,
        interactive: false,
        basePoints: [...this._basePoints] // Store the raw points for syncing
      })

      path.set('shadow', new Shadow({
        color: this.color,
        blur: this.width * 0.4,
        affectStroke: true
      }))

      this.canvas.add(path)
      this.canvas.fire('path:created', { path })
    }

    this.canvas.clearContext(this.canvas.contextTop)
    if (this.canvas.contextTop?.canvas) {
      (this.canvas.contextTop.canvas as HTMLElement).style.mixBlendMode = 'normal'
    }
    this.canvas.requestRenderAll()
    return false
  }

  private _addPoint(point: Point) {
    if (this._basePoints.length > 0 && point.eq(this._basePoints[this._basePoints.length - 1])) {
      return false
    }

    // 1. Calculate the velocity of the patient's hand
    let dist = 0
    if (this._basePoints.length > 0) {
      const prev = this._basePoints[this._basePoints.length - 1]
      dist = prev.distanceFrom(point)
    }
    this._basePoints.push(point)

    // 2. Velocity Pigment Pooling Math
    // If moving fast (> 20px per frame), speedFactor approaches 1. If slow, approaches 0.
    const speedFactor = Math.min(1, dist / 20)
    // Slower hand = wider spread (pools). Faster hand = tighter spread (thins out).
    const spreadMultiplier = 1.2 - (speedFactor * 0.7)

    const numBristles = 3

    for (let b = 0; b < numBristles; b++) {
      const index = this._basePoints.length

      // Apply the spreadMultiplier to our organic tissue generation
      const wave = Math.sin(index * 0.5 + b) * (this.width * 0.15 * spreadMultiplier)
      const noiseX = (Math.random() - 0.5) * (this.width * 0.2 * spreadMultiplier)
      const noiseY = (Math.random() - 0.5) * (this.width * 0.2 * spreadMultiplier)

      this._bristlePoints[b].push(new Point(
        point.x + wave + noiseX,
        point.y + wave + noiseY
      ))
    }
    return true
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (!this._basePoints.length) return

    this._saveAndTransform(ctx)

    const baseOpacity = opacityFromOpacityHex(this.color) || 0.6
    ctx.globalAlpha = baseOpacity * 0.5
    ctx.strokeStyle = this.color
    ctx.lineWidth = this.width * 0.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.shadowColor = this.color
    ctx.shadowBlur = this.width * 0.4

    // The Intensity Bug Cure: We open ONE path for all bristles
    ctx.beginPath()

    for (let b = 0; b < this._bristlePoints.length; b++) {
      const points = this._bristlePoints[b]
      if (points.length === 0) continue

      let p1 = points[0]
      ctx.moveTo(p1.x, p1.y)

      for (let i = 1; i < points.length; i++) {
        const p2 = points[i]
        const mid = p1.midPointFrom(p2)
        ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y)
        p1 = p2
      }
      ctx.lineTo(p1.x, p1.y)
    }

    // We strike the canvas ONCE, ensuring the live preview perfectly matches the final geometry
    ctx.stroke()
    ctx.restore()
  }
}

export class WaterColorStroke extends Path {
  static type = 'WaterColorStroke'

  // We add basePoints to the cache so Fabric knows they are part of the object state
  static cacheProperties = [...Path.cacheProperties, 'basePoints']

  public basePoints: Point[]

  constructor(path: string | any[], options: any) {
    super(path, options)

    // INFLATION: Convert the tiny delta integers back into real Points
    if (options.compressedTrace && Array.isArray(options.compressedTrace)) {
      this.basePoints = []
      let lastX = 0
      let lastY = 0
      for (let i = 0; i < options.compressedTrace.length; i += 2) {
        let ix = options.compressedTrace[i]
        let iy = options.compressedTrace[i + 1]

        if (i > 0) {
          ix += lastX
          iy += lastY
        }
        lastX = ix
        lastY = iy

        // Divide by 10 to restore the decimal precision we saved
        this.basePoints.push(new Point(ix / 10, iy / 10))
      }
    } else {
      this.basePoints = options.basePoints || []
    }
  }

  // @ts-ignore
  toObject(additionalProperties: string[] = []) {
    // DEFLATION: Turn Points into small relative integers
    const flatTrace: number[] = []
    let lastX = 0
    let lastY = 0

    for (let i = 0; i < this.basePoints.length; i++) {
      const p = this.basePoints[i]
      const ix = Math.round(p.x * 10)
      const iy = Math.round(p.y * 10)

      if (i === 0) {
        flatTrace.push(ix, iy)
      } else {
        flatTrace.push(ix - lastX, iy - lastY)
      }
      lastX = ix
      lastY = iy
    }

    // @ts-ignore
    const baseObj = super.toObject([...additionalProperties])

    // CRITICAL: Strip the massive 'path' array to save 90% space
    // The receiver will rebuild it in fromObject
    delete (baseObj as any).path

    return {
      ...baseObj,
      compressedTrace: flatTrace
    }
  }

  static async fromObject(object: any) {
    // If we received a synced object with no path, we rebuild the path string locally
    if (!object.path || object.path.length === 0) {
      // We create a temporary instance to handle the inflation logic
      const tempInstance = new WaterColorStroke([], object)

      // We need a way to generate the path string.
      // Since we aren't using seeds, we'll use a standard Math.random here.
      object.path = WaterColorStroke.buildPathString(tempInstance.basePoints, object.strokeWidth / 0.8)
    }
    const enlivenedProps = await enlivenStrokeProps(object)
    return new WaterColorStroke(object.path, enlivenedProps)
  }

  // Shared logic to turn basePoints into the watercolor bristle geometry
  static buildPathString(basePoints: Point[], width: number): string {
    const bristlePoints: Point[][] = [[], [], []]

    for (let i = 0; i < basePoints.length; i++) {
      const point = basePoints[i]
      let dist = 0
      if (i > 0) dist = basePoints[i - 1].distanceFrom(point)

      const speedFactor = Math.min(1, dist / 20)
      const spreadMultiplier = 1.2 - (speedFactor * 0.7)

      for (let b = 0; b < 3; b++) {
        const index = i
        const wave = Math.sin(index * 0.5 + b) * (width * 0.15 * spreadMultiplier)
        const noiseX = (Math.random() - 0.5) * (width * 0.2 * spreadMultiplier)
        const noiseY = (Math.random() - 0.5) * (width * 0.2 * spreadMultiplier)

        bristlePoints[b].push(new Point(point.x + wave + noiseX, point.y + wave + noiseY))
      }
    }

    let pathString = ''
    for (let b = 0; b < bristlePoints.length; b++) {
      const points = bristlePoints[b]
      if (points.length > 0) {
        let p1 = points[0]
        pathString += `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `
        for (let i = 1; i < points.length; i++) {
          const p2 = points[i]
          const mid = p1.midPointFrom(p2)
          pathString += `Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} `
          p1 = p2
        }
        pathString += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `
      }
    }
    return pathString
  }
}