import { Canvas, FabricObject } from 'fabric'
import { usePen } from '@/draw/store/tools/pen.store'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { Rect } from '@/draw/utils/QuadTree'
import { useToast } from '@/service/toast.service'
import type {
  FloodFillRequest,
  FloodFillResponse
} from '@/draw/helpers/tools/bucketFill.worker'

type Point = { x: number; y: number };

// Spatial constants. Resolution adapts to the thinnest barrier so hairline
// strokes still render as solid, multi-pixel barriers (see buildSmartOffscreenCanvas).
const MAX_WORLD_DIM = 2500 // Largest workspace — thick strokes / big fills / no strokes
const MIN_WORLD_DIM = 600 // Smallest workspace — hairline strokes get max resolution
const RDP_TOLERANCE = 1.2 // Vector simplification tuning variable
const MAX_WORLD_AREA = 2500000 // Maximum vector area threshold before safety guard triggers
const MAX_OFFSCREEN_PIXELS = 1200 // Fixed offscreen buffer edge (px); perf-bounded
const MIN_BARRIER_PX = 3 // Barrier must render >= this many px to block the radius-2 flood
const BASE_BLEED = 1.5 // Fill bleed (world units) tucked under surrounding strokes

// ── Flood-fill worker (lazy singleton) ──────────────────────────────────────
// The flood fill scan + contour tracing run off the main thread so big fills
// no longer freeze the UI. Concurrency is guarded by the caller (one fill at a
// time), so a single reusable worker + per-call listener is sufficient.
let fillWorker: Worker | null = null

