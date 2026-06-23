// committedLayer.ts
//
// Cached tiles that are a PURE FUNCTION of (objects in a region, generation).
// Tiles are NEVER mutated in place — only rebuilt wholesale from the index.
//
// Display rules:
//   • A present tile (fresh OR stale-exact, i.e. has a bitmap) is drawn — this
//     keeps DRAW / restyle sharp (no blur) while its rebuild is pending.
//   • A MISSING cell (dropped destructively, or never baked at this tier)
//     borrows the NEAREST FRESH tier in EITHER direction, scaled:
//        - coarser  → one tile covers the cell (sub-rect sample)
//        - finer    → several tiles cover the cell (draw each)
//     This is what kills the zoom flash in BOTH directions.
//   • The world overview is the last-resort base, drawn only when a cell has
//     no tile source at any tier.

import { WorldOverview } from './worldOverview'

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounded {
  id: string;

  getBoundingRect(
    absolute?: boolean,
    calculate?: boolean
  ): { left: number; top: number; width: number; height: number };
}

export interface SpatialIndex<T extends Bounded> {
  query(rect: WorldRect): T[];
}

export type TileRenderer<T extends Bounded> = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  obj: T,
  tierScale: number
) => void;

export interface Yieldable {
  reset(): void;

  shouldYield(): boolean;

  yield(): Promise<void>;
}

interface Tile {
  bitmap: ImageBitmap | null; // null = baked-empty (no content in region)
  tier: number;
  tx: number;
  ty: number;
  bytes: number;
  builtGen: number;
  lastUsed: number;
}

export interface CommittedOptions {
  tileSize?: number;
  overscanPx?: number;
  zoomTiers?: number[];
  memoryBudgetMB?: number;
  maxRenderScale?: number;
  overviewTier?: number;
  overviewPx?: number;
  renderChunk?: number;
  /** How many tiers out we search for a sharp fallback before using overview. */
  fallbackDepth?: number;
  debug?: boolean;
}

interface Draw {
  bmp: ImageBitmap;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export class CommittedLayer<T extends Bounded> {
  private readonly TILE: number
  private readonly OS: number
  private readonly BMP: number
  public readonly ZOOM_TIERS: number[]
  private readonly MEM_HARD: number
  private readonly OVERVIEW_TIER: number
  private readonly CHUNK: number
  private readonly FALLBACK_DEPTH: number
  private readonly debug: boolean
  private readonly renderScale: number

  private readonly index: SpatialIndex<T>
  private readonly renderer: TileRenderer<T>
  public readonly overview: WorldOverview<T>

  private tiles = new Map<string, Tile>()
  private gen = new Map<string, number>()
  private memoryBytes = 0
  private pool: OffscreenCanvas[] = []
  private readonly POOL_MAX = 4

  constructor(
    index: SpatialIndex<T>,
    renderer: TileRenderer<T>,
    opts: CommittedOptions = {}
  ) {
    this.index = index
    this.renderer = renderer
    this.TILE = opts.tileSize ?? 512
    this.OS = Math.max(0, opts.overscanPx ?? 2)
    this.BMP = this.TILE + 2 * this.OS
    this.ZOOM_TIERS = opts.zoomTiers ??
      [0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32]
    this.MEM_HARD = (opts.memoryBudgetMB ?? 256) * 1024 * 1024
    this.OVERVIEW_TIER = opts.overviewTier ?? 2
    this.CHUNK = opts.renderChunk ?? 64
    this.FALLBACK_DEPTH = opts.fallbackDepth ?? 3
    this.debug = opts.debug ?? false
    const maxRS = opts.maxRenderScale ?? 2
    this.renderScale = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      maxRS
    )
    this.overview = new WorldOverview<T>(index, renderer, {
      px: opts.overviewPx ?? 2048
    })
  }

  get overviewTier(): number {
    return this.OVERVIEW_TIER
  }

  queryIndex(rect: WorldRect): T[] { return this.index.query(rect); }

  // ── geometry ────────────────────────────────────────────────────────────
  pickActiveTier(zoom: number): number {
    const eff = zoom * this.renderScale
    const TOL = 1.15
    for (let i = 0; i < this.ZOOM_TIERS.length; i++)
      if (this.ZOOM_TIERS[i] * TOL >= eff) return i
    return this.ZOOM_TIERS.length - 1
  }

