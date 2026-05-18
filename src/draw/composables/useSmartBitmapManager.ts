import { FabricObject } from 'fabric'
import { isMobile } from '@/helper/general.helper'

// ─── GPU Memory Budget ────────────────────────────────────────────────────────
//
// CRITICAL: This is NOT JS heap memory — it's GPU texture memory.
// `createImageBitmap()` produces GPU-backed textures whose total budget is
// roughly the size of the Chrome renderer process's texture cache, NOT
// navigator.deviceMemory.
//
// We can't detect this directly, so we set conservative absolute caps and
// IGNORE navigator.deviceMemory entirely on mobile.

const BITMAP_CACHE_BUDGET_MB    = isMobile() ?  64 : 384      // pushed up another notch. Still safely under Chrome mobile crash points (~150 MB even on Adreno).
const HARD_MEMORY               = BITMAP_CACHE_BUDGET_MB * 1024 * 1024
const SOFT_MEMORY               = HARD_MEMORY * 0.75          // ↑ slightly — more headroom before declining
const PER_ENTRY_CAP             = HARD_MEMORY * 0.08          // ↓ slightly — no single bitmap dominates

// ─── Bake Eligibility ─────────────────────────────────────────────────────────
//
// Lowered threshold: short paths still render fast live, but if we have memory
// budget headroom there's no harm in caching them — and big benefit if they're
// part of a dense visible set during a pan.

const MIN_PATH_LENGTH_TO_CACHE = isMobile() ? 30 : 15

const MOBILE_MAX_DIM  = 1536
const DESKTOP_MAX_DIM = 3072

const BITMAP_PADDING        = 24
const SHARPNESS_MIN_RATIO   = 0.85
const SHARPNESS_MAX_RATIO   = 1.18

// ─── Zoom Bucket ───────────────────────────────────────────────────────────────
function zoomBucket(z: number): number {
  return Math.pow(2, Math.round(Math.log2(Math.max(z, 0.0001))))
}

function bakeScale(zoom: number): number {
  const dpr = window.devicePixelRatio || 1
  return zoom * dpr
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Entry = {
  bitmap: ImageBitmap
  worldBounds: { left: number; top: number; width: number; height: number }
  bytes: number
  bucket: number
  actualScale: number
  lastUsed: number
}

// ─── OffscreenCanvas Pool ──────────────────────────────────────────────────────

class CanvasPool {
  private pool: OffscreenCanvas[] = []
  private readonly maxSize = 4

  acquire(w: number, h: number): OffscreenCanvas {
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[i]
      if (c.width >= w && c.height >= h && c.width * c.height < w * h * 4) {
        this.pool.splice(i, 1)
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
        return c
      }
    }
    return new OffscreenCanvas(w, h)
  }

  release(c: OffscreenCanvas) {
    if (this.pool.length < this.maxSize) {
      const ctx = c.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, c.width, c.height)
      this.pool.push(c)
    }
  }

  clear() {
    this.pool = []
  }
}

// ─── Composable ────────────────────────────────────────────────────────────────

