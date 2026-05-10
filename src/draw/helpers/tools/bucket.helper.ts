import { Canvas, FabricObject } from 'fabric'
import { CustomFloodFill } from '@/draw/utils/CustomFloodFill'
import { usePen } from '@/draw/store/tools/pen.store'
import { hex2RGBA } from '@/draw/utils/color.utils'
// @ts-ignore
import { contours } from 'd3-contour'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { Rect } from '@/draw/utils/QuadTree'
import { useToast } from '@/service/toast.service'

type Point = { x: number; y: number }

const MAX_OFFSCREEN_DIM = 4096
const RDP_TOLERANCE = 1.5
const MAX_WORLD_AREA = 2000000

function simplifyPathIterative(points: number[][], tolerance: number): number[][] {
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
        const ex = px - x1, ey = py - y1
        sqDist = ex * ex + ey * ey
      } else {
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
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

function buildSmartOffscreenCanvas(c: Canvas, scale: number, dpr: number) {
  const { query, getZIndexMap } = useDrawObjectManager()
  const vpt = c.viewportTransform!
  const zoom = c.getZoom()
  const screenW = c.width!
  const screenH = c.height!

  const vpLeft = -vpt[4] / zoom
  const vpTop = -vpt[5] / zoom
  const vpRight = (screenW - vpt[4]) / zoom
  const vpBottom = (screenH - vpt[5]) / zoom
  const vpWidth = vpRight - vpLeft
  const vpHeight = vpBottom - vpTop

  const viewportRect = new Rect(vpLeft, vpTop, vpWidth, vpHeight)
  const nearbyObjects = query(viewportRect)

  let expandLeft = vpLeft
  let expandTop = vpTop
  let expandRight = vpRight
  let expandBottom = vpBottom

  for (const obj of nearbyObjects) {
    // @ts-ignore
    const b = obj.getBoundingRect(true, true)
    const oL = b.left, oT = b.top
    const oR = b.left + b.width, oB = b.top + b.height

    if (oL < expandLeft) expandLeft = oL
    if (oT < expandTop) expandTop = oT
    if (oR > expandRight) expandRight = oR
    if (oB > expandBottom) expandBottom = oB
  }

  const pxPerWorldUnit = zoom * dpr * scale
  const maxWorldDim = MAX_OFFSCREEN_DIM / pxPerWorldUnit
  let worldW = expandRight - expandLeft
  let worldH = expandBottom - expandTop

  if (worldW > maxWorldDim) {
    const cx = (expandLeft + expandRight) / 2
    expandLeft = cx - maxWorldDim / 2
    expandRight = cx + maxWorldDim / 2
    worldW = maxWorldDim
  }
  if (worldH > maxWorldDim) {
    const cy = (expandTop + expandBottom) / 2
    expandTop = cy - maxWorldDim / 2
    expandBottom = cy + maxWorldDim / 2
    worldH = maxWorldDim
  }

  const offW = Math.min(Math.floor(worldW * pxPerWorldUnit), MAX_OFFSCREEN_DIM)
  const offH = Math.min(Math.floor(worldH * pxPerWorldUnit), MAX_OFFSCREEN_DIM)

  const effectiveScale = Math.min(offW / (worldW * zoom * dpr), offH / (worldH * zoom * dpr))
  const pxScale = zoom * dpr * effectiveScale

  const offscreen = document.createElement('canvas')
  offscreen.width = offW
  offscreen.height = offH
  const ctx = offscreen.getContext('2d', { alpha: false })!

  ctx.fillStyle = (c.backgroundColor as string) || '#ffffff'
  ctx.fillRect(0, 0, offW, offH)

  ctx.setTransform(pxScale, 0, 0, pxScale, -expandLeft * pxScale, -expandTop * pxScale)

  const renderRect = new Rect(expandLeft, expandTop, worldW, worldH)
  const objectsToRender = query(renderRect)
  const zIndexMap = getZIndexMap()

  objectsToRender.sort((a, b) => (zIndexMap.get(a) ?? 0) - (zIndexMap.get(b) ?? 0))

  for (const obj of objectsToRender) {
    obj.render(ctx)
  }

  return {
    offscreen,
    worldRect: { x: expandLeft, y: expandTop, w: worldW, h: worldH },
    effectiveScale,
    dpr
  }
}

export async function bucketFill(c: Canvas, p: Point, scale = 1): Promise<BucketFillPath | null> {
  const { brushColorWithOpacity } = usePen()
  const dpr = window.devicePixelRatio || 1
  const zoom = c.getZoom()

  // @ts-ignore
  FabricObject.NUM_FRACTION_DIGITS = 1

  const { offscreen, worldRect, effectiveScale } = buildSmartOffscreenCanvas(c, scale, dpr)

  const pxScale = zoom * dpr * effectiveScale
  const fillX = Math.round((p.x - worldRect.x) * pxScale)
  const fillY = Math.round((p.y - worldRect.y) * pxScale)

  if (fillX < 0 || fillY < 0 || fillX >= offscreen.width || fillY >= offscreen.height) {
    return null
  }

  const offCtx = offscreen.getContext('2d')!
  const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height)
  const brushColor = brushColorWithOpacity()

  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, fillX, fillY, 10)

  // Guard against massive fills that would crash the vectorizer
  const modifiedArea = floodFill.getModifiedArea()
  const worldArea = (modifiedArea.width / pxScale) * (modifiedArea.height / pxScale)

  if (floodFill.modifiedPixelsCount === 0) return null

  const { toast } = useToast()
  if (worldArea > MAX_WORLD_AREA) {
    toast('Area too large, Please zoom in or close the shape to fill.', { color: 'warning' })
    return null
  }

  const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor))
  const { width, height, data } = modifiedImgData

  await new Promise<void>(r => setTimeout(r, 0))

  const values = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    values[j] = data[i + 3] > 0 ? 1 : 0
  }

  const contourGenerator = contours().size([width, height]).thresholds([0.5])
  const contourData = contourGenerator(values)

  if (!contourData.length || !contourData[0].coordinates.length) return null

  const toWorldX = (offPx: number) => offPx / pxScale + worldRect.x
  const toWorldY = (offPx: number) => offPx / pxScale + worldRect.y

  const pathParts: string[] = []

  for (const polygon of contourData[0].coordinates) {
    for (const ring of polygon) {
      const pts = ring as [number, number][]
      if (pts.length < 2) continue

      const worldPoints = pts.map(([px, py]) => [toWorldX(px), toWorldY(py)])
      const simplified = simplifyPathIterative(worldPoints, RDP_TOLERANCE)
      if (simplified.length < 2) continue

      const cmds = new Array(simplified.length)
      cmds[0] = `M ${(simplified[0][0] * 10 | 0) / 10} ${(simplified[0][1] * 10 | 0) / 10}`
      for (let i = 1; i < simplified.length; i++) {
        cmds[i] = `L ${(simplified[i][0] * 10 | 0) / 10} ${(simplified[i][1] * 10 | 0) / 10}`
      }
      pathParts.push(cmds.join(' ') + ' Z')
    }
  }

  const svgPath = pathParts.join(' ')
  if (!svgPath) return null

  const centerX = toWorldX(modifiedArea.minX + modifiedArea.width / 2)
  const centerY = toWorldY(modifiedArea.minY + modifiedArea.height / 2)

  const physicalBleed = 5;
  const expansionAmount = Math.max(0.5, physicalBleed / zoom);

  return new BucketFillPath(svgPath, {
    fill: brushColor,
    stroke: brushColor, // Same as fill to bleed under edges
    strokeWidth: expansionAmount,
    strokeLineJoin: 'round',
    strokeLineCap: 'round',
    isBucketFill: true,
    left: centerX,
    top: centerY,
    fillRule: 'evenodd',
    paintFirst: 'stroke' // Ensures the stroke doesn't shrink the inner holes
  })
}