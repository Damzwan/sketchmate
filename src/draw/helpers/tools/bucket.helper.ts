import { Canvas, FabricObject } from 'fabric'
import { CustomFloodFill } from '@/draw/utils/CustomFloodFill'
import { usePen } from '@/draw/store/tools/pen.store'
import { hex2RGBA } from '@/draw/utils/color.utils'
// @ts-ignore
import { contours } from 'd3-contour'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'

type Point = { x: number; y: number }

/**
 * Ramer-Douglas-Peucker algorithm to simplify a set of points.
 * Greatly reduces the number of points in a path while maintaining its shape.
 */
function simplifyPath(points: number[][], tolerance: number): number[][] {
  if (points.length <= 2) return points

  const sqTolerance = tolerance * tolerance

  function getSqSegDist(p: number[], p1: number[], p2: number[]) {
    let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y
    if (dx !== 0 || dy !== 0) {
      let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = p2[0]
        y = p2[1]
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p[0] - x
    dy = p[1] - y
    return dx * dx + dy * dy
  }

  function simplifyStep(points: number[][], first: number, last: number, sqTolerance: number, simplified: number[]) {
    let maxSqDist = sqTolerance, index = -1
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(points[i], points[first], points[last])
      if (sqDist > maxSqDist) {
        index = i
        maxSqDist = sqDist
      }
    }
    if (maxSqDist > sqTolerance) {
      if (index - first > 1) simplifyStep(points, first, index, sqTolerance, simplified)
      // @ts-ignore
      simplified.push(points[index])
      if (last - index > 1) simplifyStep(points, index, last, sqTolerance, simplified)
    }
  }

  const simplified = [points[0]]
  // @ts-ignore
  simplifyStep(points, 0, points.length - 1, sqTolerance, simplified)
  simplified.push(points[points.length - 1])
  return simplified
}

export async function bucketFill(c: Canvas, p: Point, scale = 1) {
  const { brushColorWithOpacity } = usePen()
  const dpr = window.devicePixelRatio || 1

  // Set global serialization precision to 1 decimal place (massive space saver)
  // @ts-ignore
  FabricObject.NUM_FRACTION_DIGITS = 1

  const downscaledCanvas = createDownScaledCanvas(c, scale)
  const downscaledCtx = downscaledCanvas.getContext('2d')
  if (!downscaledCtx) return null

  const imgData = downscaledCtx.getImageData(0, 0, downscaledCanvas.width, downscaledCanvas.height)
  const brushColor = brushColorWithOpacity()

  const floodFill = new CustomFloodFill(imgData)
  // 10 is the tolerance for the flood fill match
  floodFill.fill(brushColor, Math.round(p.x * dpr * scale), Math.round(p.y * dpr * scale), 10)

  const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor))
  if (floodFill.modifiedPixelsCount === 0) return null

  // --- VECTORIZATION ---
  const { width, height, data } = modifiedImgData
  const values = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    values[j] = data[i + 3] > 0 ? 1 : 0
  }

  const contourGenerator = contours().size([width, height]).thresholds([0.5])
  const contourData = contourGenerator(values)

  if (contourData.length === 0 || contourData[0].coordinates.length === 0) return null

  let svgPath = ''
  const multiPolygon = contourData[0].coordinates

  const vpt = c.viewportTransform!
  const offsetX = vpt[4]
  const offsetY = vpt[5]
  const zoom = c.getZoom()
  const trueScale = 1 / (scale * dpr)

  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      // 1. Map to absolute coordinates
      const absPoints = ring.map((pt: any) => [
        (pt[0] * trueScale - offsetX) / zoom,
        (pt[1] * trueScale - offsetY) / zoom
      ])

      // 2. RDP Simplification (1.2 is a good balance between speed and quality)
      const simplifiedPoints = simplifyPath(absPoints, 1.2)

      // 3. Build SVG String with Coordinate Rounding (1 decimal)
      simplifiedPoints.forEach((pt, i) => {
        const x = Math.round(pt[0] * 10) / 10
        const y = Math.round(pt[1] * 10) / 10

        if (i === 0) svgPath += `M ${x} ${y} `
        else svgPath += `L ${x} ${y} `
      })
      svgPath += 'Z '
    }
  }

  if (!svgPath) return null

  const modifiedArea = floodFill.getModifiedArea()

  // 4. Create the native Fabric Path
  const vectorFill = new BucketFillPath(svgPath, {
    fill: brushColor,
    stroke: 'transparent',
    strokeWidth: 0,
    isBucketFill: true,
    left: ((modifiedArea.minX + modifiedArea.width / 2) / (scale * dpr) - offsetX) / c.getZoom(),
    top: ((modifiedArea.minY + (modifiedArea.height / 2)) / (scale * dpr) - offsetY) / c.getZoom(),
    fillRule: 'evenodd'
  })

  return vectorFill
}

export function createDownScaledCanvas(c: Canvas, scale: number) {
  const helper = c as any
  const lowerCanvas = helper.lowerCanvasEl as HTMLCanvasElement // this canvas contains the drawing data


  // Create a downscaled version of the original image
  const downscaledCanvas = document.createElement('canvas')
  downscaledCanvas.width = lowerCanvas.width * scale
  downscaledCanvas.height = lowerCanvas.height * scale
  const downscaledCtx = downscaledCanvas.getContext('2d')
  downscaledCtx!.drawImage(
    lowerCanvas,
    0,
    0,
    lowerCanvas.width,
    lowerCanvas.height,
    0,
    0,
    downscaledCanvas.width,
    downscaledCanvas.height
  )


  return downscaledCanvas
}