function getFillWorker(): Worker {
  if (!fillWorker) {
    fillWorker = new Worker(
      new URL('./bucketFill.worker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return fillWorker
}

function runFloodFill(
  payload: FloodFillRequest,
  transfer: Transferable[]
): Promise<FloodFillResponse> {
  return new Promise((resolve, reject) => {
    const w = getFillWorker()
    const onMessage = (e: MessageEvent<FloodFillResponse>) => {
      cleanup()
      resolve(e.data)
    }
    const onError = (e: ErrorEvent) => {
      cleanup()
      reject(e.error ?? new Error(e.message))
    }
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage(payload, transfer)
  })
}

/**
 * Thinnest stroke width (world units) among stroked objects. Fills/images
 * (no stroke) are ignored. No strokes at all → MAX_WORLD_DIM, which drives the
 * resolution math to base res + full region (the old fixed behaviour).
 */
function thinnestStroke(objs: FabricObject[]): number {
  let min = Number.POSITIVE_INFINITY
  for (const o of objs) {
    if (o.stroke == null) continue
    const w = o.strokeWidth
    if (w != null && w > 0 && w < min) min = w
  }
  return Number.isFinite(min) ? Math.max(1, min) : MAX_WORLD_DIM
}

/**
 * Builds a smart virtual canvas anchored precisely on the user's click coordinate.
 * It functions perfectly even if the target objects are mostly off-screen.
 *
 * ADAPTIVE RESOLUTION
 * The offscreen buffer is a fixed MAX_OFFSCREEN_PIXELS square (perf-bounded), so
 * resolution and world-region size trade off. Pick pxScale to render even the
 * thinnest barrier as a solid >= MIN_BARRIER_PX line — otherwise a sub-pixel
 * stroke lets the radius-2 flood (see CustomFloodFill) leak and flood the world.
 * Hairline strokes → high res + small region; thick / no strokes → base res +
 * full region. No stroke bump needed: barriers are real at every scale.
 */
function buildSmartOffscreenCanvas(c: Canvas, clickPoint: Point) {
  const { query, getZIndexMap } = useDrawObjectManager()

  // Probe a small neighborhood around the click for the thinnest stroke — the
  // barriers that actually enclose the fill are near the click. Sizing off the
  // global thinnest stroke would let one distant hairline collapse the region
  // and make fill coverage feel unpredictable.
  const probeRect: Rect = {
    x: clickPoint.x - MIN_WORLD_DIM / 2,
    y: clickPoint.y - MIN_WORLD_DIM / 2,
    w: MIN_WORLD_DIM,
    h: MIN_WORLD_DIM
  }
  const probeMinStroke = thinnestStroke(query(probeRect))

  const minPxScale = MAX_OFFSCREEN_PIXELS / MAX_WORLD_DIM // full region, base res
  const maxPxScale = MAX_OFFSCREEN_PIXELS / MIN_WORLD_DIM // tightest region, max res
  const pxScale = Math.min(
    maxPxScale,
    Math.max(minPxScale, MIN_BARRIER_PX / probeMinStroke)
  )
  const worldDim = MAX_OFFSCREEN_PIXELS / pxScale // in [MIN_WORLD_DIM, MAX_WORLD_DIM]

  const expandLeft = clickPoint.x - worldDim / 2
  const expandTop = clickPoint.y - worldDim / 2

  const off = MAX_OFFSCREEN_PIXELS // buffer edge is always fixed
  const offscreen = document.createElement('canvas')
  offscreen.width = off
  offscreen.height = off
  const ctx = offscreen.getContext('2d', { alpha: false })!

  ctx.fillStyle = (c.backgroundColor as string) || '#ffffff'
  ctx.fillRect(0, 0, off, off)

  ctx.setTransform(
    pxScale,
    0,
    0,
    pxScale,
    -expandLeft * pxScale,
    -expandTop * pxScale
  )

  const renderRect: Rect = {
    x: expandLeft,
    y: expandTop,
    w: worldDim,
    h: worldDim
  }

  const objectsToRender = query(renderRect)
  const zIndexMap = getZIndexMap()

  objectsToRender.sort(
    (a, b) => (zIndexMap.get(a) ?? 0) - (zIndexMap.get(b) ?? 0)
  )

  // ZOOM-INDEPENDENT BARRIERS
  // Fabric caches each object's bitmap at a resolution tied to the on-screen
  // zoom. Zoomed out, that cache is low-res, so rendering it into the offscreen
  // upscales a blurry, thinned barrier — the flood then leaks or stops short and
  // the fill loses accuracy. Disable caching for this pass so objects draw their
  // vectors directly at our controlled pxScale, crisp at any zoom. Restore after.
  for (const obj of objectsToRender) {
    const cached = obj.objectCaching
    obj.objectCaching = false
    obj.render(ctx)
    obj.objectCaching = cached
  }

  return {
    offscreen,
    worldRect: renderRect,
    pxScale,
    // Thinnest barrier actually inside the final region — bounds the fill bleed
    // so the under-tuck never pokes out the far side of a thin stroke.
    minStrokeWorld: thinnestStroke(objectsToRender)
  }
}

export async function bucketFill(
  c: Canvas,
  p: Point
): Promise<BucketFillPath | null> {
  const { brushColorWithOpacity } = usePen()

  // Fix precision floating issues in Fabric generation
  // @ts-ignore
  FabricObject.NUM_FRACTION_DIGITS = 1

  // Generate localized virtual environment
  const { offscreen, worldRect, pxScale, minStrokeWorld } =
    buildSmartOffscreenCanvas(c, p)

  // Map absolute click onto localized pixels
  const fillX = Math.round((p.x - worldRect.x) * pxScale)
  const fillY = Math.round((p.y - worldRect.y) * pxScale)

  if (
    fillX < 0 ||
    fillY < 0 ||
    fillX >= offscreen.width ||
    fillY >= offscreen.height
  ) {
    return null
  }

  const offCtx = offscreen.getContext('2d')!
  const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height)
  const brushColor = brushColorWithOpacity()

  // Hand the pixel scan + contour tracing to the worker. The ImageData buffer
  // is transferred (zero-copy) — it's not used again on this thread.
  const result = await runFloodFill(
    {
      buffer: imgData.data.buffer,
      width: imgData.width,
      height: imgData.height,
      fillX,
      fillY,
      brushColor,
      pxScale,
      worldRectX: worldRect.x,
      worldRectY: worldRect.y,
      rdpTolerance: RDP_TOLERANCE,
      maxWorldArea: MAX_WORLD_AREA
    },
    [imgData.data.buffer]
  )

  if (!result.ok) {
    if (result.tooLarge) {
      useToast().toast('Area too large', { color: 'warning' })
    }
    return null
  }

  const svgPath = result.svgPath!
  const centerX = result.centerX!
  const centerY = result.centerY!

  // Bleed the fill outward (world units) so its edge tucks under the surrounding
  // strokes and no anti-aliased seam shows. Clamp to half the thinnest barrier so
  // the tuck never pokes out the far side of a thin stroke.
  const worldUnitBleedExpansion = Math.min(BASE_BLEED, minStrokeWorld / 2)

  return new BucketFillPath(svgPath, {
    fill: brushColor,
    stroke: brushColor,
    strokeWidth: worldUnitBleedExpansion,
    strokeLineJoin: 'round',
    strokeLineCap: 'round',
    isBucketFill: true,
    left: centerX,
    top: centerY,
    fillRule: 'evenodd',
    paintFirst: 'stroke'
  })
}
