// tileBakery.worker.ts
//
// Off-thread tile rasterizer backed by a LEAN mirror. Two lessons from the
// first attempt drive this design:
//
//   1. The mirror is NOT a second scene graph. It stores raw JSON (cheap
//      strings) per id and enlivens fabric objects ON DEMAND for the tile being
//      baked, keeping at most LIVE_MAX of them (LRU). Worker live-object memory
//      is therefore bounded by the working set (a screenful of tiles), not the
//      scene size — no "double RAM tax", no GC panic on a 10k-object board.
//   2. The worker never touches images: image tiles are refused main-side, so
//      there is no fetch, no CORS surprise, no double download, and no fake
//      HTMLImageElement to keep fabric happy. The only DOM shim is a canvas.
//
// Consistency guarantees the main-side client (tileBakery.service.ts) relies on:
//   • postMessage is FIFO and the handler below is FIFO-chained, so an upsert /
//     translate posted before a bake is applied before that bake renders.
//   • A bake for an id the mirror lacks replies { missing }; the client
//     re-upserts once and retries, then falls back to a main-thread bake.
//   • Rendering matches CommittedLayer.rebuildTile exactly: same overscan
//     translate, same pad+clip, objects drawn in the id order provided.

import { classRegistry, util } from 'fabric'
import { ClippingGroup } from '@erase2d/fabric'
import { OptimizedEraserStroke } from '@/draw/utils/brushes/CustomEraserBrush'
import { OptimizedPencilStroke } from '@/draw/utils/brushes/CustomPencilBrush'
import { PixelStroke } from '@/draw/utils/brushes/PixelBrush'
import { CharcoalStroke } from '@/draw/utils/brushes/CharcoalBrush'
import { WaterColorStroke } from '@/draw/utils/brushes/WaterColorBrush'
import { CalligraphyStroke } from '@/draw/utils/brushes/CalligraphyBrush'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { CircleStroke } from '@/draw/utils/brushes/CustomCircleBrush'
import { NeonStroke } from '@/draw/utils/brushes/NeonSignBrush'
import { SprayStroke } from '@/draw/utils/brushes/CustomSprayBrush'
import { CrayonStroke } from '@/draw/utils/brushes/CrayonBrush'
import type { BakeryRequest, BakeryResponse } from '@/draw/types/tileBakery.types'
import { WORKER_FONTS } from '@/draw/config/workerFonts.config'

// --- fonts -------------------------------------------------------------------
// A worker has no CSS, so text used to be refused per-tile (wrong metrics in a
// committed tile is a correctness bug). Chromium exposes WorkerGlobalScope.fonts,
// so register the same faces the page uses and text becomes bakeable here.
//
// The main side is told EXACTLY which families succeeded and refuses any tile
// whose text uses something else — a partially-loaded set must never silently
// fall back to a default face.
const loadedFamilies = new Set<string>()

async function loadFonts(): Promise<string[]> {
  const fonts = (self as any).fonts
  if (!fonts || typeof FontFace === 'undefined') return []
  await Promise.all(
    WORKER_FONTS.map(async (spec) => {
      try {
        const face = new FontFace(spec.family, `url(${spec.url})`, {
          weight: spec.weight,
          style: 'normal'
        })
        await face.load()
        fonts.add(face)
        loadedFamilies.add(spec.family)
      } catch {
        /* one bad face must not block the rest — main side just keeps
           refusing tiles that use it */
      }
    })
  )
  return [...loadedFamilies]
}

// --- minimal DOM shim (canvas only; images never reach the worker) ----------
const applyCanvasDisguise = (canvas: any) => {
  canvas.hasAttribute = () => false
  canvas.getAttribute = () => null
  canvas.setAttribute = () => {}
  canvas.removeAttribute = () => {}
  canvas.style = {}
  canvas.classList = {
    add: () => {}, remove: () => {}, contains: () => false, toggle: () => {}
  }
  canvas.addEventListener = () => {}
  canvas.removeEventListener = () => {}
  canvas.dir = 'ltr'
  return canvas
}

if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return applyCanvasDisguise(new OffscreenCanvas(1, 1))
      if (tag === 'img') {
        return {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          width: 0,
          height: 0,
          complete: true,
          naturalWidth: 0,
          naturalHeight: 0
        }
      }
      return {}
    }
  };
  (globalThis as any).window = globalThis
}

const brushes = [
  [OptimizedEraserStroke, 'OptimizedEraserStroke'],
  [PixelStroke, 'PixelStroke'],
  [CharcoalStroke, 'CharcoalStroke'],
  [WaterColorStroke, 'WaterColorStroke'],
  [CalligraphyStroke, 'CalligraphyStroke'],
  [BucketFillPath, 'BucketFillPath'],
  [OptimizedPencilStroke, 'OptimizedPencilStroke'],
  [CircleStroke, CircleStroke.type],
  [SprayStroke, SprayStroke.type],
  [NeonStroke, NeonStroke.type],
  [CrayonStroke, CrayonStroke.type]
] as const
brushes.forEach(([cls, name]) => classRegistry.setClass(cls as any, name))

