// committedLayer.ts
//
// Cached tiles that are a PURE FUNCTION of (objects in a region, generation).
// Tiles are NEVER mutated in place — only rebuilt wholesale from the index.
//
// Low-end changes vs. previous:
//   • async bake uses transferToImageBitmap (zero-copy) like the sync path,
//     killing a ~1MB memcpy per baked tile during heavy panning.
//   • composite() takes an optional fallbackDepth (1 while gesturing) so the
//     bidirectional tier search can't walk FALLBACK_DEPTH tiers per cell on a
//     fast pan.
//   • Honest memory accounting: fixed costs (overview, pool) are subtracted
//     from the memory budget so the device limit is actually respected.
//   • Aggressive garbage collection: idle pool canvases are shrunk to 0x0
//     and untouched empty tiles are pruned to prevent map bloat.

import { WorldOverview } from './worldOverview'
import { recordComposite, recordPhase } from '@/draw/services/drawMetrics.service'

/** Hybrid overlay is synchronous. Above these small bounds, the caller falls
 * back to the normal local bake, whose object loop yields to input. */
const MAX_SYNC_OVERLAY_OBJECTS = 8
const MAX_SYNC_OVERLAY_CHILDREN = 32

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number
}

export interface Bounded {
  id: string;

  getBoundingRect(absolute?: boolean, calculate?: boolean):
    { left: number; top: number; width: number; height: number };
}

export interface SpatialIndex<T extends Bounded> {
  query(rect: WorldRect): T[]

  /**
   * Same z-ordered result as `query`, but paired with the bounds the index
   * already holds for each object.
   *
   * Callers that only need to SIZE-FILTER a large result (the overview's
   * "is this big enough to leave a mark" pass) would otherwise call
   * `getBoundingRect(true, true)` per object, which RECOMPUTES coords the index
   * has already tracked — an O(all objects) main-thread block on a big board.
   * Optional: implementations without it fall back to the slow path. The rects
   * may be the index's LIVE entry bounds — treat them as read-only.
   */
  queryBounds?(rect: WorldRect): { obj: T; bounds: WorldRect }[]
}

export type TileRenderer<T extends Bounded> = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  obj: T, tierScale: number,
  /** World rect being rasterized. Lets the renderer cull a GROUP's children:
   *  a merged Group is ONE index entry with the union bbox, so without this
   *  every tile it overlaps re-renders all of its children. */
  clipRect?: WorldRect
) => void;

export interface Yieldable {
  reset(): void;

  shouldYield(): boolean;

  yield(): Promise<void>;
}

interface Tile {
  bitmap: ImageBitmap | null;
  tier: number;
  tx: number;
  ty: number;
  bytes: number;
  builtGen: number;
  lastUsed: number;
  /**
   * Are these pixels safe to put on screen RIGHT NOW?
   *
   * Deliberately a different question from freshness (`builtGen === gen`):
   *   • fresh          → no re-bake needed
   *   • usable         → what is in the bitmap matches what the user should see
   *
   * An INVALIDATION makes a tile `!fresh && !usable` — content changed, so the
   * old pixels would resurrect moved/removed objects.
   * A STAMP (drag commit) makes it `!fresh && usable` — the pixels are exactly
   * what the GPU drag layer already showed; only the z-exactness needs a bake.
   *
   * Collapsing these two into one flag is what made every drag commit fall back
   * to the whole-board overview: blurry, shifted, and only correct again once
   * the async bake landed. Keep them separate.
   */
  usable: boolean;
}

/**
 * Result of a hybrid worker bake. `bitmap` holds every object the worker could
 * render; `skipped` holds objects it could NOT (an image, a group, text with an
 * unloaded face) that the caller must overlay on top on the main thread.
 *
 * INVARIANT the baker guarantees: every object in `skipped` sits z-ABOVE every
 * object baked into `bitmap`. That is what makes "draw bitmap, then draw skipped
 * over it" pixel-correct. If the real z-order interleaves them, the baker
 * returns null instead (→ full local bake), never a wrong `skipped`.
 */
export interface RemoteBakeResult<T> {
  bitmap: ImageBitmap;
  skipped: T[];
}

/**
 * Off-main-thread tile renderer (tileBakery worker). Receives the z-sorted
 * objects covering one tile plus the exact tile geometry; resolves with the
 * rendered bitmap (+ any objects to overlay locally), or null → caller falls
 * back to the full local renderer.
 */
export type RemoteBaker<T> = (
  objects: T[], world: WorldRect, scale: number, overscan: number, size: number
) => Promise<RemoteBakeResult<T> | null>;

/**
 * Off-main-thread whole-board overview render. Gets the z-ordered objects
 * covering `bounds`; resolves with the rendered bitmap plus the objects it
 * could NOT render (text / images) for the caller to overlay locally. Null →
 * caller renders the overview locally.
 */
export type RemoteOverview<T> = (
  objects: T[], bounds: WorldRect, px: number, scale: number
) => Promise<{ bitmap: ImageBitmap; skipped: T[] } | null>;

export interface CommittedOptions {
  poolMax?: number
  tileSize?: number;
  overscanPx?: number;
  zoomTiers?: number[];
  memoryBudgetMB?: number;
  maxRenderScale?: number;
  overviewTier?: number;
  overviewPx?: number;
  renderChunk?: number;
  fallbackDepth?: number;
  debug?: boolean;
  /** Optional worker-side tile renderer; async bakes try it first. */
  remoteBaker?: RemoteBaker<any>;
  /** Optional worker-side overview renderer; full rebuilds try it first. */
  remoteOverview?: RemoteOverview<any>;
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
  /** Device-px sub-rect of the destination this source is NOT trusted for (the
   *  region an edit changed after it was baked). Zero-size = trust it all. */
  hx: number;
  hy: number;
  hw: number;
  hh: number;
}

