import { Path } from 'fabric'
import { enlivenStrokeProps } from '@/draw/utils/brushes/brush.helpers'

export class BucketFillPath extends Path {
  static type = 'BucketFillPath'
  static cacheProperties = [...Path.cacheProperties, 'isBucketFill']

  constructor(path: string | any[], options: any) {
    super(path, options)
  }

  // @ts-ignore
  toObject(additionalProperties: string[] = []) {
    // 1. Get the standard base object
    const baseObj = super.toObject(['isBucketFill', ...additionalProperties] as any)

    // 2. DEFLATION: Compress the parsed path array Fabric generated
    const compressedTrace: (number | string)[] = []
    let lastX = 0, lastY = 0

    // Fabric parses the SVG string into an array: [['M', x, y], ['L', x, y], ['Z']]
    for (const cmd of this.path) {
      const type = cmd[0]

      if (type === 'Z') {
        compressedTrace.push('Z')
      } else if (type === 'M' || type === 'L') {
        const ix = Math.round((cmd[1] as number) * 10)
        const iy = Math.round((cmd[2] as number) * 10)

        if (type === 'M') {
          compressedTrace.push('M', ix, iy)
          lastX = ix
          lastY = iy
        } else {
          // Delta encode the LineTo commands
          compressedTrace.push(ix - lastX, iy - lastY)
          lastX = ix
          lastY = iy
        }
      }
    }

    // 3. Strip the heavy array and attach the lightweight trace
    delete (baseObj as any).path
    return {
      ...baseObj,
      compressedTrace
    }
  }

  static async fromObject(object: any) {
    // INFLATION: Convert the compressed trace back into an SVG string
    if (object.compressedTrace && !object.path) {
      let svg = ''
      let lastX = 0, lastY = 0

      for (let i = 0; i < object.compressedTrace.length; i++) {
        const val = object.compressedTrace[i]

        if (val === 'Z') {
          svg += 'Z '
        } else if (val === 'M') {
          let ix = object.compressedTrace[i + 1] as number
          let iy = object.compressedTrace[i + 2] as number
          svg += `M ${ix / 10} ${iy / 10} `
          lastX = ix
          lastY = iy
          i += 2 // Skip the coordinates we just read
        } else {
          // It's a delta LineTo
          let ix = (val as number) + lastX
          let iy = (object.compressedTrace[i + 1] as number) + lastY
          svg += `L ${ix / 10} ${iy / 10} `
          lastX = ix
          lastY = iy
          i += 1 // Skip the Y delta
        }
      }
      object.path = svg
    }

    const enlivenedProps = await enlivenStrokeProps(object)
    return new BucketFillPath(object.path, enlivenedProps)
  }
}