// Register the eraser's clip class (type 'clipping'). It self-registers via a
// module side-effect on the MAIN thread (CustomEraserBrush imports it), but the
// worker never imported it — so enlivening an erased object here found no class
// for 'clipping' and dropped its clip. Result: erased holes REAPPEARED in
// worker-baked tiles (or the object failed to enliven and vanished). Explicit
// setClass so the import isn't tree-shaken and the mask bakes correctly.
classRegistry.setClass(ClippingGroup as any)

// --- lean mirror -------------------------------------------------------------
// json: the source of truth — one raw JSON blob per id. Cheap to hold at scale.
// live: bounded LRU of enlivened fabric objects. Map insertion order === LRU
//       order (touch = delete+set). Evicted down to LIVE_MAX after each bake.
const json = new Map<string, any>()
const live = new Map<string, any>()

// Two caps, deliberately. LIVE_MAX is the WORKING cap during a bake pass: it
// must exceed the whole viewport's object count or tiles evict each other's
// objects and re-enliven them (thrash). IDLE_MAX is the AT-REST cap: a few
// seconds after the last bake the cache shrinks back, so a board smaller than
// LIVE_MAX doesn't sit permanently fully-enlivened here — that would recreate
// the "double RAM" second scene graph this mirror exists to avoid.
let LIVE_MAX = 1536
let IDLE_MAX = 192
const IDLE_SHRINK_MS = 4000
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** Drop the LRU tail down to `cap`. json stays — objects re-enliven on demand. */
function shrinkTo(cap: number): void {
  while (live.size > cap) {
    const oldest = live.keys().next()
    if (oldest.done) break
    live.delete(oldest.value)
  }
}

function scheduleIdleShrink(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    shrinkTo(IDLE_MAX)
  }, IDLE_SHRINK_MS)
}

function touch(id: string, obj: any): void {
  live.delete(id)
  live.set(id, obj)
}

function evictLive(protectedIds?: Set<string>): void {
  if (live.size <= LIVE_MAX) return
  for (const id of live.keys()) {
    if (live.size <= LIVE_MAX) break
    if (protectedIds?.has(id)) continue
    live.delete(id) // drop the enlivened copy; json stays, re-enlivens on demand
  }
}

/** Enliven (or fetch from LRU) the object for `id`. Null if json unknown. */
async function ensureLive(id: string): Promise<any | null> {
  const cached = live.get(id)
  if (cached) {
    touch(id, cached)
    return cached
  }
  const raw = json.get(id)
  if (raw === undefined) return null
  let obj: any
  try {
    // The mirror stores STRINGS (see the upsert handler) — a JSON string is far
    // smaller than its parsed object graph, and the mirror holds the whole
    // shippable scene forever, so on a big board this is the dominant non-tile
    // allocation. Parse on demand here (off the main thread); enliven parses
    // its input anyway, so the extra cost is small. Tolerates a legacy object.
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    ;[obj] = await util.enlivenObjects([j])
  } catch {
    return null
  }
  if (!obj) return null
  touch(id, obj)
  return obj
}

/**
 * Make an object report the TIER scale as its total scaling for this render.
 *
 * `objectCaching = false` does not stop fabric caching: shouldCache() is
 * `objectCaching && … || needsItsOwnCache()`, and needsItsOwnCache() is true
 * whenever there's a clipPath — every ERASED object. The cache resolution comes
 * from getTotalObjectScaling(), which here (canvas === null) is just the object
 * scale, i.e. ZOOM 1 — so an erased object baked into a tier-8 tile was a
 * zoom-1 cache blown up 8x and never sharpened however far you zoomed.
 *
 * Reporting the tier scale makes _updateCacheCanvas() see zoomChanged and
 * regenerate the cache at tile resolution by itself.
 */
function rectHitsBounds(
  r: { x: number; y: number; w: number; h: number },
  b: { left: number; top: number; width: number; height: number }
): boolean {
  return !(b.left + b.width < r.x || b.left > r.x + r.w ||
           b.top + b.height < r.y || b.top > r.y + r.h)
}