interface CompositeCell {
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * A stale tile drawn on top of its own fallback cover, clipped to
 * (cell MINUS the sub-rect that actually changed). `h*` is that hole, in device
 * px, already intersected with the cell and snapped outward.
 */
interface PartialDraw {
  bmp: ImageBitmap;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  hx: number;
  hy: number;
  hw: number;
  hh: number;
}

/** "Trust this source completely" — distinct from a null/absent dirty rect,
 *  which means "no idea what changed, do not trust it at all". */
const NO_HOLE = Symbol('no-hole')

/** Cap on stale overlays per composite. Each is a clip + drawImage; the point is
 *  to keep the untouched 95% of an edited tile sharp, not to rebuild the frame
 *  out of fragments. Beyond this the plain fallback ladder is fine. */
const MAX_PARTIAL_OVERLAYS = 24

/**
 * Is this CSS colour fully opaque, i.e. does filling with it overwrite every
 * pixel? Deliberately CONSERVATIVE — anything unrecognised is treated as
 * possibly-transparent, so the worst case is the old clear+fill behaviour and
 * never a stale-pixel bug. Board backgrounds are a solid hex in practice.
 */
function isOpaqueColor(c: string): boolean {
  const s = c.trim().toLowerCase()
  if (s === 'transparent' || s === 'none') return false
  // #rgb / #rrggbb are opaque; #rgba / #rrggbbaa carry alpha.
  if (s.startsWith('#')) return s.length === 4 || s.length === 7
  if (s.startsWith('rgb(') || s.startsWith('hsl(')) return true
  // rgba()/hsla() are opaque only at alpha exactly 1.
  if (s.startsWith('rgba(') || s.startsWith('hsla(')) {
    const parts = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')).split(/[,/]/)
    if (parts.length < 4) return true // no alpha component given
    return parseFloat(parts[3]) >= 1
  }
  return false // named colours, gradients, anything else: keep the clear
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
  private readonly remoteBaker?: RemoteBaker<T>
  public readonly overview: WorldOverview<T>

  private tiles = new Map<string, Tile>()
  private gen = new Map<string, number>()
  private inFlight = new Set<string>()
  private memoryBytes = 0

  /**
   * WHERE a stale tile is wrong, in world coords. `null` (or a missing entry)
   * means "assume the whole tile" — the conservative pre-existing behaviour, so
   * any invalidation path that doesn't report a rect stays correct.
   *
   * With it, compositing an edited tile keeps every sharp pixel outside the
   * edit and only covers the edit itself from the fallback ladder / overview.
   * Without it, one 40px undo dropped a whole 512px tile to a whole-board
   * approximation — the "everything goes blurry and shifts when I edit" report.
   */
  private dirtyRects = new Map<string, WorldRect | null>()

  // Reusable per-frame composite scratch. Filled count-tracked (slots
  // overwritten in place, not re-allocated) so a steady-state composite frame
  // allocates no tile draw descriptors — was O(visible tiles) object literals
  // + 4 arrays every frame. Never retained past the synchronous composite call.
  private _present: Draw[] = []
  private _uncovered: CompositeCell[] = []
  private _needsOverview: CompositeCell[] = []
  private _fallback: Draw[] = []
  private _partial: PartialDraw[] = []

  private pool: OffscreenCanvas[] = []
  private poolBytes = 0
  private POOL_MAX = 16

  constructor(index: SpatialIndex<T>, renderer: TileRenderer<T>, opts: CommittedOptions = {}) {
    this.index = index
    this.renderer = renderer
    this.TILE = opts.tileSize ?? 512
    this.OS = Math.max(0, opts.overscanPx ?? 2)
    this.BMP = this.TILE + 2 * this.OS
    // Tier ladder. Shifted one step UP from [0.0625 … 16]:
    //   • the old 0.0625 tier put the usable zoom floor at 0.031 (renderScale 2)
    //     — a zoom nobody draws at, rendered from the coarsest data we have, and
    //     the single blurriest thing in the app.
    //   • the added 32 tier lifts the ceiling from 8x to 16x. It BAKES at that
    //     tier, so it is real detail, not an upscale.
    // Count is unchanged (9), so tile memory and the fallback search depth are
    // unchanged. NB `overviewTier` is an INDEX into this array — moving the
    // ladder without moving that index silently doubles the pure-overview zone.
    this.ZOOM_TIERS = opts.zoomTiers ??
      [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32]

    this.POOL_MAX = opts.poolMax ?? 16
    this.remoteBaker = opts.remoteBaker
    // Index into ZOOM_TIERS, so it moved with the ladder (was 2 against
    // [0.0625 … 16]). 1 keeps the same zoom threshold, 0.25.
    this.OVERVIEW_TIER = opts.overviewTier ?? 1
    this.CHUNK = opts.renderChunk ?? 64
    // How many tiers the fallback search may walk away from the active one.
    // 3 was too shallow for the case that hurts most: zoom from 1x to 16x and
    // the nearest tier holding any data is FOUR steps back, so every uncovered
    // cell skipped straight to the whole-board overview — a ~60x upscale. The
    // search is map lookups only (see `searchMsMax`), and a gesture still caps
    // it at 1.
    this.FALLBACK_DEPTH = opts.fallbackDepth ?? 5
    this.debug = opts.debug ?? false

    const maxRS = opts.maxRenderScale ?? 2
    this.renderScale = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, maxRS)

    // Reserve the overview + pool ceiling out of the tile budget so
    // the TOTAL stays under the device limit, not just the tile portion.
    const overviewBytes = (opts.overviewPx ?? 2048) ** 2 * 4
    const poolCeiling = this.POOL_MAX * this.BMP * this.BMP * 4
    this.MEM_HARD = Math.max(
      16 * 1024 * 1024,
      (opts.memoryBudgetMB ?? 256) * 1024 * 1024 - overviewBytes - poolCeiling
    )

    this.overview = new WorldOverview<T>(index, renderer, {
      px: opts.overviewPx ?? 2048,
      remoteOverview: opts.remoteOverview
    })
  }

  get overviewTier(): number {
    return this.OVERVIEW_TIER
  }

  queryIndex(rect: WorldRect): T[] {
    return this.index.query(rect)
  }

