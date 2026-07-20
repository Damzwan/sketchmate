// tileBakery.worker.ts
//
// Persistent fabric mirror + tile rasterizer. The main thread streams object
// DELTAS (upsert/remove/clear) exactly once per settled mutation — the same
// cadence as the multiplayer socket protocol — so the scene is never
// re-serialized wholesale. Bake requests then carry only tile geometry and
// z-ordered object ids; the reply is a transferable ImageBitmap (zero-copy).
//
// Guarantees relied on by the main-side client (tileBakery.service.ts):
//   • postMessage delivery is FIFO and handling below is FIFO-chained, so an
//     upsert posted before a bake is always applied before that bake renders.
//   • enliven is async (images fetch lazily); a bake that needs a not-yet-ready
//     object waits briefly, then reports { missing } so the caller can fall
//     back to a main-thread bake for that tile. Nothing ever renders half-ready.
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

// --- MOCK DOM & DISGUISE (same pattern as preview/eraser workers) ----------
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
      if (tag === 'canvas') {
        return applyCanvasDisguise(new OffscreenCanvas(1, 1))
      }
      if (tag === 'img') {
        const img = {
          style: {},
          onload: null as any,
          onerror: null as any,
          _src: '',
          _bitmap: null as ImageBitmap | null,

          get nodeName() {
            return 'IMG'
          },

          set ['src'](value: string) {
            this._src = value
            fetch(value)
              .then((res) => res.blob())
              .then((blob) => createImageBitmap(blob))
              .then((bitmap) => {
                this._bitmap = bitmap;
                (this as any).width = bitmap.width;
                (this as any).height = bitmap.height;
                (this as any).complete = true
                if (this.onload) this.onload()
              })
              .catch((err) => {
                if (this.onerror) this.onerror(err)
              })
          },
          get ['src']() {
            return this._src
          },

          width: 0,
          height: 0,
          nodeType: 1,
          parentNode: null,
          ownerDocument: (globalThis as any).document,
          addEventListener: () => {},
          removeEventListener: () => {},
          getAttribute: (name: string) => (name === 'src' ? (img as any)._src : null),
          hasAttribute: () => false,
          setAttribute: () => {},
          classList: { add: () => {}, remove: () => {} }
        }
        return img
      }
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

// --- mirror ------------------------------------------------------------------
const mirror = new Map<string, any>()
/** Objects whose async enliven (image fetch, …) hasn't finished yet. */
const settling = new Map<string, Promise<void>>()

const IMAGE_WAIT_MS = 3000

function waitForImage(obj: any): Promise<void> {
  return new Promise((resolve) => {
    const el = obj._element
    if (!el || el._bitmap) return resolve()
    const prev = el.onload
    el.onload = () => {
      if (prev) prev()
      resolve()
    }
    setTimeout(() => resolve(), IMAGE_WAIT_MS)
  })
}

function upsertOne(id: string, json: any): void {
  const p = (async () => {
    const [obj] = await util.enlivenObjects([json])
    const o: any = obj
    if (o.type === 'image' && o._element) {
      await waitForImage(o)
      if (o._element?._bitmap) o._element = o._element._bitmap
    }
    mirror.set(id, o)
  })()
    .catch(() => {
      // Enliven failed (unknown class, bad payload) — leave the id absent so
      // bakes report it missing and the main thread keeps its local fallback.
      mirror.delete(id)
    })
    .finally(() => {
      if (settling.get(id) === p) settling.delete(id)
    })
  settling.set(id, p)
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

  // Wait for in-flight enlivens of the ids this tile needs (bounded — image
  // waits are already capped inside upsertOne).
  const waits: Promise<void>[] = []
  for (const id of ids) {
    const p = settling.get(id)
    if (p) waits.push(p)
  }
  if (waits.length) await Promise.allSettled(waits)

  const missing = ids.filter((id) => !mirror.has(id))
  if (missing.length) {
    post({ msgId, missing })
    return
  }

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

  for (const id of ids) {
    const obj = mirror.get(id)
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

  const bitmap = canvas.transferToImageBitmap()
  post({ msgId, bitmap }, [bitmap])
}

function post(msg: BakeryResponse, transfer: Transferable[] = []): void {
  ;(self as any).postMessage(msg, transfer)
}

// --- FIFO message pump -------------------------------------------------------
// Handlers are async (enliven awaits, image barriers); chaining keeps the
// upsert-before-bake ordering that the whole consistency model depends on.
let chain: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent<BakeryRequest>) => {
  const msg = e.data
  chain = chain.then(async () => {
    try {
      switch (msg.t) {
        case 'upsert':
          for (const item of msg.items) upsertOne(item.id, item.json)
          break
        case 'remove':
          for (const id of msg.ids) {
            mirror.delete(id)
            settling.delete(id)
          }
          break
        case 'clear':
          mirror.clear()
          settling.clear()
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