function applyTierScaling(
  obj: any,
  tierScale: number,
  clipRect?: { x: number; y: number; w: number; h: number }
): void {
  obj.objectCaching = false
  obj.getTotalObjectScaling = function () {
    return this.getObjectScaling().scalarMultiply(tierScale)
  }
  // The clipPath (eraser ClippingGroup) is ALWAYS cached for masking, at its OWN
  // scaling = zoom 1 here (canvas null) — so the erase mask rasterizes at 1x and
  // upscales to the tile tier, blurring erased edges when zoomed in. Give the
  // clip (and its stroke children) the same tier scaling so the mask bakes
  // sharp. No clip cull — a mask must render whole.
  if (obj.clipPath && typeof obj.clipPath.getObjectScaling === 'function') {
    applyTierScaling(obj.clipPath, tierScale)
  }
  // Recurse into groups. A merged drawing is a Group: clearing caching on the
  // group alone left its CHILDREN caching (fabric assigns `objectCaching: true`
  // per instance from ownDefaults, and enlivened JSON carries it back), each
  // rasterized at zoom 1 here because `canvas` is null — merged art came out
  // visibly blurrier than the same paths ungrouped.
  if (!Array.isArray(obj._objects)) return
  for (let i = 0; i < obj._objects.length; i++) {
    const child = obj._objects[i]
    // CULL: the group is ONE index entry spanning all its children, so every
    // tile overlapping that union would otherwise render every child (fabric
    // does not cull children of a group, and canvas is null here so there is no
    // offscreen check at all) — children × tiles work instead of children.
    // NB: mirror objects persist in the LRU across bakes, so `visible` MUST be
    // reset every time — never left false from a previous tile, or the child
    // vanishes from later tiles and from the overview (which passes no clip).
    let inTile = true
    if (clipRect) {
      try {
        inTile = rectHitsBounds(clipRect, child.getBoundingRect())
      } catch { /* un-measurable child: render it */ }
    }
    child.visible = inTile
    if (!inTile) continue
    applyTierScaling(child, tierScale, clipRect)
  }
}

// --- rasterizer --------------------------------------------------------------
let renderCanvas: OffscreenCanvas | null = null

function getRenderCanvas(size: number): OffscreenCanvas {
  if (!renderCanvas || renderCanvas.width !== size || renderCanvas.height !== size) {
    renderCanvas = new OffscreenCanvas(size, size)
  }
  return renderCanvas
}

// Separate from the tile scratch: an overview render is px×px (1024/2048) and
// would otherwise force the tile canvas to resize back and forth every rebuild.
let overviewCanvas: OffscreenCanvas | null = null

function getOverviewCanvas(px: number): OffscreenCanvas {
  if (!overviewCanvas || overviewCanvas.width !== px || overviewCanvas.height !== px) {
    overviewCanvas = new OffscreenCanvas(px, px)
  }
  return overviewCanvas
}

async function bake(req: Extract<BakeryRequest, { t: 'bake' }>): Promise<void> {
  const { msgId, ids, world, scale, overscan, size } = req

  const missing = ids.filter((id) => !json.has(id))
  if (missing.length) {
    post({ msgId, missing })
    return
  }

  // Enliven exactly the ids this tile needs (LRU-cached across overlapping
  // tiles in a bake burst). Runs off the main thread, so no UI jank.
  const objs: any[] = new Array(ids.length)
  for (let i = 0; i < ids.length; i++) objs[i] = await ensureLive(ids[i])

  const canvas = getRenderCanvas(size)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    post({ msgId, error: 'no 2d context' })
    return
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.translate(overscan, overscan)
  ctx.scale(scale, scale)
  ctx.translate(-world.x, -world.y)

  // Same pad+clip as CommittedLayer.rebuildTile — pixel-identical output.
  const pad = overscan / scale + 4 / scale
  const q = {
    x: world.x - pad, y: world.y - pad,
    w: world.w + 2 * pad, h: world.h + 2 * pad
  }
  ctx.beginPath()
  ctx.rect(q.x, q.y, q.w, q.h)
  ctx.clip()

  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i]
    if (!obj) continue
    obj.visible = true
    obj.canvas = null
    obj.objectCaching = false
    obj.dirty = true
    if (obj.clipPath) obj.clipPath.dirty = true
    applyTierScaling(obj, scale, q)
    ctx.save()
    try {
      obj.render(ctx as any)
    } catch { /* one bad object must not kill the tile */
    } finally {
      ctx.restore()
    }
  }
  ctx.restore()

  // Keep this tile's objects; trim the rest of the LRU back to the cap.
  evictLive(new Set(ids))
  scheduleIdleShrink()

  const bitmap = canvas.transferToImageBitmap()
  post({ msgId, bitmap }, [bitmap])
}

/**
 * Whole-board overview render. Same math as WorldOverview's local rebuild:
 * fit `bounds` into px×px, draw z-ordered ids. Objects are enlivened through
 * the same LRU as tiles (so a subsequent viewport bake reuses them). A fresh
 * offscreen is used per call — the overview canvas outlives the request on the
 * main side as a bitmap, so we must not reuse the tile scratch.
 */