  private tileRange(r: WorldRect, tier: number) {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    return {
      tx0: Math.floor(r.x / tws), ty0: Math.floor(r.y / tws),
      tx1: Math.floor((r.x + r.w) / tws), ty1: Math.floor((r.y + r.h) / tws)
    }
  }

  private tileToWorld(tier: number, tx: number, ty: number): WorldRect {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    return { x: tx * tws, y: ty * tws, w: tws, h: tws }
  }

  private isFresh(key: string, t: Tile): boolean {
    return t.builtGen === (this.gen.get(key) ?? 0)
  }

  viewWorld(vpt: number[], px: { w: number; h: number }, dpr: number): WorldRect {
    const z = vpt[0]
    return {
      x: -vpt[4] / z, y: -vpt[5] / z,
      w: px.w / (z * dpr), h: px.h / (z * dpr)
    }
  }

  // ── invalidation ──────────────────────────────────────────────────────────
  /** Mark a region dirty at every tier (additive change: keeps stale-exact). */
  markDirty(rect: WorldRect): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      const r = this.tileRange(rect, tier)
      for (let ty = r.ty0; ty <= r.ty1; ty++)
        for (let tx = r.tx0; tx <= r.tx1; tx++) {
          const k = `${tier}:${tx}:${ty}`
          if (this.tiles.has(k)) this.gen.set(k, (this.gen.get(k) ?? 0) + 1)
        }
    }
  }

  markAllDirty(): void {
    for (const [k] of this.tiles) this.gen.set(k, (this.gen.get(k) ?? 0) + 1)
    this.overview.markDirty()
  }

  /** Destructive: remove tiles covering rect at ONE tier (composite falls back). */
  dropTiles(rect: WorldRect, tier: number): void {
    const r = this.tileRange(rect, tier)
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const k = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(k)
        if (t) {
          if (t.bitmap) t.bitmap.close()
          this.memoryBytes -= t.bytes
          this.tiles.delete(k)
        }
      }
  }

  /**
   * Destructive at EVERY tier — the moved/removed object can no longer ghost at
   * any zoom. Dropped cells fall back to a FRESH neighbour tier or the overview,
   * never a stale-exact copy of the old pixels.
   */
  dropAllTiers(rect: WorldRect): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) this.dropTiles(rect, tier)
  }

  // ── compositing ───────────────────────────────────────────────────────────
  composite(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    vpt: number[], px: { w: number; h: number }, dpr: number,
    bg?: string
  ): { needsBake: boolean } {
    const zoom = vpt[0]
    const tier = this.pickActiveTier(zoom)
    const vw = this.viewWorld(vpt, px, dpr)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, px.w, px.h)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, px.w, px.h)
    }
    ctx.restore()

    // FAR ZOOM → overview only. O(1).
    if (tier <= this.OVERVIEW_TIER) {
      this.overview.composite(ctx, vpt, px, dpr, vw)
      return { needsBake: this.overview.isDirty() }
    }

    const range = this.tileRange(vw, tier)
    const a = vpt[0] * dpr, d = vpt[3] * dpr, e = vpt[4] * dpr, f = vpt[5] * dpr
    const tws = this.TILE / this.ZOOM_TIERS[tier]

    // Pass 1: classify cells → present (draw on top) vs uncovered (need fallback).
    const present: Draw[] = []
    const uncovered: { tx: number; ty: number; dx: number; dy: number; dw: number; dh: number }[] = []
    let anyNonFresh = false

    for (let ty = range.ty0; ty <= range.ty1; ty++) {
      for (let tx = range.tx0; tx <= range.tx1; tx++) {
        const dx0 = Math.floor(tx * tws * a + e)
        const dy0 = Math.floor(ty * tws * d + f)
        const dx1 = Math.floor((tx + 1) * tws * a + e)
        const dy1 = Math.floor((ty + 1) * tws * d + f)
        const dw = dx1 - dx0, dh = dy1 - dy0

        const key = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(key)
        const fresh = t ? this.isFresh(key, t) : false
        if (t) t.lastUsed = performance.now()
        if (!t || !fresh) anyNonFresh = true

        if (t && t.bitmap) {
          // fresh OR stale-exact → sharp, draw on top.
          present.push({
            bmp: t.bitmap,
            sx: this.OS,
            sy: this.OS,
            sw: this.TILE,
            sh: this.TILE,
            dx: dx0,
            dy: dy0,
            dw,
            dh
          })
          continue
        }
        if (t && fresh && !t.bitmap) if (t && fresh && !t.bitmap) continue // fresh-empty → genuinely empty

        // Missing (or stale-empty) → need a fallback source for this cell.
        uncovered.push({ tx, ty, dx: dx0, dy: dy0, dw, dh })
      }
    }

    // Pass 2: resolve fallbacks for uncovered cells (bidirectional tier search).
    // We draw the overview ONCE underneath if ANY cell can't be covered, then
    // layer the sharp neighbour-tier draws on top.
    const fallback: Draw[] = []
    let anyUncovered = false
    for (const cell of uncovered) {
      const fbs = this.findBestSource(tier, cell.tx, cell.ty, cell.dx, cell.dy, cell.dw, cell.dh)
      if (fbs.length) fallback.push(...fbs)
      else anyUncovered = true
    }

    // Draw order: overview base → neighbour-tier fallbacks → present tiles.
    if (anyUncovered) this.overview.composite(ctx, vpt, px, dpr, vw)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    // @ts-ignore
    ctx.imageSmoothingQuality = 'low'
    for (const dr of fallback)
      ctx.drawImage(dr.bmp, dr.sx, dr.sy, dr.sw, dr.sh, dr.dx, dr.dy, dr.dw, dr.dh)
    for (const dr of present)
      ctx.drawImage(dr.bmp, dr.sx, dr.sy, dr.sw, dr.sh, dr.dx, dr.dy, dr.dw, dr.dh)
    ctx.restore()

    return { needsBake: anyNonFresh }
  }

  /**
   * Find the BEST fresh source for an active-tier cell, searching BOTH ways:
   *   - coarser tiers (tier-1 … ): ONE tile covers the cell → sub-rect sample.
   *   - finer tiers   (tier+1 … ): several tiles cover the cell → draw each.
   * Nearest tier wins (least scaling artefact). Returns [] → overview.
   *
   * This is the fix for the zoom flash: zooming OUT now borrows the finer tier
   * you came from (scaled down) instead of the blurry overview, and zooming IN
   * borrows the coarser tier (scaled up).
   */
  private findBestSource(
    tier: number, tx: number, ty: number,
    dx: number, dy: number, dw: number, dh: number
  ): Draw[] {
    const maxOut = Math.min(this.FALLBACK_DEPTH, this.ZOOM_TIERS.length)
    for (let step = 1; step <= maxOut; step++) {
      // Prefer coarser first (cheaper: single tile), then finer.
      const coarser = tier - step
      if (coarser > this.OVERVIEW_TIER) {
        const c = this.coarserDraw(tier, tx, ty, coarser, dx, dy, dw, dh)
        if (c) return [c]
      }
      const finer = tier + step
      if (finer < this.ZOOM_TIERS.length) {
        const fs = this.finerDraws(tier, tx, ty, finer, dx, dy, dw, dh)
        if (fs.length) return fs
      }
    }
    return []
  }

  /** Sample a single coarser fresh tile that covers the cell. */
  private coarserDraw(
    tier: number, tx: number, ty: number, ct: number,
    dx: number, dy: number, dw: number, dh: number
  ): Draw | null {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    const cwx = tx * tws, cwy = ty * tws, cww = tws
    const ctws = this.TILE / this.ZOOM_TIERS[ct]
    const ctxi = Math.floor(cwx / ctws)
    const ctyi = Math.floor(cwy / ctws)
    const key = `${ct}:${ctxi}:${ctyi}`
    const t = this.tiles.get(key)
    if (!t || !t.bitmap || !this.isFresh(key, t)) return null
    const fx = (cwx - ctxi * ctws) / ctws
    const fy = (cwy - ctyi * ctws) / ctws
    const fw = cww / ctws
    t.lastUsed = performance.now()
    return {
      bmp: t.bitmap,
      sx: this.OS + fx * this.TILE,
      sy: this.OS + fy * this.TILE,
      sw: fw * this.TILE,
      sh: fw * this.TILE,
      dx, dy, dw, dh
    }
  }

  /**
   * Cover the cell from a FINER tier: many fine tiles map into one coarse cell.
   * Only used if EVERY fine cell intersecting the cell is fresh-with-bitmap (we
   * don't want a half-covered patch — that reintroduces flashing). We sub-divide
   * the destination rect proportionally.
   */
  private finerDraws(
    tier: number, tx: number, ty: number, ft: number,
    dx: number, dy: number, dw: number, dh: number
  ): Draw[] {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    const cellWorld: WorldRect = { x: tx * tws, y: ty * tws, w: tws, h: tws }
    const fr = this.tileRange(cellWorld, ft)
    const ftws = this.TILE / this.ZOOM_TIERS[ft]

    // Gate: every covering fine tile must be fresh-with-bitmap OR fresh-empty.
    // (fresh-empty contributes nothing but is "covered" — fine.) Any missing /
    // stale fine tile → bail (partial cover would flash).
    const draws: Draw[] = []
    const dpw = dw / tws  // device px per world unit (x)
    const dph = dh / tws  // device px per world unit (y)
    for (let fty = fr.ty0; fty <= fr.ty1; fty++) {
      for (let ftx = fr.tx0; ftx <= fr.tx1; ftx++) {
        const k = `${ft}:${ftx}:${fty}`
        const t = this.tiles.get(k)
        if (!t || !this.isFresh(k, t)) return [] // not fully covered → bail
        if (!t.bitmap) continue                  // fresh-empty patch of this cell

        // Intersection of this fine tile with the coarse cell, in world space.
        const fwx = ftx * ftws, fwy = fty * ftws
        const ix0 = Math.max(fwx, cellWorld.x)
        const iy0 = Math.max(fwy, cellWorld.y)
        const ix1 = Math.min(fwx + ftws, cellWorld.x + cellWorld.w)
        const iy1 = Math.min(fwy + ftws, cellWorld.y + cellWorld.h)
        if (ix1 <= ix0 || iy1 <= iy0) continue

        // Source sub-rect inside the fine tile's content area (px).
        const fineScale = this.TILE / ftws // px per world unit in fine tile
        const sx = this.OS + (ix0 - fwx) * fineScale
        const sy = this.OS + (iy0 - fwy) * fineScale
        const sw = (ix1 - ix0) * fineScale
        const sh = (iy1 - iy0) * fineScale

        // Dest sub-rect inside the coarse cell on screen (px).
        const ddx = dx + (ix0 - cellWorld.x) * dpw
        const ddy = dy + (iy0 - cellWorld.y) * dph
        const ddw = (ix1 - ix0) * dpw
        const ddh = (iy1 - iy0) * dph

        t.lastUsed = performance.now()
        draws.push({ bmp: t.bitmap, sx, sy, sw, sh, dx: ddx, dy: ddy, dw: ddw, dh: ddh })
      }
    }
    return draws
  }

  // ── baking ──────────────────────────────────────────────────────────────
  async bake(
    vpt: number[], px: { w: number; h: number }, dpr: number,
    yielder: Yieldable, signal: AbortSignal,
    contentBounds: WorldRect | null
  ): Promise<void> {
    const zoom = vpt[0]
    const tier = this.pickActiveTier(zoom)
    const vw = this.viewWorld(vpt, px, dpr)

    if (tier <= this.OVERVIEW_TIER) {
      await this.overview.rebuildIfNeeded(contentBounds, yielder, signal)
      return
    }

    const tws = this.TILE / this.ZOOM_TIERS[tier]
    const padded: WorldRect = { x: vw.x - tws, y: vw.y - tws, w: vw.w + 2 * tws, h: vw.h + 2 * tws }
    const range = this.tileRange(padded, tier)
    const cx = (range.tx0 + range.tx1) / 2, cy = (range.ty0 + range.ty1) / 2

    const todo: { tx: number; ty: number; pri: number }[] = []
    for (let ty = range.ty0; ty <= range.ty1; ty++)
      for (let tx = range.tx0; tx <= range.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(key)
        if (t && this.isFresh(key, t)) continue
        todo.push({ tx, ty, pri: (tx - cx) ** 2 + (ty - cy) ** 2 })
      }
    todo.sort((p, q) => p.pri - q.pri)

    yielder.reset()
    for (const { tx, ty } of todo) {
      if (signal.aborted) return
      await this.rebuildTile(tier, tx, ty, yielder, signal)
      if (yielder.shouldYield()) await yielder.yield()
    }
  }

  private async rebuildTile(
    tier: number, tx: number, ty: number,
    yielder: Yieldable, signal: AbortSignal
  ): Promise<void> {
    const scale = this.ZOOM_TIERS[tier]
    const world = this.tileToWorld(tier, tx, ty)
    const pad = this.OS / scale + 4 / scale
    const q: WorldRect = { x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }
    const objects = this.index.query(q)
    const key = `${tier}:${tx}:${ty}`
    const builtGen = this.gen.get(key) ?? 0

    if (objects.length === 0) {
      this.store(key, tier, tx, ty, null, 4, builtGen)
      return
    }

    const off = this.acquire()
    const c2d = off.getContext('2d')
    if (!c2d) {
      this.release(off)
      return
    }
    c2d.setTransform(1, 0, 0, 1, 0, 0)
    c2d.clearRect(0, 0, this.BMP, this.BMP)
    c2d.save()
    c2d.translate(this.OS, this.OS)
    c2d.scale(scale, scale)
    c2d.translate(-world.x, -world.y)
    c2d.beginPath()
    c2d.rect(q.x, q.y, q.w, q.h)
    c2d.clip()
    for (let i = 0; i < objects.length; i++) {
      try {
        this.renderer(c2d as any, objects[i], scale)
      } catch (err) {
        if (this.debug) console.warn('[Committed] render threw', err)
      }
      if (i % this.CHUNK === this.CHUNK - 1 && yielder.shouldYield()) {
        await yielder.yield()
        if (signal.aborted) {
          c2d.restore()
          this.release(off)
          return
        }
      }
    }
    c2d.restore()

    let bmp: ImageBitmap
    try {
      bmp = await createImageBitmap(off)
    } catch {
      this.release(off)
      return
    }
    this.release(off)
    if (signal.aborted) {
      bmp.close()
      return
    }

    // Generation may have advanced WHILE we baked (a new edit landed). Don't
    // store a stale bitmap under the new gen — drop it; the follow-up bake
    // (bakeAgain) will produce the correct one. This prevents a 1-frame ghost.
    if ((this.gen.get(key) ?? 0) !== builtGen) {
      bmp.close()
      return
    }

    const bytes = this.BMP * this.BMP * 4
    if (!this.ensureMemory(bytes)) {
      bmp.close()
      return
    }
    this.store(key, tier, tx, ty, bmp, bytes, builtGen)
  }

  private store(key: string, tier: number, tx: number, ty: number, bitmap: ImageBitmap | null, bytes: number, builtGen: number) {
    const prev = this.tiles.get(key)
    if (prev) {
      if (prev.bitmap) prev.bitmap.close()
      this.memoryBytes -= prev.bytes
    }
    this.tiles.set(key, { bitmap, tier, tx, ty, bytes, builtGen, lastUsed: performance.now() })
    this.memoryBytes += bytes
  }

  isRegionReady(rect: WorldRect, zoom: number): boolean {
    const tier = this.pickActiveTier(zoom)
    if (tier <= this.OVERVIEW_TIER) return true
    const r = this.tileRange(rect, tier)
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(key)
        if (!t || !this.isFresh(key, t)) return false
      }
    return true
  }

  // ── memory + pool ──────────────────────────────────────────────────────────
  private ensureMemory(need: number): boolean {
    if (this.memoryBytes + need <= this.MEM_HARD) return true
    const sorted = [...this.tiles.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [k, t] of sorted) {
      if (t.bitmap) t.bitmap.close()
      this.memoryBytes -= t.bytes
      this.tiles.delete(k)
      if (this.memoryBytes + need <= this.MEM_HARD) return true
    }
    return false
  }

  private acquire(): OffscreenCanvas {
    return this.pool.pop() ?? new OffscreenCanvas(this.BMP, this.BMP)
  }

  private release(c: OffscreenCanvas): void {
    if (this.pool.length < this.POOL_MAX) this.pool.push(c)
  }

  reset(): void {
    for (const t of this.tiles.values()) if (t.bitmap) t.bitmap.close()
    this.tiles.clear()
    this.gen.clear()
    this.memoryBytes = 0
    this.overview.reset()
  }
}