import { CustomFloodFill } from '@/draw/utils/CustomFloodFill'
// @ts-ignore - d3-contour has no bundled types here
import { contours } from 'd3-contour'

export interface FloodFillRequest {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  fillX: number;
  fillY: number;
  /** NB: no brush colour. The worker only derives GEOMETRY; the colour is
   *  applied to the fabric object by the caller. Feeding the brush colour into
   *  the scan is what broke fills whose colour matched the clicked pixel. */
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

/**
 * A colour guaranteed to differ from the pixel at (x, y) by far more than the
 * flood tolerance, so `CustomFloodFill.fill` never short-circuits. Black and
 * white are always ≥245 apart per channel; picking by seed luminance means the
 * seed is never close to the sentinel. Both are fully opaque, matching the
 * scratch buffer (created with `alpha: false`).
 */
function pickScanColor(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): string {
  const i = (y * width + x) * 4
  const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  return luma > 127 ? '#000000FF' : '#FFFFFFFF'
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
  // Scan with a SENTINEL colour, never the user's brush colour.
  //
  // CustomFloodFill.fill() returns immediately when the replacement colour
  // matches the colour being replaced. That is correct for a pixel painter —
  // repainting a colour with itself is a no-op — but wrong here, where the
  // output is a vector OBJECT, not pixels. Passing the brush colour meant that
  // picking the colour you were about to click on (most commonly the canvas
  // background, clicking empty space) produced zero modified pixels, an
  // `ok: false` with no `tooLarge`, a null from bucketFill and a completely
  // silent no-op in the tool. That was the "bucket fill does nothing when the
  // selected colour equals the background" bug.
  //
  // The scan colour only MARKS the region in this throwaway scratch buffer;
  // geometry comes from the mask below and the real brush colour is applied to
  // the fabric object by the caller. So it merely has to differ from the seed
  // pixel — hence two sentinels picked by seed luminance, always far apart.
  floodFill.fill(pickScanColor(imgData.data, width, fillX, fillY), fillX, fillY, 10)

  if (floodFill.modifiedPixelsCount === 0) return post({ ok: false })

  const modifiedArea = floodFill.getModifiedArea()

  // EDGE-TOUCH GUARD (region/zoom independent)
  // If the fill reaches the buffer border the enclosure extends past the
  // working region (or leaked through a barrier) — either way it's unbounded.
  // This is the reliable "too large" signal; the absolute-area check below is
  // a fixed threshold that no longer fits the now-variable region size.
  const touchesEdge =
    modifiedArea.minX <= 0 ||
    modifiedArea.minY <= 0 ||
    modifiedArea.maxX >= width - 1 ||
    modifiedArea.maxY >= height - 1

  if (touchesEdge) return post({ ok: false, tooLarge: true })

  const worldArea =
    (modifiedArea.width / pxScale) * (modifiedArea.height / pxScale)

  if (worldArea > maxWorldArea) return post({ ok: false, tooLarge: true })

  // Build the contour field straight from the fill MASK rather than
  // re-scanning the scratch buffer for pixels matching the fill colour
  // (getModifiedImageData). The mask records exactly what the flood wrote, so
  // it cannot pick up a pre-existing pixel that merely happens to share the
  // colour, and it skips an O(area) ImageData allocation per fill.
  //
  // Coordinates stay CROPPED to the modified area — same as before — while
  // centerX/centerY below stay in full-buffer space. Path re-centres on its own
  // bounding box, so the crop offset is absorbed and the object lands correctly.
  const mask = floodFill.getFilledMask()
  const mw = modifiedArea.width
  const mh = modifiedArea.height

  const values = new Float32Array(mw * mh)
  for (let y = 0; y < mh; y++) {
    const srcRow = (modifiedArea.minY + y) * width + modifiedArea.minX
    const dstRow = y * mw
    for (let x = 0; x < mw; x++) values[dstRow + x] = mask[srcRow + x] ? 1 : 0
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
