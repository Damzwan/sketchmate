import type { TSimplePathData } from 'fabric'
import { Path, PencilBrush, Shadow } from 'fabric'
import * as fabric from 'fabric'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'

export class OptimizedPencilBrush extends PencilBrush {

  // Fabric defaults decimate to 0.4.
  // Bumping it to 1.0 or 1.2 is highly recommended for collaborative drawing.
  // It removes vastly more points with almost zero visual difference.
  decimate = 1.2

  /**
   * Override the native path creation to use our sync-friendly class
   */
  // @ts-ignore
  createPath(pathData: TSimplePathData) {
    const path = new OptimizedPencilStroke(pathData, {
      fill: null,
      stroke: this.color,
      strokeWidth: this.width,
      strokeLineCap: this.strokeLineCap,
      strokeMiterLimit: this.strokeMiterLimit,
      strokeLineJoin: this.strokeLineJoin,
      strokeDashArray: this.strokeDashArray
    })

    if (this.shadow) {
      // @ts-ignore - Fabric's typings can sometimes be strict here
      this.shadow.affectStroke = true
      path.shadow = new Shadow(this.shadow)
    }

    return path
  }
}

export class OptimizedPencilStroke extends Path {
  static type = 'OptimizedPencilStroke'

  constructor(path: any, options: any) {
    // If we have a compressedTrace but no path, we must inflate it
    // BEFORE calling super so Fabric sees a valid path immediately.
    let inflatedPath = path
    if (options?.compressedTrace && (!path || path.length === 0)) {
      inflatedPath = OptimizedPencilStroke.inflateTrace(options.compressedTrace)
    }

    super(inflatedPath, options)
  }

  // Helper to turn the flat delta array back into Fabric's internal path format
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

    // Use this.path (which is the inflated array) to build the compressed trace
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