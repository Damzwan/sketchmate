import { CustomFloodFill } from '@/draw/utils/CustomFloodFill'
import { hex2RGBA } from '@/draw/utils/color.utils'
// @ts-ignore - d3-contour has no bundled types here
import { contours } from 'd3-contour'

export interface FloodFillRequest {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  fillX: number;
  fillY: number;
  brushColor: string;
  pxScale: number;
  worldRectX: number;
  worldRectY: number;
  rdpTolerance: number;
  maxWorldArea: number;
}

export interface FloodFillResponse {
  ok: boolean;
  tooLarge?: boolean;
  svgPath?: string;
  centerX?: number;
  centerY?: number;
}

function simplifyPathIterative(
  points: number[][],
  tolerance: number
): number[][] {
  if (points.length <= 2) return points
  const sqTol = tolerance * tolerance
  const stack: [number, number][] = [[0, points.length - 1]]
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxSqDist = 0
    let index = -1

    const [x1, y1] = points[first]
    const [x2, y2] = points[last]
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy

    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      let sqDist: number
      if (lenSq === 0) {
        const ex = px - x1,
          ey = py - y1
        sqDist = ex * ex + ey * ey
      } else {
        const t = Math.max(
          0,
          Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)
        )
        const ex = px - (x1 + t * dx)
        const ey = py - (y1 + t * dy)
        sqDist = ex * ex + ey * ey
      }
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist
        index = i
      }
    }

    if (maxSqDist > sqTol && index !== -1) {
      keep[index] = 1
      if (index - first > 1) stack.push([first, index])
      if (last - index > 1) stack.push([index, last])
    }
  }

  const result: number[][] = []
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i])
  }
  return result
}

self.onmessage = (e: MessageEvent<FloodFillRequest>) => {
  const {
    buffer,
    width,
    height,
    fillX,
    fillY,
    brushColor,
    pxScale,
    worldRectX,
    worldRectY,
    rdpTolerance,
    maxWorldArea
  } = e.data

  const post = (res: FloodFillResponse) =>
    (self as unknown as Worker).postMessage(res)

  const imgData = new ImageData(new Uint8ClampedArray(buffer), width, height)

  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, fillX, fillY, 10)

  if (floodFill.modifiedPixelsCount === 0) return post({ ok: false })

  const modifiedArea = floodFill.getModifiedArea()
  const worldArea =
    (modifiedArea.width / pxScale) * (modifiedArea.height / pxScale)

  if (worldArea > maxWorldArea) return post({ ok: false, tooLarge: true })

  const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor))
  const { width: mw, height: mh, data } = modifiedImgData

  const values = new Float32Array(mw * mh)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    values[j] = data[i + 3] > 0 ? 1 : 0
  }

  const contourGenerator = contours().size([mw, mh]).thresholds([0.5])
  const contourData = contourGenerator(values)

  if (!contourData.length || !contourData[0].coordinates.length)
    return post({ ok: false })

  const toWorldX = (offPx: number) => offPx / pxScale + worldRectX
  const toWorldY = (offPx: number) => offPx / pxScale + worldRectY

  const pathParts: string[] = []

  for (const polygon of contourData[0].coordinates) {
    for (const ring of polygon) {
      const pts = ring as [number, number][]
      if (pts.length < 2) continue

      const worldPoints = pts.map(([px, py]) => [toWorldX(px), toWorldY(py)])
      const simplified = simplifyPathIterative(worldPoints, rdpTolerance)
      if (simplified.length < 2) continue

      const cmds = new Array(simplified.length)
      cmds[0] = `M ${((simplified[0][0] * 10) | 0) / 10} ${((simplified[0][1] * 10) | 0) / 10}`
      for (let i = 1; i < simplified.length; i++) {
        cmds[i] =
          `L ${((simplified[i][0] * 10) | 0) / 10} ${((simplified[i][1] * 10) | 0) / 10}`
      }
      pathParts.push(cmds.join(' ') + ' Z')
    }
  }

  const svgPath = pathParts.join(' ')
  if (!svgPath) return post({ ok: false })

  const centerX = toWorldX(modifiedArea.minX + modifiedArea.width / 2)
  const centerY = toWorldY(modifiedArea.minY + modifiedArea.height / 2)

  post({ ok: true, svgPath, centerX, centerY })
}
