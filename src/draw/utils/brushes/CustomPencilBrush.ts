import type { TSimplePathData } from 'fabric'
import { Path, PencilBrush, Shadow } from 'fabric'
import { enlivenStrokeProps, simplifyPathDouglasPeucker } from '@/draw/utils/brushes/brush.helpers'

// ==========================================
// THE OPTIMIZED BRUSH
// ==========================================


export class OptimizedPencilBrush extends PencilBrush {
  decimate = 0.3


  // @ts-ignore
  createPath(pathData: TSimplePathData) {
    // 1. SURGICAL EXTRACTION: Run DP on the raw data to permanently remove bloat.
    const optimizedData = simplifyPathDouglasPeucker(pathData, 0.3)

    const path = new OptimizedPencilStroke(optimizedData, {
      fill: null,
      stroke: this.color,
      strokeWidth: this.width,
      strokeLineCap: this.strokeLineCap,
      strokeMiterLimit: this.strokeMiterLimit,
      strokeLineJoin: this.strokeLineJoin,
      strokeDashArray: this.strokeDashArray
    })

    if (this.shadow) {
      // @ts-ignore
      this.shadow.affectStroke = true
      path.shadow = new Shadow(this.shadow)
    }

    return path
  }

  _finalizeAndAddPath() {
    // 1. Get the TOP context (temporary drawing layer) just to close and clear it
    const topCtx = this.canvas.contextTop
    topCtx.closePath()

    const pathData = this.convertPointsToSVGPath(this._points)
    const path = this.createPath(pathData)

    // Clear the temporary drawing buffer
    this.canvas.clearContext(topCtx)
    this.canvas.fire('before:path:created', { path: path })

    this.canvas.add(path)
    path.setCoords()

    // 3. THE FIX: Grab the MAIN lower canvas context
    const mainCtx = this.canvas.getContext()

    // 4. THE FIX: Apply the viewport transform so it renders correctly when zoomed/panned
    mainCtx.save()
    const vpt = this.canvas.viewportTransform
    if (vpt) {
      mainCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
    }

    // 5. Render directly to the main canvas
    path.render(mainCtx)

    // Clean up the context state
    mainCtx.restore()
    this._resetShadow()

    // Fire the final event
    this.canvas.fire('path:created', { path: path })
  }
}

// ==========================================
// THE OPTIMIZED STROKE
// ==========================================

export class OptimizedPencilStroke extends Path {
  static type = 'OptimizedPencilStroke'

  constructor(path: any, options: any) {
    let inflatedPath = path
    if (options?.compressedTrace && (!path || path.length === 0)) {
      inflatedPath = OptimizedPencilStroke.inflateTrace(options.compressedTrace)
    }

    super(inflatedPath, options)
  }

  // Note: The custom _render method has been amputated.
  // Fabric will handle the drawing natively and efficiently.

  static inflateTrace(trace: (number | string)[]): any[] {
    const inflated: any[] = []
    let lastX = 0, lastY = 0

    for (let i = 0; i < trace.length;) {
      const cmd = trace[i]
      if (cmd === 'M' || cmd === 'L') {
        let ix = trace[i + 1] as number
        let iy = trace[i + 2] as number
        if (cmd === 'L') {
          ix += lastX
          iy += lastY
        }
        inflated.push([cmd, ix / 10, iy / 10])
        lastX = ix
        lastY = iy
        i += 3
      } else if (cmd === 'Q') {
        const icpx = (trace[i + 1] as number) + lastX
        const icpy = (trace[i + 2] as number) + lastY
        const ix = (trace[i + 3] as number) + lastX
        const iy = (trace[i + 4] as number) + lastY
        inflated.push(['Q', icpx / 10, icpy / 10, ix / 10, iy / 10])
        lastX = ix
        lastY = iy
        i += 5
      } else {
        i++
      }
    }
    return inflated
  }

  // @ts-ignore
  toObject(additionalProperties: string[] = []) {
    const baseObj = super.toObject([...additionalProperties] as any)
    const compressedTrace: (number | string)[] = []
    let lastX = 0, lastY = 0

    // Loop through the active path
    for (const cmd of this.path) {
      const type = cmd[0]
      if (type === 'M' || type === 'L') {
        const ix = Math.round((cmd[1] as number) * 10)
        const iy = Math.round((cmd[2] as number) * 10)
        if (type === 'M') {
          compressedTrace.push('M', ix, iy)
        } else {
          compressedTrace.push('L', ix - lastX, iy - lastY)
        }
        lastX = ix
        lastY = iy
      } else if (type === 'Q') {
        const icpx = Math.round((cmd[1] as number) * 10)
        const icpy = Math.round((cmd[2] as number) * 10)
        const ix = Math.round((cmd[3] as number) * 10)
        const iy = Math.round((cmd[4] as number) * 10)
        compressedTrace.push('Q', icpx - lastX, icpy - lastY, ix - lastX, iy - lastY)
        lastX = ix
        lastY = iy
      }
    }


    delete (baseObj as any).path
    return { ...baseObj, compressedTrace }
  }

  static async fromObject(object: any) {
    const enlivenedProps = await enlivenStrokeProps(object)
    return new OptimizedPencilStroke(enlivenedProps.path, enlivenedProps)
  }


}