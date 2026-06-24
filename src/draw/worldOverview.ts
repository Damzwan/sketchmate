// worldOverview.ts
//
// One low-res bitmap of the whole drawing, mapped to the current content
// bounds. It is the far-zoom picture (composited with a single drawImage) AND
// the base layer that fills any not-yet-baked tile so the viewport is never
// blank and never flashes.
//
// It is a deliberately LOW-STAKES approximation, but it is kept CORRECT (not
// just "close") by localized patching:
//   - patchRect(rect): clear that region & redraw it from the index — O(local)
//   - rebuildIfNeeded(): full low-res re-render, only on growth/init — O(N), rare
// Because patchRect redraws from the index, it handles add / remove / move /
// erase / undo uniformly with no drift, so the overview is always safe to use
// as the base layer under not-yet-baked tiles.

import type {
  Bounded,
  SpatialIndex,
  TileRenderer,
  WorldRect,
  Yieldable
} from './committedLayer'
import { Yielder } from '@/draw/helpers/yielding.helper'

interface OverviewOptions {
  px?: number;
  renderChunk?: number;
}

export class WorldOverview<T extends Bounded> {
  private readonly PX: number
  private readonly CHUNK: number
  private readonly index: SpatialIndex<T>
  private readonly renderer: TileRenderer<T>

  private canvas: OffscreenCanvas | null = null
  private ctx: OffscreenCanvasRenderingContext2D | null = null
  private bounds: WorldRect | null = null // world region the bitmap covers
  private sx = 1
  private sy = 1 // world → overview px
  private dirty = true

  constructor(
    index: SpatialIndex<T>,
    renderer: TileRenderer<T>,
    opts: OverviewOptions = {}
  ) {
    this.index = index
    this.renderer = renderer
    this.PX = opts.px ?? 2048
    this.CHUNK = opts.renderChunk ?? 128
  }

  markDirty(): void {
    this.dirty = true
  }

  isDirty(): boolean {
    return this.dirty || !this.canvas
  }

  /** Incrementally fold one freshly-committed object into the overview. */
  add(obj: T): void {
    if (!this.canvas || !this.ctx || !this.bounds) {
      this.dirty = true
      return
    }
    const b = obj.getBoundingRect(true, true)
    const r: WorldRect = { x: b.left, y: b.top, w: b.width, h: b.height }
    // Object outside current coverage → grow lazily via full rebuild.
    if (!this.contains(this.bounds, r)) {
      this.dirty = true
      return
    }
    this.paintOne(this.ctx, obj)
  }

  /** Destination-out the eraser stroke into the overview (approximate). */
  erase(renderEraser: (ctx: OffscreenCanvasRenderingContext2D) => void): void {
    if (!this.ctx || !this.bounds) return
    const ctx = this.ctx
    ctx.save()
    this.applyWorldTransform(ctx)
    ctx.globalCompositeOperation = 'destination-out'
    try {
      renderEraser(ctx)
    } catch {
      /* approximation; ignore */
    }
    ctx.restore()
  }

  /**
   * LOCALIZED rebuild: clear `rect` in the overview and redraw exactly that
   * region from the index. This keeps the overview a correct function of
   * current content (handles add / remove / move / erase / undo uniformly)
   * WITHOUT an O(N) full redraw — cost is O(objects intersecting rect).
   *
   * Returns false if the overview isn't built yet, or `rect` isn't fully
   * inside coverage (content grew) — caller should rebuild/grow in that case.
   */
  patchRect(rect: WorldRect): boolean {
    if (!this.canvas || !this.ctx || !this.bounds) return false
    if (!this.contains(this.bounds, rect)) return false
    const ctx = this.ctx

    // Pad by ~2 overview-px (in world units) so stroke width / AA at the
    // region edges is fully cleared and redrawn — no half-erased seams.
    const mx = 2 / this.sx,
      my = 2 / this.sy
    const r: WorldRect = {
      x: rect.x - mx,
      y: rect.y - my,
      w: rect.w + 2 * mx,
      h: rect.h + 2 * my
    }

    // Clear the sub-rect (identity space).
    const cx = (r.x - this.bounds.x) * this.sx
    const cy = (r.y - this.bounds.y) * this.sy
    const cw = r.w * this.sx,
      ch = r.h * this.sy
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(cx, cy, cw, ch)
    ctx.restore()

    // Redraw objects intersecting r, clipped to r (z-ordered by the index).
    const objects = this.index.query(r)
    ctx.save()
    this.applyWorldTransform(ctx)
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    for (let i = 0; i < objects.length; i++) {
      try {
        this.renderer(ctx as any, objects[i], Math.max(this.sx, this.sy))
      } catch {
        /* ignore */
      }
    }
    ctx.restore()
    return true
  }

