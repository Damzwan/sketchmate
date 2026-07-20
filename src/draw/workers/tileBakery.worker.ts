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
      // Images are refused main-side, so nothing here should ask for an <img>.
      // Return an inert stub rather than throwing — a stray measurement probe
      // must not kill the whole tile.
      throw new Error(`Worker mock document cannot create ${tag}`)
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

// --- lean mirror -------------------------------------------------------------
// json: the source of truth — one raw JSON blob per id. Cheap to hold at scale.
// live: bounded LRU of enlivened fabric objects. Map insertion order === LRU
//       order (touch = delete+set). Evicted down to LIVE_MAX after each bake.
const json = new Map<string, any>()
const live = new Map<string, any>()

// Bounded by the DENSEST single tile's object count, not the scene. Tuned for
// low-end from the main-side device probe carried on the first message.
let LIVE_MAX = 1536

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
  const j = json.get(id)
  if (!j) return null
  let obj: any
  try {
    ;[obj] = await util.enlivenObjects([j])
  } catch {
    return null
  }
  if (!obj) return null
  touch(id, obj)
  return obj
}

// --- rasterizer --------------------------------------------------------------
let renderCanvas: OffscreenCanvas | null = null

function getRenderCanvas(size: number): OffscreenCanvas {
  if (!renderCanvas || renderCanvas.width !== size || renderCanvas.height !== size) {
    renderCanvas = new OffscreenCanvas(size, size)
  }
  return renderCanvas
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
  ctx.beginPath()
  ctx.rect(world.x - pad, world.y - pad, world.w + 2 * pad, world.h + 2 * pad)
  ctx.clip()

  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i]
    if (!obj) continue
    obj.visible = true
    obj.canvas = null
    obj.objectCaching = false
    obj.dirty = true
    if (obj.clipPath) obj.clipPath.dirty = true
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
          if (typeof msg.liveMax === 'number' && msg.liveMax > 0) LIVE_MAX = msg.liveMax
          break
        case 'upsert':
          for (const item of msg.items) {
            json.set(item.id, item.json)
            live.delete(item.id) // geometry may have changed → re-enliven fresh
          }
          break
        case 'translate': {
          // Pure world translation (drag commit): patch coords in place instead
          // of shipping N re-serialized objects. Top-level objects only, so a
          // world shift is a left/top shift.
          const { dx, dy } = msg
          for (const id of msg.ids) {
            const j = json.get(id)
            if (j) {
              if (typeof j.left === 'number') j.left += dx
              if (typeof j.top === 'number') j.top += dy
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
      }
    } catch (err: any) {
      if ((msg as any).msgId !== undefined) {
        post({ msgId: (msg as any).msgId, error: err?.message ?? 'worker error' })
      }
    }
  })
}