async function overview(req: Extract<BakeryRequest, { t: 'overview' }>): Promise<void> {
  const { msgId, ids, bounds, px, scale } = req
  if (bounds.w <= 0 || bounds.h <= 0) {
    post({ msgId, error: 'bad bounds' })
    return
  }
  // Report unknown ids instead of silently rendering a blank overview — the
  // caller re-upserts + retries, else falls back to a local render. Without
  // this a not-yet-seeded mirror produces an empty base layer = blank canvas
  // when zoomed out (overview tier is the whole picture).
  const missing = ids.filter((id) => !json.has(id))
  if (missing.length) {
    post({ msgId, missing })
    return
  }
  // Pooled, like the tile scratch. This was a fresh `new OffscreenCanvas(px,px)`
  // per call — 4MB on mobile (1024²) or 16MB on desktop (2048²), allocated and
  // thrown away on every overview rebuild. On Adreno that allocation churn is
  // part of what faults libgsl (docs/DRAW_ENGINE_PERF.md finding F5).
  // transferToImageBitmap() detaches the backing store and leaves the canvas
  // reusable at the same size, so one instance serves every rebuild.
  const canvas = getOverviewCanvas(px)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    post({ msgId, error: 'no 2d context' })
    return
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, px, px)
  const sx = px / bounds.w
  const sy = px / bounds.h
  ctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy)

  for (let i = 0; i < ids.length; i++) {
    const obj = await ensureLive(ids[i])
    if (!obj) continue
    obj.visible = true
    obj.canvas = null
    obj.objectCaching = false
    obj.dirty = true
    if (obj.clipPath) obj.clipPath.dirty = true
    applyTierScaling(obj, Math.max(sx, sy))
    ctx.save()
    try {
      obj.render(ctx as any)
    } catch { /* one bad object must not kill the overview */
    } finally {
      ctx.restore()
    }
  }
  evictLive()
  scheduleIdleShrink()

  const bitmap = canvas.transferToImageBitmap()
  post({ msgId, bitmap }, [bitmap])
}

function post(msg: BakeryResponse, transfer: Transferable[] = []): void {
  ;(self as any).postMessage(msg, transfer)
}

// --- FIFO message pump -------------------------------------------------------
// Chained so upsert/translate posted before a bake is applied before it renders.
let chain: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent<BakeryRequest>) => {
  const msg = e.data
  chain = chain.then(async () => {
    try {
      switch (msg.t) {
        case 'config':
          if (typeof msg.liveMax === 'number' && msg.liveMax > 0) {
            LIVE_MAX = msg.liveMax
            IDLE_MAX = Math.max(128, Math.floor(LIVE_MAX / 16))
          }
          // Register fonts and tell the client which families are safe to send.
          // Chained like every other message, so no bake can render text before
          // the faces are in this worker's FontFaceSet.
          post({ msgId: -1, fonts: await loadFonts() })
          break
        case 'upsert':
          for (const item of msg.items) {
            // Store as a STRING, not the parsed graph — see ensureLive. Halves
            // the mirror's steady-state memory on a large board (its biggest
            // non-tile cost). Stringify runs off the main thread. Fall back to
            // the object if it isn't serializable (main already sanitizes).
            let stored: any = item.json
            try {
              stored = JSON.stringify(item.json)
            } catch { /* keep the object */ }
            json.set(item.id, stored)
            live.delete(item.id) // geometry may have changed → re-enliven fresh
          }
          break
        case 'translate': {
          // Pure world translation (drag commit): patch coords in place instead
          // of shipping N re-serialized objects. Top-level objects only, so a
          // world shift is a left/top shift. The stored json is a string, so
          // parse+patch+re-stringify here (off the main thread); the main side
          // still sends only this one tiny message.
          const { dx, dy } = msg
          for (const id of msg.ids) {
            const raw = json.get(id)
            if (raw !== undefined) {
              try {
                const j = typeof raw === 'string' ? JSON.parse(raw) : raw
                if (typeof j.left === 'number') j.left += dx
                if (typeof j.top === 'number') j.top += dy
                json.set(id, typeof raw === 'string' ? JSON.stringify(j) : j)
              } catch { /* leave as-is; a later upsert corrects it */ }
            }
            const o = live.get(id)
            if (o) {
              o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy })
              o.setCoords()
            }
          }
          break
        }
        case 'remove':
          for (const id of msg.ids) {
            json.delete(id)
            live.delete(id)
          }
          break
        case 'clear':
          json.clear()
          live.clear()
          break
        case 'bake':
          await bake(msg)
          break
        case 'overview':
          await overview(msg)
          break
      }
    } catch (err: any) {
      if ((msg as any).msgId !== undefined) {
        post({ msgId: (msg as any).msgId, error: err?.message ?? 'worker error' })
      }
    }
  })
}