  /** Full low-res rebuild, only if dirty or coverage no longer fits content. */
  /** Full low-res rebuild, only if dirty or coverage no longer fits content. */
  async rebuildIfNeeded(
    contentBounds: WorldRect | null,
    yielder: Yielder,
    signal: AbortSignal
  ): Promise<void> {
    if (!contentBounds || contentBounds.w <= 0 || contentBounds.h <= 0) return
    const fits = this.canvas && this.bounds && this.contains(this.bounds, contentBounds)
    if (!this.dirty && fits) return


    const pad = 0.15
    const bounds: WorldRect = {
      x: contentBounds.x - contentBounds.w * pad,
      y: contentBounds.y - contentBounds.h * pad,
      w: contentBounds.w * (1 + 2 * pad),
      h: contentBounds.h * (1 + 2 * pad)
    }

    // Build into a TEMP canvas. The currently-displayed overview stays untouched
    // until we swap atomically at the end — never cleared mid-repaint.
    const tmp = new OffscreenCanvas(this.PX, this.PX)
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    const sx = this.PX / bounds.w
    const sy = this.PX / bounds.h

    tctx.setTransform(1, 0, 0, 1, 0, 0)
    tctx.clearRect(0, 0, this.PX, this.PX)
    tctx.save()
    tctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy)

    const objects = this.index.query(bounds)
    yielder.reset()
    const minPx = 0.75
    for (let i = 0; i < objects.length; i++) {
      const b = objects[i].getBoundingRect(true, true)
      if (b.width * sx >= minPx || b.height * sy >= minPx) {
        try {
          this.renderer(tctx as any, objects[i], Math.max(sx, sy))
        } catch { /* ignore */
        }
      }
      await yielder.maybeYield()
      if (signal.aborted) {
        tctx.restore()
        return
      } // discard temp, keep old overview visible
    }
    tctx.restore()

    // Atomic swap.
    this.canvas = tmp
    this.ctx = tctx
    this.bounds = bounds
    this.sx = sx
    this.sy = sy
    this.dirty = false
  }

  /** Draw the overview region matching the viewport into ctx (screen space). */
  composite(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    vpt: number[],
    px: { w: number; h: number },
    dpr: number,
    vw: WorldRect
  ): void {
    if (!this.canvas || !this.bounds) return
    const inter = this.intersect(vw, this.bounds)
    if (!inter) return

    // source rect in overview px
    const srcX = (inter.x - this.bounds.x) * this.sx
    const srcY = (inter.y - this.bounds.y) * this.sy
    const srcW = inter.w * this.sx
    const srcH = inter.h * this.sy
    // dest rect in device px via vpt
    const a = vpt[0] * dpr,
      d = vpt[3] * dpr,
      e = vpt[4] * dpr,
      f = vpt[5] * dpr
    const dx = inter.x * a + e,
      dy = inter.y * d + f
    const dw = inter.w * a,
      dh = inter.h * d
    if (srcW <= 0 || srcH <= 0 || dw <= 0 || dh <= 0) return

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    // @ts-ignore
    ctx.imageSmoothingQuality = 'medium'
    ctx.drawImage(this.canvas, srcX, srcY, srcW, srcH, dx, dy, dw, dh)
    ctx.restore()
  }

  reset(): void {
    this.canvas = null
    this.ctx = null
    this.bounds = null
    this.dirty = true
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private applyWorldTransform(ctx: OffscreenCanvasRenderingContext2D) {
    if (!this.bounds) return
    ctx.setTransform(
      this.sx,
      0,
      0,
      this.sy,
      -this.bounds.x * this.sx,
      -this.bounds.y * this.sy
    )
  }

  private paintOne(ctx: OffscreenCanvasRenderingContext2D, obj: T) {
    ctx.save()
    this.applyWorldTransform(ctx)
    try {
      this.renderer(ctx as any, obj, Math.max(this.sx, this.sy))
    } catch {
      /* ignore */
    }
    ctx.restore()
  }

  private contains(o: WorldRect, i: WorldRect): boolean {
    return (
      i.x >= o.x &&
      i.y >= o.y &&
      i.x + i.w <= o.x + o.w &&
      i.y + i.h <= o.y + o.h
    )
  }

  private intersect(a: WorldRect, b: WorldRect): WorldRect | null {
    const x1 = Math.max(a.x, b.x),
      y1 = Math.max(a.y, b.y)
    const x2 = Math.min(a.x + a.w, b.x + b.w),
      y2 = Math.min(a.y + a.h, b.y + b.h)
    if (x2 <= x1 || y2 <= y1) return null
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }
}