export function useSmartBitmapManager() {
  const cache       = new Map<string, Entry>()
  const boundsCache = new Map<string, { left: number; top: number; width: number; height: number }>()
  let memory = 0

  const MAX_DIM = isMobile() ? MOBILE_MAX_DIM : DESKTOP_MAX_DIM
  const canvasPool = new CanvasPool()

  // FIX: We no longer use a single-flight gate that *blocks* new bakes on old
  // ones. Instead each bake just runs to its own createImageBitmap, and an
  // aborted bake closes its bitmap immediately on resolution. The old gate
  // caused new gestures to wait for stale createImageBitmap calls to finish
  // before any new work could start — exactly the "lag before zoom catches up"
  // symptom we're trying to fix.
  //
  // We still track count of in-flight bakes to provide back-pressure if needed.
  let inFlightCount = 0
  const MAX_CONCURRENT_BAKES = isMobile() ? 1 : 2

  function shouldCache(obj: any): boolean {
    if (!obj?.id) return false
    if (obj.type === 'image' || obj.type === 'i-text' || obj.type === 'textbox') return false
    if (obj.visible === false || obj.opacity === 0) return false
    if (obj?.stroke?.source) return false
    const len = obj.path?.length ?? obj.compressedTrace?.length ?? 0
    return len >= MIN_PATH_LENGTH_TO_CACHE
  }

  function bytes(w: number, h: number) { return w * h * 4 }

  function evict(needed: number): boolean {
    if (memory + needed <= HARD_MEMORY) return true
    const sorted = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [id, e] of sorted) {
      e.bitmap.close()
      memory -= e.bytes
      cache.delete(id)
      boundsCache.delete(id)
      if (memory + needed <= HARD_MEMORY) return true
    }
    return memory + needed <= HARD_MEMORY
  }

  function invalidate(id: string) {
    const e = cache.get(id)
    if (e) { e.bitmap.close(); memory -= e.bytes; cache.delete(id) }
    boundsCache.delete(id)
  }

  function getIfCompatible(id: string, zoom: number): ImageBitmap | null {
    const e = cache.get(id); if (!e) return null
    if (e.bucket !== zoomBucket(zoom)) return null
    e.lastUsed = performance.now(); return e.bitmap
  }

  function getAny(id: string): ImageBitmap | null {
    const e = cache.get(id); if (!e) return null
    e.lastUsed = performance.now(); return e.bitmap
  }

  function getIfFreshEnough(id: string, zoom: number): ImageBitmap | null {
    const e = cache.get(id); if (!e) return null
    const dpr = window.devicePixelRatio || 1
    const requiredScale = zoom * dpr
    const ratio = requiredScale / e.actualScale
    if (ratio < SHARPNESS_MIN_RATIO || ratio > SHARPNESS_MAX_RATIO) return null
    e.lastUsed = performance.now(); return e.bitmap
  }

  function getBounds(obj: FabricObject) {
    const e = cache.get(obj.id); if (e) return e.worldBounds
    let b = boundsCache.get(obj.id)
    if (!b) { b = obj.getBoundingRect(); boundsCache.set(obj.id, b) }
    return b
  }

  // FIX: Tight abort discipline. We check signal.aborted at every async boundary
  // AND immediately before doing the synchronous render. The bitmap from
  // createImageBitmap is always closed if we aborted, even if it resolved
  // after the abort.
  async function bake(obj: FabricObject, zoom: number, signal?: AbortSignal): Promise<boolean> {
    if (!shouldCache(obj)) return false
    if (signal?.aborted) return false

    // Back-pressure: don't pile up bakes. If too many are running we just skip.
    // The caller (`bakeQueue`) will reschedule what's left in a future idle
    // tick, so we don't lose work, but we don't queue up either.
    if (inFlightCount >= MAX_CONCURRENT_BAKES) return false

    const bucket   = zoomBucket(zoom)
    const existing = cache.get(obj.id)
    const desiredScale = bakeScale(zoom)
    if (existing?.bucket === bucket && Math.abs(existing.actualScale - desiredScale) / desiredScale < 0.05) return false

    const b     = obj.getBoundingRect()
    let w = Math.ceil((b.width  + BITMAP_PADDING * 2) * desiredScale)
    let h = Math.ceil((b.height + BITMAP_PADDING * 2) * desiredScale)
    if (w <= 0 || h <= 0) return false

    let actualScale = desiredScale
    if (bytes(w, h) > PER_ENTRY_CAP) {
      const factor = Math.sqrt(PER_ENTRY_CAP / bytes(w, h))
      w = Math.floor(w * factor); h = Math.floor(h * factor)
      actualScale = desiredScale * factor
    }
    if (w > MAX_DIM || h > MAX_DIM) {
      const factor = Math.min(MAX_DIM / w, MAX_DIM / h)
      w = Math.floor(w * factor); h = Math.floor(h * factor)
      actualScale = actualScale * factor
    }

    const needed = bytes(w, h)
    if (memory > SOFT_MEMORY && existing) return false
    if (!evict(needed)) return false

    if (signal?.aborted) return false

    const off = canvasPool.acquire(w, h)
    const ctx = off.getContext('2d')
    if (!ctx) { canvasPool.release(off); return false }

    ctx.scale(actualScale, actualScale)
    ctx.translate(-b.left + BITMAP_PADDING, -b.top + BITMAP_PADDING)

    // Check abort right before the SYNCHRONOUS render — this is the only place
    // we can preempt the heaviest cost.
    if (signal?.aborted) { canvasPool.release(off); return false }

    try {
      obj.render(ctx as any)
    } catch {
      canvasPool.release(off)
      return false
    }

    if (signal?.aborted) { canvasPool.release(off); return false }

    inFlightCount++
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(off, 0, 0, w, h).catch(() => null)
    } finally {
      inFlightCount--
    }

    canvasPool.release(off)

    if (!bitmap) return false

    // Critical: if we were aborted DURING the createImageBitmap, the bitmap
    // resolved AFTER abort. We must close it immediately so it doesn't leak
    // GPU memory.
    if (signal?.aborted) { bitmap.close(); return false }

    invalidate(obj.id)
    cache.set(obj.id, {
      bitmap,
      worldBounds: { left: b.left, top: b.top, width: b.width, height: b.height },
      bytes: needed,
      bucket,
      actualScale,
      lastUsed: performance.now()
    })
    memory += needed
    return true
  }

  function clear() {
    for (const e of cache.values()) e.bitmap.close()
    cache.clear()
    boundsCache.clear()
    canvasPool.clear()
    memory = 0
  }

  function getVitals() {
    return {
      cachedObjects: cache.size,
      memoryMB:    (memory / 1024 / 1024).toFixed(2),
      softLimitMB: (SOFT_MEMORY / 1024 / 1024).toFixed(2),
      hardLimitMB: (HARD_MEMORY / 1024 / 1024).toFixed(2),
      softPressure: ((memory / SOFT_MEMORY) * 100).toFixed(1),
      hardPressure: ((memory / HARD_MEMORY) * 100).toFixed(1)
    }
  }

  return {
    get: getIfCompatible,
    getIfCompatible,
    getAny,
    getIfFreshEnough,
    bake,
    invalidate,
    clear,
    getBounds,
    shouldCache,
    getVitals
  }
}