  // ── geometry ───────────────────────────────────────────────────────────
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
    return { x: -vpt[4] / z, y: -vpt[5] / z, w: px.w / (z * dpr), h: px.h / (z * dpr) }
  }

  // ── invalidation ─────────────────────────────────────────────────────────
  /**
   * The ONE way to invalidate a tile key. Bumps the generation (→ re-bake),
   * marks the pixels unusable (→ the compositor stops trusting them), and
   * records WHICH sub-region changed so the compositor can still show the rest.
   *
   * `rect === null` means "the whole tile" and is always safe. Anything that
   * bumps a gen without going through here loses the sub-rect and silently
   * degrades to a full-tile blur.
   */
  private invalidateKey(key: string, rect: WorldRect | null): void {
    this.gen.set(key, (this.gen.get(key) ?? 0) + 1)
    const t = this.tiles.get(key)
    if (t) t.usable = false
    if (rect === null) {
      this.dirtyRects.set(key, null)
      return
    }
    const prev = this.dirtyRects.get(key)
    if (prev === null) return // already whole-tile dirty; can't get dirtier
    if (prev === undefined) {
      this.dirtyRects.set(key, { x: rect.x, y: rect.y, w: rect.w, h: rect.h })
      return
    }
    const x = Math.min(prev.x, rect.x)
    const y = Math.min(prev.y, rect.y)
    const x2 = Math.max(prev.x + prev.w, rect.x + rect.w)
    const y2 = Math.max(prev.y + prev.h, rect.y + rect.h)
    prev.x = x
    prev.y = y
    prev.w = x2 - x
    prev.h = y2 - y
  }

  markDirty(rect: WorldRect): void {
    // Walking tile-coordinate ranges is O(rect area / tile²) — a large rect at
    // a fine tier explodes into 100k+ iterations. The tile map itself is
    // memory-budget-bounded, so when the range is bigger than the map, walk
    // the map instead: O(tiles) worst case, no per-cell key allocs.
    const ranges: { tx0: number; ty0: number; tx1: number; ty1: number }[] = []
    let cells = 0
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      const r = this.tileRange(rect, tier)
      ranges.push(r)
      cells += (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)
    }
    if (cells > this.tiles.size) {
      for (const [k, t] of this.tiles) {
        const r = ranges[t.tier]
        if (t.tx >= r.tx0 && t.tx <= r.tx1 && t.ty >= r.ty0 && t.ty <= r.ty1)
          this.invalidateKey(k, rect)
      }
      for (const k of this.inFlight) {
        const parts = k.split(':')
        const tier = parseInt(parts[0], 10)
        const tx = parseInt(parts[1], 10)
        const ty = parseInt(parts[2], 10)
        const r = ranges[tier]
        if (tx >= r.tx0 && tx <= r.tx1 && ty >= r.ty0 && ty <= r.ty1)
          this.invalidateKey(k, rect)
      }
      return
    }
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      const r = ranges[tier]
      for (let ty = r.ty0; ty <= r.ty1; ty++)
        for (let tx = r.tx0; tx <= r.tx1; tx++) {
          const k = `${tier}:${tx}:${ty}`
          if (this.tiles.has(k) || this.inFlight.has(k)) this.invalidateKey(k, rect)
        }
    }
  }

  /**
   * ADDITIVE invalidation: this region needs a re-bake, but the pixels already
   * on screen are not WRONG — they are merely incomplete, and the caller is
   * covering the difference (a live overlay of the new object).
   *
   * Only valid when the new content is strictly on top and strictly additive
   * (source-over, topmost z). Under that condition the stale tile plus the live
   * overlay is pixel-identical to the baked result, so a redo / remote add
   * costs zero visible quality instead of dropping the whole footprint to the
   * overview for a bake round-trip.
   *
   * Deliberately leaves `usable` and the dirty sub-rect alone: nothing about
   * the existing pixels became untrustworthy.
   */
  markStale(rect: WorldRect): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      const r = this.tileRange(rect, tier)
      const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)
      if (cells > this.tiles.size) {
        for (const [k, t] of this.tiles) {
          if (t.tier !== tier) continue
          if (t.tx >= r.tx0 && t.tx <= r.tx1 && t.ty >= r.ty0 && t.ty <= r.ty1)
            this.gen.set(k, (this.gen.get(k) ?? 0) + 1)
        }
        continue
      }
      for (let ty = r.ty0; ty <= r.ty1; ty++)
        for (let tx = r.tx0; tx <= r.tx1; tx++) {
          const k = `${tier}:${tx}:${ty}`
          if (this.tiles.has(k) || this.inFlight.has(k))
            this.gen.set(k, (this.gen.get(k) ?? 0) + 1)
        }
    }
  }

  markAllDirty(): void {
    for (const [k] of this.tiles) this.invalidateKey(k, null)
    this.overview.markDirty()
  }

  dropTiles(rect: WorldRect, tier: number): void {
    const r = this.tileRange(rect, tier)
    // Same area-bound as markDirty: never iterate more cells than tiles exist.
    const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)
    if (cells > this.tiles.size) {
      for (const [k, t] of this.tiles) {
        if (t.tier !== tier) continue
        if (t.tx < r.tx0 || t.tx > r.tx1 || t.ty < r.ty0 || t.ty > r.ty1) continue
        if (t.bitmap) t.bitmap.close()
        this.memoryBytes -= t.bytes
        this.tiles.delete(k)
        this.dirtyRects.delete(k)
      }
      for (const k of this.inFlight) {
        const parts = k.split(':')
        const t_tier = parseInt(parts[0], 10)
        const t_tx = parseInt(parts[1], 10)
        const t_ty = parseInt(parts[2], 10)
        if (t_tier !== tier) continue
        if (t_tx >= r.tx0 && t_tx <= r.tx1 && t_ty >= r.ty0 && t_ty <= r.ty1)
          this.invalidateKey(k, rect)
      }
      return
    }
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const k = `${tier}:${tx}:${ty}`
        if (this.inFlight.has(k)) this.invalidateKey(k, rect)
        const t = this.tiles.get(k)
        if (t) {
          if (t.bitmap) t.bitmap.close()
          this.memoryBytes -= t.bytes
          this.tiles.delete(k)
          this.dirtyRects.delete(k)
        }
      }
  }

  dropAllTiers(rect: WorldRect): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) this.dropTiles(rect, tier)
  }

  /** Invalidate one tier without destroying its ImageBitmaps.
   *
   * Cross-tier edits used to close every affected texture immediately, even
   * though most of those tiers would never be visited again. That created a GPU
   * destroy/recreate storm. A stale tile is already excluded by isFresh() from
   * both normal compositing and fallback search, so retaining it is visually
   * safe; the existing memory budget/LRU reclaims it under pressure. */
  private markTierDirty(rect: WorldRect, tier: number): void {
    const r = this.tileRange(rect, tier)
    const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)
    if (cells > this.tiles.size) {
      for (const [key, tile] of this.tiles) {
        if (tile.tier !== tier) continue
        if (
          tile.tx >= r.tx0 && tile.tx <= r.tx1 &&
          tile.ty >= r.ty0 && tile.ty <= r.ty1
        ) {
          this.invalidateKey(key, rect)
        }
      }
      for (const key of this.inFlight) {
        const [rawTier, rawTx, rawTy] = key.split(':')
        const inFlightTier = parseInt(rawTier, 10)
        const tx = parseInt(rawTx, 10)
        const ty = parseInt(rawTy, 10)
        if (
          inFlightTier === tier &&
          tx >= r.tx0 && tx <= r.tx1 &&
          ty >= r.ty0 && ty <= r.ty1
        ) {
          this.invalidateKey(key, rect)
        }
      }
      return
    }
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        if (this.tiles.has(key) || this.inFlight.has(key)) {
          this.invalidateKey(key, rect)
        }
      }
    }
  }

  dropOtherTiers(rect: WorldRect, keepTier: number): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      if (tier === keepTier) continue
      this.markTierDirty(rect, tier)
    }
  }

  // ── compositing ────────────────────────────────────────────────────────
  composite(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    vpt: number[], px: { w: number; h: number }, dpr: number,
    bg?: string,
    fallbackDepth = 0   // 0 → use FALLBACK_DEPTH; >0 → cap (1 while gesturing)
  ): { needsBake: boolean } {
    const __t0all = performance.now()
    const zoom = vpt[0]
    const tier = this.pickActiveTier(zoom)
    const vw = this.viewWorld(vpt, px, dpr)

    // top instrumentation hook (debug only — dead telemetry off the hot path in prod)
    const __t0 = this.debug ? performance.now() : 0

    const maxDepth = fallbackDepth > 0 ? fallbackDepth : this.FALLBACK_DEPTH

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // clearRect + fillRect is TWO full-surface writes per frame. When the
    // background is opaque the fill already overwrites every pixel, so the clear
    // is pure waste — and this is the single biggest fixed cost of a composite:
    // at MAX_RENDER_SCALE 2 on a phone that is ~1.3Mpx, written twice, on EVERY
    // frame of every pan and zoom. Only clear when there is no opaque fill
    // coming (transparent / unset background), where it is load-bearing.
    if (bg && isOpaqueColor(bg)) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, px.w, px.h)
    } else {
      ctx.clearRect(0, 0, px.w, px.h)
      if (bg) {
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, px.w, px.h)
      }
    }
    ctx.restore()

    if (tier <= this.OVERVIEW_TIER) {
      this.overview.composite(ctx, vpt, px, dpr, vw)
      recordComposite(performance.now() - __t0all, 0, 0, 0)
      return { needsBake: this.overview.isDirty() }
    }

    const range = this.tileRange(vw, tier)
    const a = vpt[0] * dpr, d = vpt[3] * dpr, e = vpt[4] * dpr, f = vpt[5] * dpr
    const tws = this.TILE / this.ZOOM_TIERS[tier]

    // Reuse per-frame scratch (see fields). Counts track fill length; slots are
    // overwritten in place so a steady-state frame allocates no descriptors.
    const present = this._present
    const uncovered = this._uncovered
    const partial = this._partial
    const needsOverview = this._needsOverview
    let presentN = 0, uncoveredN = 0, partialN = 0, needsOverviewN = 0
    let anyNonFresh = false
    // Overview coverage is now an arbitrary rect list, not one entry per cell:
    // it must line up EXACTLY with what no tile source will paint.
    const needsOverviewAt = (i: number): CompositeCell =>
      needsOverview[i] ??
      (needsOverview[i] = { tx: 0, ty: 0, dx: 0, dy: 0, dw: 0, dh: 0 })

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
        if (t) this.touchTile(key, t)
        if (!t || !fresh) anyNonFresh = true

        // A retained bitmap may be stale after an edit. Cross-tier
        // invalidation deliberately keeps those textures alive to avoid a GPU
        // destroy/recreate storm, but they must never reach the compositor.
        // Fallback lookup already checks isFresh(); the active-tier path must
        // enforce the same rule or a zoom started before the rebake briefly
        // resurrects moved objects / pre-fill tile contents.
        //
        // `usable` is the deliberate exception: a STAMPED tile (drag commit)
        // carries the exact pixels the GPU drag layer was showing and only
        // needs a re-bake for z-exactness. Excluding it sent every move commit
        // to the overview — blurry and shifted until the bake landed.
        if (t && t.bitmap && (fresh || t.usable)) {
          const dr = present[presentN] ??
            (present[presentN] = {
              bmp: t.bitmap, sx: 0, sy: 0, sw: 0, sh: 0,
              dx: 0, dy: 0, dw: 0, dh: 0, hx: 0, hy: 0, hw: 0, hh: 0
            })
          dr.bmp = t.bitmap
          dr.sx = this.OS; dr.sy = this.OS; dr.sw = this.TILE; dr.sh = this.TILE
          dr.dx = dx0; dr.dy = dy0; dr.dw = dw; dr.dh = dh
          presentN++
          continue
        }
        if (t && fresh && !t.bitmap) continue // fresh-empty → genuinely empty

        // Recover the SHARP part of this tile before considering any other
        // source. An edit invalidates a tile because some sub-region changed —
        // outside that sub-region the baked pixels are still exactly right, so
        // drawing them back turns "the whole tile went blurry" into "the 40px I
        // edited went blurry".
        //
        // A cell that takes this path takes NO cross-tier fallback: two sources
        // over one cell both carry the same semi-transparent strokes, and
        // painting one over the other composites them twice (0.45 → 0.70) —
        // visible as darker, tile-shaped patches.
        if (t && t.bitmap && partialN < MAX_PARTIAL_OVERLAYS) {
          const dirty = this.dirtyRects.get(key)
          // undefined/null → provenance unknown → assume the whole tile changed.
          if (dirty) {
            // world → device, snapped OUTWARD so no stale pixel survives inside
            // the changed region (a gap here would be a ghost, not a seam).
            const hx0 = Math.max(dx0, Math.floor(dirty.x * a + e))
            const hy0 = Math.max(dy0, Math.floor(dirty.y * d + f))
            const hx1 = Math.min(dx0 + dw, Math.ceil((dirty.x + dirty.w) * a + e))
            const hy1 = Math.min(dy0 + dh, Math.ceil((dirty.y + dirty.h) * d + f))
            const coversAll =
              hx0 <= dx0 && hy0 <= dy0 && hx1 >= dx0 + dw && hy1 >= dy0 + dh
            if (!coversAll) {
              const pd = partial[partialN] ??
                (partial[partialN] = {
                  bmp: t.bitmap, dx: 0, dy: 0, dw: 0, dh: 0,
                  hx: 0, hy: 0, hw: 0, hh: 0
                })
              pd.bmp = t.bitmap
              pd.dx = dx0; pd.dy = dy0; pd.dw = dw; pd.dh = dh
              // An empty/degenerate hole means nothing in this cell changed —
              // clamp to zero area rather than emitting a negative rect.
              pd.hx = hx0; pd.hy = hy0
              pd.hw = Math.max(0, hx1 - hx0); pd.hh = Math.max(0, hy1 - hy0)
              partialN++
              // The overview fills the hole ONLY — never the whole cell, or it
              // would sit under the tile pixels we just kept and double them.
              if (pd.hw > 0 && pd.hh > 0) {
                const ov = needsOverviewAt(needsOverviewN++)
                ov.dx = pd.hx; ov.dy = pd.hy; ov.dw = pd.hw; ov.dh = pd.hh
              }
              continue
            }
          }
        }

        const uc = uncovered[uncoveredN] ??
          (uncovered[uncoveredN] = { tx: 0, ty: 0, dx: 0, dy: 0, dw: 0, dh: 0 })
        uc.tx = tx; uc.ty = ty; uc.dx = dx0; uc.dy = dy0; uc.dw = dw; uc.dh = dh
        uncoveredN++
      }
    }

    const fallback = this._fallback
    fallback.length = 0

    const __tSearch = performance.now()
    for (let i = 0; i < uncoveredN; i++) {
      const cell = uncovered[i]
      const fbs = this.findBestSource(
        tier, cell.tx, cell.ty, cell.dx, cell.dy, cell.dw, cell.dh, maxDepth, a, d, e, f
      )
      if (fbs.length) {
        for (let j = 0; j < fbs.length; j++) {
          const fb = fbs[j]
          fallback.push(fb)
          // Overview goes in the punched-out region of THIS fragment only.
          // Filling the whole cell would put it under the fragment's own pixels
          // and double every semi-transparent stroke in it.
          if (fb.hw > 0 && fb.hh > 0) {
            const ov = needsOverviewAt(needsOverviewN++)
            ov.dx = fb.hx; ov.dy = fb.hy; ov.dw = fb.hw; ov.dh = fb.hh
          }
        }
      } else {
        // No tile data at any tier → the overview owns the whole cell.
        const ov = needsOverviewAt(needsOverviewN++)
        ov.dx = cell.dx; ov.dy = cell.dy; ov.dw = cell.dw; ov.dh = cell.dh
      }
    }
    const searchMs = performance.now() - __tSearch

    // Render the overview background strictly for gaps missing tile data
    if (needsOverviewN > 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.beginPath()
      for (let i = 0; i < needsOverviewN; i++) {
        const cell = needsOverview[i]
        ctx.rect(cell.dx, cell.dy, cell.dw, cell.dh)
      }
      ctx.clip()
      this.overview.composite(ctx, vpt, px, dpr, vw)
      ctx.restore()
    }

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    // @ts-ignore
    ctx.imageSmoothingQuality = 'low'

    // Draw tiles on top safely without stacking transparency. Iterate by fill
    // count — the scratch arrays keep a stale tail from prior frames.
    //
    // Timed separately: the FIRST drawImage of a freshly-baked ImageBitmap also
    // uploads it as a GPU texture, so a bake pass landing dozens of tiles shows
    // up here and nowhere else. That is the difference between "the composite is
    // slow" (fill rate / DPR) and "the switch frame is slow" (upload burst).
    const __tDraw = performance.now()
    for (let i = 0; i < fallback.length; i++) {
      const dr = fallback[i]
      if (dr.hw > 0 && dr.hh > 0) {
        // Stale cross-tier source: trusted everywhere except the region an edit
        // changed. Punch that out (even-odd) and let the overview show through.
        ctx.save()
        ctx.beginPath()
        ctx.rect(dr.dx, dr.dy, dr.dw, dr.dh)
        ctx.rect(dr.hx, dr.hy, dr.hw, dr.hh)
        ctx.clip('evenodd')
        ctx.drawImage(dr.bmp, dr.sx, dr.sy, dr.sw, dr.sh, dr.dx, dr.dy, dr.dw, dr.dh)
        ctx.restore()
        continue
      }
      ctx.drawImage(dr.bmp, dr.sx, dr.sy, dr.sw, dr.sh, dr.dx, dr.dy, dr.dw, dr.dh)
    }
    // Stale-but-partly-correct tiles, on top of their own cover, with the
    // changed sub-rect punched out (even-odd: outer cell minus inner hole).
    // Drawn AFTER the cover so the hole can never expose the background — the
    // cover is already painted underneath the entire cell.
    for (let i = 0; i < partialN; i++) {
      const pd = partial[i]
      ctx.save()
      ctx.beginPath()
      ctx.rect(pd.dx, pd.dy, pd.dw, pd.dh)
      if (pd.hw > 0 && pd.hh > 0) ctx.rect(pd.hx, pd.hy, pd.hw, pd.hh)
      ctx.clip('evenodd')
      ctx.drawImage(
        pd.bmp, this.OS, this.OS, this.TILE, this.TILE,
        pd.dx, pd.dy, pd.dw, pd.dh
      )
      ctx.restore()
    }
    for (let i = 0; i < presentN; i++) {
      const dr = present[i]
      ctx.drawImage(dr.bmp, dr.sx, dr.sy, dr.sw, dr.sh, dr.dx, dr.dy, dr.dw, dr.dh)
    }
    const tileDrawMs = performance.now() - __tDraw
    ctx.restore()
    recordComposite(
      performance.now() - __t0all, tileDrawMs, searchMs,
      presentN + fallback.length + partialN
    )

    // bottom instrumentation hook (debug only)
    if (this.debug) {
      const g = globalThis as any
      const s = (g.__comp ||= { frames: 0, ms: 0, maxMs: 0, cells: 0, missFrames: 0 })
      const dt = performance.now() - __t0
      s.frames++
      s.ms += dt
      s.maxMs = Math.max(s.maxMs, dt)
      s.cells += uncoveredN
      if (needsOverviewN > 0) s.missFrames++
    }

    return { needsBake: anyNonFresh }
  }

  /**
   * Is this tile safe to use as a FALLBACK source, and if so, which part of it
   * is not?
   *
   * `null`  → do not use (missing pixels, or stale with no idea what changed).
   * rect    → use it, but punch this world rect out.
   * `EMPTY` → use all of it.
   *
   * Why stale tiles are allowed here at all: an edit bumps the generation at
   * EVERY tier, so after any edit the whole fallback ladder is stale and every
   * uncovered cell fell through to the overview. That is barely noticeable at
   * 1x — and catastrophic at 16x, where the overview is a whole-board bitmap
   * being upscaled ~60x. A stale coarser tile is at most a few times softer
   * than the active tier, and outside the recorded dirty rect it is exactly
   * correct.
   */
  private fallbackHole(key: string, t: Tile): WorldRect | null | typeof NO_HOLE {
    if (this.isFresh(key, t) || t.usable) return NO_HOLE
    const dr = this.dirtyRects.get(key)
    // undefined → never recorded; null → whole tile. Either way, unusable.
    return dr ?? null
  }

  private findBestSource(
    tier: number, tx: number, ty: number,
    dx: number, dy: number, dw: number, dh: number,
    maxDepth: number, a: number, d: number, e: number, f: number
  ): Draw[] {
    const maxOut = Math.min(maxDepth, this.ZOOM_TIERS.length)
    for (let step = 1; step <= maxOut; step++) {
      const coarser = tier - step
      if (coarser > this.OVERVIEW_TIER) {
        const c = this.coarserDraw(tier, tx, ty, coarser, dx, dy, dw, dh, a, d, e, f)
        if (c) return [c]
      }
      const finer = tier + step
      if (finer < this.ZOOM_TIERS.length) {
        const fs = this.finerDraws(tier, tx, ty, finer, dx, dy, dw, dh, a, d, e, f)
        if (fs.length) return fs
      }
    }
    return []
  }

  /** World hole → device px, clamped to the destination rect and snapped
   *  outward. Writes into `out`; leaves a zero-size hole when nothing of it
   *  lands inside the destination. */
  private holeToDevice(
    hole: WorldRect, out: Draw,
    dx: number, dy: number, dw: number, dh: number,
    a: number, d: number, e: number, f: number
  ): void {
    const x0 = Math.max(dx, Math.floor(hole.x * a + e))
    const y0 = Math.max(dy, Math.floor(hole.y * d + f))
    const x1 = Math.min(dx + dw, Math.ceil((hole.x + hole.w) * a + e))
    const y1 = Math.min(dy + dh, Math.ceil((hole.y + hole.h) * d + f))
    out.hx = x0
    out.hy = y0
    out.hw = Math.max(0, x1 - x0)
    out.hh = Math.max(0, y1 - y0)
  }

  private coarserDraw(
    tier: number, tx: number, ty: number, ct: number,
    dx: number, dy: number, dw: number, dh: number,
    a: number, d: number, e: number, f: number
  ): Draw | null {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    const cwx = tx * tws, cwy = ty * tws, cww = tws
    const ctws = this.TILE / this.ZOOM_TIERS[ct]
    const ctxi = Math.floor(cwx / ctws)
    const ctyi = Math.floor(cwy / ctws)
    const key = `${ct}:${ctxi}:${ctyi}`
    const t = this.tiles.get(key)
    if (!t || !t.bitmap) return null
    const hole = this.fallbackHole(key, t)
    if (hole === null) return null
    const fx = (cwx - ctxi * ctws) / ctws
    const fy = (cwy - ctyi * ctws) / ctws
    const fw = cww / ctws
    this.touchTile(key, t)
    const out: Draw = {
      bmp: t.bitmap,
      sx: this.OS + fx * this.TILE, sy: this.OS + fy * this.TILE,
      sw: fw * this.TILE, sh: fw * this.TILE,
      dx, dy, dw, dh, hx: 0, hy: 0, hw: 0, hh: 0
    }
    if (hole !== NO_HOLE) {
      this.holeToDevice(hole, out, dx, dy, dw, dh, a, d, e, f)
      // The hole swallows the whole cell → this source contributes nothing.
      if (out.hw >= dw && out.hh >= dh) return null
    }
    return out
  }

  private finerDraws(
    tier: number, tx: number, ty: number, ft: number,
    dx: number, dy: number, dw: number, dh: number,
    a: number, d: number, e: number, f: number
  ): Draw[] {
    const tws = this.TILE / this.ZOOM_TIERS[tier]
    const cellWorld: WorldRect = { x: tx * tws, y: ty * tws, w: tws, h: tws }
    const fr = this.tileRange(cellWorld, ft)
    const ftws = this.TILE / this.ZOOM_TIERS[ft]

    const draws: Draw[] = []
    const dpw = dw / tws
    const dph = dh / tws
    for (let fty = fr.ty0; fty <= fr.ty1; fty++) {
      for (let ftx = fr.tx0; ftx <= fr.tx1; ftx++) {
        const k = `${ft}:${ftx}:${fty}`
        const t = this.tiles.get(k)
        if (!t) return []
        const hole = this.fallbackHole(k, t)
        if (hole === null) return [] // one untrusted fragment → drop the set
        if (!t.bitmap) continue

        const fwx = ftx * ftws, fwy = fty * ftws
        const ix0 = Math.max(fwx, cellWorld.x)
        const iy0 = Math.max(fwy, cellWorld.y)
        const ix1 = Math.min(fwx + ftws, cellWorld.x + cellWorld.w)
        const iy1 = Math.min(fwy + ftws, cellWorld.y + cellWorld.h)
        if (ix1 <= ix0 || iy1 <= iy0) continue

        const fineScale = this.TILE / ftws
        const sx = this.OS + (ix0 - fwx) * fineScale
        const sy = this.OS + (iy0 - fwy) * fineScale
        const sw = (ix1 - ix0) * fineScale
        const sh = (iy1 - iy0) * fineScale

        // SHARED-EDGE SNAP. These were floats, so two adjacent fragments of the
        // same cell left a sub-pixel gap the canvas background showed through —
        // the thin white lines during a bake. Both edges are floored (never
        // floor/ceil), so fragment i's far edge is bit-identical to fragment
        // i+1's near edge: no gap AND no overlap. Overlap is not free — tile
        // content is semi-transparent where strokes are, so a 1px overlap
        // composites those pixels twice and draws a darker seam.
        const ddx = Math.floor(dx + (ix0 - cellWorld.x) * dpw)
        const ddy = Math.floor(dy + (iy0 - cellWorld.y) * dph)
        const ddw = Math.floor(dx + (ix1 - cellWorld.x) * dpw) - ddx
        const ddh = Math.floor(dy + (iy1 - cellWorld.y) * dph) - ddy
        if (ddw <= 0 || ddh <= 0) continue

        this.touchTile(k, t)
        const out: Draw = {
          bmp: t.bitmap, sx, sy, sw, sh,
          dx: ddx, dy: ddy, dw: ddw, dh: ddh, hx: 0, hy: 0, hw: 0, hh: 0
        }
        if (hole !== NO_HOLE) {
          this.holeToDevice(hole, out, ddx, ddy, ddw, ddh, a, d, e, f)
          if (out.hw >= ddw && out.hh >= ddh) continue // fully untrusted fragment
        }
        draws.push(out)
      }
    }
    return draws
  }

  // ── baking ───────────────────────────────────────────────────────────────
  async bake(
    vpt: number[], px: { w: number; h: number }, dpr: number,
    makeYielder: () => Yieldable, signal: AbortSignal,
    contentBounds: WorldRect | null,
    /** Called after each tile is stored so the caller can composite the partial
     *  result (F9). Coalesced by the caller — safe to invoke per tile. */
    onProgress?: () => void
  ): Promise<void> {
    const zoom = vpt[0]
    const tier = this.pickActiveTier(zoom)
    const vw = this.viewWorld(vpt, px, dpr)

    if (tier <= this.OVERVIEW_TIER) {
      await this.overview.rebuildIfNeeded(contentBounds, makeYielder() as any, signal)
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

    // With a remote baker each tile costs a postMessage round-trip, and awaiting
    // them one at a time leaves the worker idle between tiles — so keep MORE
    // THAN ONE in flight to ensure the worker is never idle waiting for us.
    //
    // But only just more than one. The worker renders through a strictly SERIAL
    // FIFO chain, so extra lanes buy NO parallelism — they only deepen its
    // queue. With 4 lanes every tile waited behind 3 others, so on a dense board
    // each tile's end-to-end latency was ~4x its own render: tiles landed in
    // late clumps instead of one at a time, and requests blew their timeout
    // while the worker was perfectly healthy (which paused the bakery for 30s).
    // 2 keeps the pipeline fed — one rendering, one queued — at half the latency.
    const lanes = this.remoteBaker ? 2 : 1
    let next = 0
    const drain = async (): Promise<void> => {
      // Per-lane yielder (F8). A single shared yielder had every lane call
      // reset() on the same budget timer, so the effective per-lane budget
      // collapsed to budgetMs / lanes and input-pending checks fought each
      // other. One timer per chain restores the intended budget.
      const yielder = makeYielder()
      yielder.reset()
      while (next < todo.length) {
        if (signal.aborted) return
        const { tx, ty } = todo[next++]
        await this.rebuildTile(tier, tx, ty, yielder, signal)
        // Repaint the partial result now — otherwise the viewport stays on
        // overview/fallback for the entire ~40-tile pass (F9). Coalesced caller.
        if (!signal.aborted) onProgress?.()
        if (yielder.shouldYield()) await yielder.yield()
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(lanes, todo.length) }, () => drain())
    )
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

    this.inFlight.add(key)
    try {
      if (objects.length === 0) {
        this.store(key, tier, tx, ty, null, 4, builtGen)
        return
      }

      // Worker bake first: main thread pays only the (lazy, coalesced) toJSON
      // deltas + a drawImage on store — the rasterization runs off-thread.
      if (this.remoteBaker) {
        let res: RemoteBakeResult<T> | null = null
        try {
          res = await this.remoteBaker(objects, world, scale, this.OS, this.BMP)
        } catch { /* worker hiccup → local fallback */ }
        if (signal.aborted) {
          // Aborted mid-flight (a gesture started). The pixels are already paid
          // for and still correct, so KEEP them rather than closing the bitmap
          // and re-baking the same tile from scratch after the gesture — that
          // double cost is what made "gesture during the unblur" both lag and
          // then take ages to sharpen again.
          //
          // store() is cheap: no GPU upload happens until something draws the
          // tile, and if the gesture changed tier it may never be drawn at all.
          //
          // Two guards. `skipped` must be empty — overlaySkipped is a SYNCHRONOUS
          // main-thread render, exactly the work an abort exists to avoid. And
          // `gen` must not have moved, since an unchanged gen is what makes these
          // pixels current.
          if (res && !res.skipped.length && (this.gen.get(key) ?? 0) === builtGen) {
            const bytes = this.BMP * this.BMP * 4
            if (this.ensureMemory(bytes)) {
              this.store(key, tier, tx, ty, res.bitmap, bytes, builtGen)
              return
            }
          }
          res?.bitmap.close()
          return
        }
        if (res) {
          // Hybrid tile (F3-C): the worker rendered everything it could; overlay
          // the few objects it couldn't (image / group / unshippable text) on
          // top on the main thread. The baker guarantees those all sit z-above
          // what's in the bitmap. `skipped` empty → pure worker bitmap, no
          // overlay (the common case).
          let bmp: ImageBitmap | null = res.bitmap
          if (res.skipped.length) {
            bmp = this.overlaySkipped(res.bitmap, res.skipped, world, scale, q)
          }
          if (signal.aborted) {
            bmp?.close()
            return
          }
          if (bmp) {
            const bytes = this.BMP * this.BMP * 4
            if (!this.ensureMemory(bytes)) {
              bmp.close()
              return
            }
            // Store even if `gen` advanced while we awaited the worker. It is kept
            // under the ORIGINAL builtGen, so isFresh() stays false and the next
            // bake repaints it exactly — same contract as stampBitmapRegion.
            this.store(key, tier, tx, ty, bmp, bytes, builtGen)
            return
          }
          // overlay failed → fall through to a full local render below.
        }
        // null → refused (interleaved z / all-unshippable) or failed: local below.
      }

      // LOCAL FALLBACK. The worker refused this tile (or is paused/failed), so
      // every object in it rasterizes HERE, on the main thread. Timed because it
      // is the single biggest per-object main-thread block in the engine and the
      // one whose cost tracks brush weight — a watercolor tile is far heavier
      // than the same tile in pencil.
      const __tLocal = performance.now()
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
        if (i > 0 && yielder.shouldYield()) {
          await yielder.yield()
          if (signal.aborted) {
            c2d.restore()
            this.release(off)
            return
          }
        }
        try {
          this.renderer(c2d as any, objects[i], scale, q)
        } catch (err) {
          if (this.debug) console.warn('[Committed] render threw', err)
        }
        if (
          i % this.CHUNK === this.CHUNK - 1 ||
          yielder.shouldYield()
        ) {
          await yielder.yield()
          if (signal.aborted) {
            c2d.restore()
            this.release(off)
            return
          }
        }
      }
      c2d.restore()

      // Zero-copy transfer
      let bmp: ImageBitmap
      try {
        bmp = off.transferToImageBitmap()
      } catch {
        this.release(off)
        return
      }
      this.release(off)
      if (signal.aborted) {
        bmp.close()
        return
      }

      // Gen may have advanced during an await yield above → drop stale bitmap;
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
      recordPhase('localBake', performance.now() - __tLocal)
    } finally {
      this.inFlight.delete(key)
    }
  }

  /**
   * Composite the worker's tile bitmap with the objects it couldn't render
   * (F3-C). Draws `base` into a pooled canvas, then renders each `skipped`
   * object over it at the exact tile transform — same translate/scale/clip as
   * a full bake, so the overlaid objects land pixel-identically to a local
   * bake. `base` is consumed (closed) here. Returns the composited bitmap, or
   * null on failure (→ caller does a full local render).
   *
   * Synchronous and un-yielded on purpose: `skipped` is a HANDFUL of objects (a
   * sticker, an image) — the whole point is that the many strokes were baked
   * off-thread. Rendering a few images on main is the residual cost we accept.
   */
  private overlaySkipped(
    base: ImageBitmap, skipped: T[], world: WorldRect, scale: number, q: WorldRect
  ): ImageBitmap | null {
    const __t0 = performance.now()
    let childCount = 0
    for (let i = 0; i < skipped.length; i++) {
      const children = (skipped[i] as any)?._objects
      if (Array.isArray(children)) childCount += children.length
    }
    if (
      skipped.length > MAX_SYNC_OVERLAY_OBJECTS ||
      childCount > MAX_SYNC_OVERLAY_CHILDREN
    ) {
      // `base` is owned by this method. Closing before returning null lets the
      // caller safely enter the yielded full-local fallback without retaining
      // a worker bitmap nobody will draw.
      base.close()
      return null
    }
    const off = this.acquire()
    const c2d = off.getContext('2d')
    if (!c2d) {
      this.release(off)
      base.close()
      return null
    }
    c2d.setTransform(1, 0, 0, 1, 0, 0)
    c2d.clearRect(0, 0, this.BMP, this.BMP)
    try {
      c2d.drawImage(base, 0, 0)
    } catch {
      this.release(off)
      base.close()
      return null
    }
    base.close()
    c2d.save()
    c2d.translate(this.OS, this.OS)
    c2d.scale(scale, scale)
    c2d.translate(-world.x, -world.y)
    c2d.beginPath()
    c2d.rect(q.x, q.y, q.w, q.h)
    c2d.clip()
    for (let i = 0; i < skipped.length; i++) {
      try {
        this.renderer(c2d as any, skipped[i], scale, q)
      } catch (err) {
        if (this.debug) console.warn('[Committed] overlay render threw', err)
      }
    }
    c2d.restore()
    let out: ImageBitmap
    try {
      out = off.transferToImageBitmap()
    } catch {
      this.release(off)
      return null
    }
    this.release(off)
    recordPhase('overlaySkipped', performance.now() - __t0)
    return out
  }

  /** @returns how many tiles were actually rebuilt, so a caller spreading one
   *  budget over several rects (a batched undo/redo) can track what is left. */
  rebuildRectSync(rect: WorldRect, tier: number, clip?: WorldRect, maxTiles = 6): number {
    if (tier < 0 || tier >= this.ZOOM_TIERS.length) return 0
    const __t0 = performance.now()
    const r = this.tileRange(rect, tier)
    const cr = clip ? this.tileRange(clip, tier) : null
    let count = 0
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        if (cr && (tx < cr.tx0 || tx > cr.tx1 || ty < cr.ty0 || ty > cr.ty1)) continue
        if (count >= maxTiles) {
          recordPhase('rebuildSync', performance.now() - __t0)
          return count
        }
        this.rebuildTileSync(tier, tx, ty)
        count++
      }
    }
    if (count) recordPhase('rebuildSync', performance.now() - __t0)
    return count
  }

  private rebuildTileSync(tier: number, tx: number, ty: number): void {
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
        this.renderer(c2d as any, objects[i], scale, q)
      } catch (err) {
        if (this.debug) console.warn('[Committed] sync render threw', err)
      }
    }
    c2d.restore()

    let bmp: ImageBitmap
    try {
      bmp = off.transferToImageBitmap()
    } catch {
      this.release(off)
      return
    }
    this.release(off)
    const bytes = this.BMP * this.BMP * 4
    if (!this.ensureMemory(bytes)) {
      bmp.close()
      return
    }
    this.store(key, tier, tx, ty, bmp, bytes, builtGen)
  }

  /**
   * @param usable Are the stored pixels safe to composite RIGHT NOW? Defaults
   *   to "yes iff this bake is current". A bake that lands after its region was
   *   edited again (the worker round-trip loses that race routinely) is stored
   *   deliberately — it is still the correct picture as of `builtGen`, and the
   *   recorded dirty sub-rect says which part of it has since gone wrong — but
   *   it must NOT be trusted wholesale. Only stamping passes `true` explicitly,
   *   because there the pixels are what the user is already looking at.
   */
  private store(
    key: string, tier: number, tx: number, ty: number,
    bitmap: ImageBitmap | null, bytes: number, builtGen: number,
    usable = (this.gen.get(key) ?? 0) === builtGen
  ) {
    // Only a tile that answers for its WHOLE region may drop the sub-rect. For
    // a late bake the rect is exactly what still needs covering from elsewhere,
    // so clearing it would claim stale pixels are current.
    if (usable) this.dirtyRects.delete(key)
    const prev = this.tiles.get(key)
    if (prev) {
      if (prev.bitmap) prev.bitmap.close()
      this.memoryBytes -= prev.bytes
      // Delete before re-setting so the fresh tile lands at the LRU tail —
      // Map.set on an existing key keeps its original insertion position, which
      // would leave a just-baked tile looking like the oldest and get it evicted
      // first (see touchTile / ensureMemory).
      this.tiles.delete(key)
    }
    this.tiles.set(key, {
      bitmap, tier, tx, ty, bytes, builtGen, usable, lastUsed: performance.now()
    })
    this.memoryBytes += bytes
  }

  isRegionReady(rect: WorldRect, zoom: number): boolean {
    const tier = this.pickActiveTier(zoom)
    // At overview tier the overview IS the picture. Not "ready" while it's dirty
    // — else a drop-layer (e.g. drag commit) hides before the regrown overview
    // repaints → flicker.
    if (tier <= this.OVERVIEW_TIER) return !this.overview.isDirty()
    const r = this.tileRange(rect, tier)
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(key)
        if (!t || !this.isFresh(key, t)) return false
      }
    return true
  }

  /** True only if EVERY active-tier tile the rect covers is present, has a
   *  bitmap, and is fresh — i.e. additiveStamp would FULLY cover the rect. A
   *  partial stamp would leave stale tiles showing old content with no live
   *  fallback (the draw-commit flicker), so callers gate stamping on this. */
  canStampAll(rect: WorldRect, tier: number): boolean {
    if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false
    const r = this.tileRange(rect, tier)
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const t = this.tiles.get(key)
        if (!t || !t.bitmap || !this.isFresh(key, t)) return false
      }
    return true
  }

  // ── memory + pool ─────────────────────────────────────────────────────────
  /**
   * Mark a tile most-recently-used. `tiles` is kept in LRU order — a Map
   * preserves insertion order and `set` on an EXISTING key does not move it, so
   * we delete first to re-insert at the tail. O(1), and it lets ensureMemory
   * evict from the head without sorting.
   */
  private touchTile(key: string, t: Tile): void {
    t.lastUsed = performance.now()
    if (this.tiles.delete(key)) this.tiles.set(key, t)
  }

  private ensureMemory(need: number): boolean {
    if (this.memoryBytes + need <= this.MEM_HARD) return true
    // Reclaim retained stale cross-tier textures first. They can never be drawn,
    // while a fresh LRU tile may still be useful as an active/fallback source.
    // The map is budget-bounded, so this scan is small and allocation-free.
    const target = this.MEM_HARD * 0.85 - need
    for (const [key, tile] of this.tiles) {
      if (this.memoryBytes <= target) break
      if (this.isFresh(key, tile)) continue
      if (tile.bitmap) tile.bitmap.close()
      this.memoryBytes -= tile.bytes
      this.tiles.delete(key)
      this.dirtyRects.delete(key)
    }

    // Still over budget: evict from the head (least recently used) down to the
    // same low-water mark.
    //
    // This used to snapshot AND sort the entire tile map — `[...entries()].sort()`
    // — on the main thread on every store that hit the cap. During a zoom the new
    // tier stores dozens of tiles back to back, so that O(n log n) + full array
    // alloc ran per tile and spiked exactly as the picture sharpened. Map order
    // is already LRU (see touchTile), so this is O(evicted) with no allocation.
    for (const [k, t] of this.tiles) {
      if (this.memoryBytes <= target) break
      if (t.bitmap) t.bitmap.close()
      this.memoryBytes -= t.bytes
      this.tiles.delete(k)
      this.dirtyRects.delete(k)
    }
    return this.memoryBytes + need <= this.MEM_HARD
  }

  private acquire(): OffscreenCanvas {
    const c = this.pool.pop()
    if (c) {
      this.poolBytes -= this.BMP * this.BMP * 4;
      return c
    }
    return new OffscreenCanvas(this.BMP, this.BMP)
  }

  private release(c: OffscreenCanvas): void {
    // Keep at most a few in the pool; let the rest be GC'd. The pool exists to
    // smooth a sync-rebuild burst, not to hold megabytes idle between gestures.
    if (this.pool.length < this.POOL_MAX) {
      this.pool.push(c)
      this.poolBytes += this.BMP * this.BMP * 4
    } else {
      // drop it: shrink to 0 so the backing store is freed promptly on mobile.
      c.width = 0; c.height = 0
    }
  }

  /** Call when idle (gesture-end / bake-done) to release pooled backing store. */
  trimPool(keep = 2): void {
    while (this.pool.length > keep) {
      const c = this.pool.pop()!
      c.width = 0; c.height = 0
      this.poolBytes -= this.BMP * this.BMP * 4
    }
  }

  /** Drop long-untouched empty tiles so the maps don't grow unbounded on a
   * sparse infinite canvas. Empty tiles cost ~nothing to rebuild on revisit. */
  pruneEmpties(maxAgeMs = 30_000): void {
    const now = performance.now()
    for (const [k, t] of this.tiles) {
      if (!t.bitmap && now - t.lastUsed > maxAgeMs) {
        this.tiles.delete(k)
        this.gen.delete(k) // also unbloat the gen map
        this.dirtyRects.delete(k)
        this.memoryBytes -= t.bytes
      }
    }
  }


  additiveStamp(rect: WorldRect, obj: T, tier: number): boolean {
    if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false
    const scale = this.ZOOM_TIERS[tier]
    const r = this.tileRange(rect, tier)
    let stampedAny = false
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const oldGen = this.gen.get(key) ?? 0
        const t = this.tiles.get(key)
        const stampable = !!(t && t.bitmap && t.builtGen === oldGen)

        if (!stampable) {
          if (this.tiles.has(key)) this.invalidateKey(key, rect)
          continue
        }

        // Stampable: composite obj on top, store FRESH under a bumped gen.
        const newGen = oldGen + 1
        this.gen.set(key, newGen)

        const world = this.tileToWorld(tier, tx, ty)
        const pad = this.OS / scale + 4 / scale
        const q: WorldRect = { x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }

        const off = this.acquire()
        const c2d = off.getContext('2d')
        if (!c2d) { this.release(off); continue }
        c2d.setTransform(1, 0, 0, 1, 0, 0)
        c2d.clearRect(0, 0, this.BMP, this.BMP)
        c2d.drawImage(t!.bitmap!, 0, 0)
        c2d.save()
        c2d.translate(this.OS, this.OS)
        c2d.scale(scale, scale)
        c2d.translate(-world.x, -world.y)
        c2d.beginPath()
        c2d.rect(q.x, q.y, q.w, q.h)
        c2d.clip()
        try { this.renderer(c2d as any, obj, scale, q) } catch { /* ignore */ }
        c2d.restore()

        let bmp: ImageBitmap
        try { bmp = off.transferToImageBitmap() } catch { this.release(off); continue }
        this.release(off)
        const bytes = this.BMP * this.BMP * 4
        if (!this.ensureMemory(bytes)) { bmp.close(); continue }
        this.store(key, tier, tx, ty, bmp, bytes, newGen)
        stampedAny = true
      }
    }
    return stampedAny
  }

  /**
   * Destination-out stamp of an eraser stroke onto existing FRESH tiles.
   * Tiles are flattened content and a plain eraser stroke is topmost, so
   * punching it into the bitmap is PIXEL-EXACT — stamped tiles stay FRESH
   * under a bumped gen and need NO rebake. The stroke's own
   * globalCompositeOperation applies during render (fabric sets it in
   * object.render), which also keeps alpha erasers correct.
   *
   * Returns false if any covered tile couldn't be stamped (missing / stale /
   * failed) — those are left stale and the caller schedules a bake, which
   * rebuilds them from the objects' already-updated clipPaths.
   */
  eraseStamp(rect: WorldRect, obj: T, tier: number): boolean {
    if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false
    const scale = this.ZOOM_TIERS[tier]
    const r = this.tileRange(rect, tier)
    let complete = true
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const oldGen = this.gen.get(key) ?? 0
        const t = this.tiles.get(key)
        const fresh = !!t && t.builtGen === oldGen

        if (t && fresh && !t.bitmap) continue // fresh-empty: nothing to erase

        if (!t || !fresh || !t.bitmap) {
          if (this.tiles.has(key)) this.invalidateKey(key, rect)
          complete = false
          continue
        }

        const newGen = oldGen + 1
        this.gen.set(key, newGen)

        const world = this.tileToWorld(tier, tx, ty)
        const pad = this.OS / scale + 4 / scale
        const q: WorldRect = { x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }

        const off = this.acquire()
        const c2d = off.getContext('2d')
        if (!c2d) {
          this.release(off)
          complete = false
          continue
        }
        c2d.setTransform(1, 0, 0, 1, 0, 0)
        c2d.clearRect(0, 0, this.BMP, this.BMP)
        c2d.drawImage(t.bitmap, 0, 0)
        c2d.save()
        c2d.translate(this.OS, this.OS)
        c2d.scale(scale, scale)
        c2d.translate(-world.x, -world.y)
        c2d.beginPath()
        c2d.rect(q.x, q.y, q.w, q.h)
        c2d.clip()
        try { this.renderer(c2d as any, obj, scale, q) } catch { /* ignore */ }
        c2d.restore()

        let bmp: ImageBitmap
        try {
          bmp = off.transferToImageBitmap()
        } catch {
          this.release(off)
          complete = false
          continue
        }
        this.release(off)
        const bytes = this.BMP * this.BMP * 4
        if (!this.ensureMemory(bytes)) {
          bmp.close()
          complete = false
          continue
        }
        this.store(key, tier, tx, ty, bmp, bytes, newGen)
      }
    }
    return complete
  }

  /**
   * Stamp a pre-rendered bitmap (the transform controller's drag layer) into
   * the tiles covering `rect`, mapped through `m` (bitmap px → world, 2x3
   * matrix). This makes a drag/scale/rotate commit O(touched tiles) drawImage
   * work instead of re-rendering N objects — the pixels the user already sees
   * on the GPU layer become the tile content immediately.
   *
   * Stamped tiles are stored STALE (gen bumped, builtGen left behind): they
   * draw at full quality right away, while the async bake later repaints them
   * exactly (correct z-order where the selection sits under other content).
   *
   * Returns true only if EVERY covered tile now shows the stamp (had a fresh
   * bitmap, or was fresh-empty and got a new tile). On false the caller keeps
   * its fallback cover (GPU layer) until the bake lands.
   */
  stampBitmapRegion(
    rect: WorldRect,
    tier: number,
    bmp: ImageBitmap,
    m: [number, number, number, number, number, number]
  ): boolean {
    if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false
    const scale = this.ZOOM_TIERS[tier]
    const r = this.tileRange(rect, tier)
    let complete = true
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`
        const oldGen = this.gen.get(key) ?? 0
        const t = this.tiles.get(key)
        const fresh = !!t && t.builtGen === oldGen

        if (!fresh || !t) {
          // stale or missing → bake owns it; make sure it's queued
          if (this.tiles.has(key)) this.invalidateKey(key, rect)
          complete = false
          continue
        }

        const world = this.tileToWorld(tier, tx, ty)
        const off = this.acquire()
        const c2d = off.getContext('2d')
        if (!c2d) {
          this.release(off)
          complete = false
          continue
        }
        c2d.setTransform(1, 0, 0, 1, 0, 0)
        c2d.clearRect(0, 0, this.BMP, this.BMP)
        if (t.bitmap) c2d.drawImage(t.bitmap, 0, 0)
        c2d.save()
        c2d.translate(this.OS, this.OS)
        c2d.scale(scale, scale)
        c2d.translate(-world.x, -world.y)
        c2d.transform(m[0], m[1], m[2], m[3], m[4], m[5])
        try {
          c2d.drawImage(bmp, 0, 0)
        } catch {
          c2d.restore()
          this.release(off)
          // Nothing was written, and the object HAS moved here — invalidate
          // properly (usable=false + dirty rect) rather than only bumping the
          // gen, which would leave the old pixels flagged as showable.
          this.invalidateKey(key, rect)
          complete = false
          continue
        }
        c2d.restore()

        let out: ImageBitmap
        try {
          out = off.transferToImageBitmap()
        } catch {
          this.release(off)
          this.invalidateKey(key, rect)
          complete = false
          continue
        }
        this.release(off)
        const bytes = this.BMP * this.BMP * 4
        if (!this.ensureMemory(bytes)) {
          out.close()
          this.invalidateKey(key, rect)
          complete = false
          continue
        }
        // Store visually-correct pixels under a BUMPED gen with the OLD
        // builtGen → tile draws now, bake repaints it exactly later.
        //
        // `usable: true` is what makes "draws now" true. The compositor
        // otherwise refuses any tile whose builtGen is behind, which silently
        // turned this whole fast path into "invalidate the region and show the
        // overview" — the blur-and-shift the user sees on every move commit.
        this.gen.set(key, oldGen + 1)
        this.dirtyRects.delete(key)
        this.store(key, tier, tx, ty, out, bytes, oldGen, true)
      }
    }
    return complete
  }

  get minUsableZoom(): number {
    return this.ZOOM_TIERS[0] / this.renderScale
  }
  get maxUsableZoom(): number {
    // Finest tier ÷ renderScale — past this we'd ask for a tier we never bake.
    return this.ZOOM_TIERS[this.ZOOM_TIERS.length - 1] / this.renderScale
  }

  reset(): void {
    for (const t of this.tiles.values()) if (t.bitmap) t.bitmap.close()
    this.tiles.clear()
    this.gen.clear()
    this.dirtyRects.clear()
    this.memoryBytes = 0
    this.overview.reset()
    this.trimPool(0) // ensure pool bytes are dumped entirely on reset
  }
}
