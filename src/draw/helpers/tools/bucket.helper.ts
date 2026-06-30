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

// Fixed spatial constants ensuring deterministic performance & fidelity
const PIXELS_PER_WORLD_UNIT = 1.25 // Locked base resolution ratio (1.0 - 1.5 is ideal)
const MAX_WORLD_DIM = 2500 // Fixed-size virtual workspace centered around click
const RDP_TOLERANCE = 1.2 // Vector simplification tuning variable
const MAX_WORLD_AREA = 2500000 // Maximum vector area threshold before safety guard triggers
const MAX_OFFSCREEN_PIXELS = 1200

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
 * Builds a smart virtual canvas anchored precisely on the user's click coordinate.
 * It functions perfectly even if the target objects are mostly off-screen.
 */
function buildSmartOffscreenCanvas(c: Canvas, clickPoint: Point) {
  const { query, getZIndexMap } = useDrawObjectManager()

  const expandLeft = clickPoint.x - MAX_WORLD_DIM / 2
  const expandTop = clickPoint.y - MAX_WORLD_DIM / 2

  // DYNAMIC RESOLUTION DEFENSE
  // Start with ideal resolution, but crush it down if it exceeds our safe pixel budget
  let currentPxScale = PIXELS_PER_WORLD_UNIT
  let targetOffW = Math.floor(MAX_WORLD_DIM * currentPxScale)

  if (targetOffW > MAX_OFFSCREEN_PIXELS) {
    currentPxScale = MAX_OFFSCREEN_PIXELS / MAX_WORLD_DIM
    targetOffW = MAX_OFFSCREEN_PIXELS
  }

  const offW = targetOffW
  const offH = targetOffW // Square aspect ratio

  const offscreen = document.createElement('canvas')
  offscreen.width = offW
  offscreen.height = offH
  const ctx = offscreen.getContext('2d', { alpha: false })!

  ctx.fillStyle = (c.backgroundColor as string) || '#ffffff'
  ctx.fillRect(0, 0, offW, offH)

  // Apply the safe, dynamically calculated scale
  ctx.setTransform(
    currentPxScale,
    0,
    0,
    currentPxScale,
    -expandLeft * currentPxScale,
    -expandTop * currentPxScale
  )

  const renderRect: Rect = {
    x: expandLeft,
    y: expandTop,
    w: MAX_WORLD_DIM,
    h: MAX_WORLD_DIM
  }

  const objectsToRender = query(renderRect)
  const zIndexMap = getZIndexMap()

  objectsToRender.sort(
    (a, b) => (zIndexMap.get(a) ?? 0) - (zIndexMap.get(b) ?? 0)
  )

  for (const obj of objectsToRender) {
    obj.render(ctx)
  }

  return {
    offscreen,
    worldRect: renderRect,
    pxScale: currentPxScale // Pass this down so mapping still aligns perfectly
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
  const { offscreen, worldRect, pxScale } = buildSmartOffscreenCanvas(c, p)

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

  // Set the "bleed" constant purely in world units (e.g., 1.5 units wide).
  // This keeps anti-aliased edge coverage perfectly identical regardless of zoom level.
  const worldUnitBleedExpansion = 1.5

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
