// committedLayer.ts
//
// The COMMITTED layer: cached tiles that are a PURE FUNCTION of (objects in a
// region, generation). Tiles are NEVER mutated in place — they are only ever
// rebuilt wholesale from the spatial index. That single rule is what kills the
// whole class of flashing / glitchy-patch / z-order bugs: there is exactly one
// way a tile's pixels can change (rebuild), and freshness is a trivial gen
// compare.
//
// One display rule removes the remaining flash/ghost sources:
//   FRESH-OVER-OVERVIEW: a tile is drawn ONLY when fresh. A stale or missing
//   tile is not drawn at all — the world overview (a correct, localized-patched
//   low-res cache) shows through underneath instead. So a cold/just-edited
//   region is never blank and never shows stale "ghost" pixels; the worst case
//   is a brief low-res patch until that tile rebakes. (Drawing old pixels for a
//   dirty tile — "stale-exact" — was what bled ghosts after undo/erase/move.)
//
// Far zoom (active tier <= OVERVIEW_TIER) is served entirely by the overview
// (one drawImage), so "thousands of objects, zoomed out" costs O(1) per frame
// and never triggers a monolithic coarse bake. Near/mid zoom uses vector tiles
// whose per-tile object density is naturally bounded; dense tiles yield mid-
// render so a single tile can never freeze the main thread.

import { WorldOverview } from "./worldOverview";

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
    calculate?: boolean,
  ): { left: number; top: number; width: number; height: number };
}

export interface SpatialIndex<T extends Bounded> {
  /** Objects intersecting rect, returned in paint (z) order. */
  query(rect: WorldRect): T[];
}

export type TileRenderer<T extends Bounded> = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  obj: T,
  tierScale: number,
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
  /** Active tier <= this is served by the world overview instead of tiles. */
  overviewTier?: number;
  /** Overview bitmap dimension (px). */
  overviewPx?: number;
  /** Objects rendered per yield-slice during a tile rebuild. */
  renderChunk?: number;
  debug?: boolean;
}

export class CommittedLayer<T extends Bounded> {
  private readonly TILE: number;
  private readonly OS: number;
  private readonly BMP: number;
  public readonly ZOOM_TIERS: number[];
  private readonly MEM_HARD: number;
  private readonly OVERVIEW_TIER: number;
  private readonly CHUNK: number;
  private readonly debug: boolean;
  private readonly renderScale: number;

  private readonly index: SpatialIndex<T>;
  private readonly renderer: TileRenderer<T>;
  public readonly overview: WorldOverview<T>;

  private tiles = new Map<string, Tile>();
  private gen = new Map<string, number>(); // current dirty-generation per tile key
  private memoryBytes = 0;
  private pool: OffscreenCanvas[] = [];
  private readonly POOL_MAX = 4;

  constructor(
    index: SpatialIndex<T>,
    renderer: TileRenderer<T>,
    opts: CommittedOptions = {},
  ) {
    this.index = index;
    this.renderer = renderer;
    this.TILE = opts.tileSize ?? 512;
    this.OS = Math.max(0, opts.overscanPx ?? 2);
    this.BMP = this.TILE + 2 * this.OS;
    this.ZOOM_TIERS = opts.zoomTiers ?? [
      0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32,
    ];
    this.MEM_HARD = (opts.memoryBudgetMB ?? 256) * 1024 * 1024;
    this.OVERVIEW_TIER = opts.overviewTier ?? 2;
    this.CHUNK = opts.renderChunk ?? 64;
    this.debug = opts.debug ?? false;
    const maxRS = opts.maxRenderScale ?? 2;
    this.renderScale = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      maxRS,
    );
    this.overview = new WorldOverview<T>(index, renderer, {
      px: opts.overviewPx ?? 2048,
    });
  }

  // ── geometry ────────────────────────────────────────────────────────────
  pickActiveTier(zoom: number): number {
    const eff = zoom * this.renderScale;
    const TOL = 1.15;
    for (let i = 0; i < this.ZOOM_TIERS.length; i++)
      if (this.ZOOM_TIERS[i] * TOL >= eff) return i;
    return this.ZOOM_TIERS.length - 1;
  }
  private tileRange(r: WorldRect, tier: number) {
    const tws = this.TILE / this.ZOOM_TIERS[tier];
    return {
      tx0: Math.floor(r.x / tws),
      ty0: Math.floor(r.y / tws),
      tx1: Math.floor((r.x + r.w) / tws),
      ty1: Math.floor((r.y + r.h) / tws),
    };
  }
  private tileToWorld(tier: number, tx: number, ty: number): WorldRect {
    const tws = this.TILE / this.ZOOM_TIERS[tier];
    return { x: tx * tws, y: ty * tws, w: tws, h: tws };
  }
  private isFresh(key: string, t: Tile): boolean {
    return t.builtGen === (this.gen.get(key) ?? 0);
  }
  private viewWorld(
    vpt: number[],
    px: { w: number; h: number },
    dpr: number,
  ): WorldRect {
    const z = vpt[0];
    return {
      x: -vpt[4] / z,
      y: -vpt[5] / z,
      w: px.w / (z * dpr),
      h: px.h / (z * dpr),
    };
  }

  // ── invalidation (the ONLY way committed pixels change) ──────────────────
  /** Mark a world region dirty. Existing tiles there will rebuild on next bake. */
  markDirty(rect: WorldRect): void {
    for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
      const r = this.tileRange(rect, tier);
      for (let ty = r.ty0; ty <= r.ty1; ty++)
        for (let tx = r.tx0; tx <= r.tx1; tx++) {
          const k = `${tier}:${tx}:${ty}`;
          if (this.tiles.has(k)) this.gen.set(k, (this.gen.get(k) ?? 0) + 1);
        }
    }
  }
  markAllDirty(): void {
    for (const [k] of this.tiles) this.gen.set(k, (this.gen.get(k) ?? 0) + 1);
    this.overview.markDirty();
  }

  // ── compositing (one path, no special cases) ─────────────────────────────
  composite(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    vpt: number[],
    px: { w: number; h: number },
    dpr: number,
    bg?: string,
  ): { needsBake: boolean } {
    const zoom = vpt[0];
    const tier = this.pickActiveTier(zoom);
    const vw = this.viewWorld(vpt, px, dpr);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px.w, px.h);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, px.w, px.h);
    }
    ctx.restore();

    // FAR ZOOM → overview only. O(1), never bakes coarse tiles.
    if (tier <= this.OVERVIEW_TIER) {
      this.overview.composite(ctx, vpt, px, dpr, vw);
      return { needsBake: this.overview.isDirty() };
    }

    // NEAR/MID → fresh vector tiles over a correct overview base.
    const range = this.tileRange(vw, tier);
    const scale = this.ZOOM_TIERS[tier];
    const tws = this.TILE / scale;
    const a = vpt[0] * dpr,
      d = vpt[3] * dpr,
      e = vpt[4] * dpr,
      f = vpt[5] * dpr;

    // Draw ONLY fresh tiles. A stale or missing tile is intentionally NOT
    // drawn — the (always-correct, localized-patched) overview shows through
    // for it. So we never expose stale "ghost" pixels and never go blank;
    // the worst case is a brief low-res patch until that tile bakes.
    const draws: { t: Tile; dx: number; dy: number; dw: number; dh: number }[] =
      [];
    let anyNonFresh = false;
    for (let ty = range.ty0; ty <= range.ty1; ty++) {
      for (let tx = range.tx0; tx <= range.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`;
        const t = this.tiles.get(key);
        if (t && this.isFresh(key, t)) {
          t.lastUsed = performance.now();
          if (t.bitmap) {
            const dx0 = Math.floor(tx * tws * a + e);
            const dy0 = Math.floor(ty * tws * d + f);
            const dx1 = Math.floor((tx + 1) * tws * a + e);
            const dy1 = Math.floor((ty + 1) * tws * d + f);
            draws.push({ t, dx: dx0, dy: dy0, dw: dx1 - dx0, dh: dy1 - dy0 });
          }
        } else {
          anyNonFresh = true; // overview base covers this cell until it bakes
        }
      }
    }

    // Overview base under any non-fresh cell: one cheap blit, skipped entirely
    // once the viewport is fully baked. Drawn BEFORE tiles so fresh tiles win.
    if (anyNonFresh) this.overview.composite(ctx, vpt, px, dpr, vw);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const factor = (zoom * dpr) / scale;
    ctx.imageSmoothingEnabled = Math.abs(factor - 1) >= 0.01;
    for (const dr of draws)
      ctx.drawImage(
        dr.t.bitmap!,
        this.OS,
        this.OS,
        this.TILE,
        this.TILE,
        dr.dx,
        dr.dy,
        dr.dw,
        dr.dh,
      );
    ctx.restore();

    return { needsBake: anyNonFresh };
  }

  // ── baking (rebuild-only, async, yielded) ────────────────────────────────
  async bake(
    vpt: number[],
    px: { w: number; h: number },
    dpr: number,
    yielder: Yieldable,
    signal: AbortSignal,
    contentBounds: WorldRect | null,
  ): Promise<void> {
    const zoom = vpt[0];
    const tier = this.pickActiveTier(zoom);
    const vw = this.viewWorld(vpt, px, dpr);

    // Far zoom: keep the overview correct instead of baking tiles.
    if (tier <= this.OVERVIEW_TIER) {
      await this.overview.rebuildIfNeeded(contentBounds, yielder, signal);
      return;
    }

    // Pad the viewport by one tile for prefetch.
    const tws = this.TILE / this.ZOOM_TIERS[tier];
    const padded: WorldRect = {
      x: vw.x - tws,
      y: vw.y - tws,
      w: vw.w + 2 * tws,
      h: vw.h + 2 * tws,
    };
    const range = this.tileRange(padded, tier);
    const cx = (range.tx0 + range.tx1) / 2,
      cy = (range.ty0 + range.ty1) / 2;

    const todo: { tx: number; ty: number; pri: number }[] = [];
    for (let ty = range.ty0; ty <= range.ty1; ty++)
      for (let tx = range.tx0; tx <= range.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`;
        const t = this.tiles.get(key);
        if (t && this.isFresh(key, t)) continue; // missing OR stale only
        todo.push({ tx, ty, pri: (tx - cx) ** 2 + (ty - cy) ** 2 });
      }
    todo.sort((p, q) => p.pri - q.pri);

    yielder.reset();
    for (const { tx, ty } of todo) {
      if (signal.aborted) return;
      await this.rebuildTile(tier, tx, ty, yielder, signal);
      if (yielder.shouldYield()) await yielder.yield();
    }
  }

  private async rebuildTile(
    tier: number,
    tx: number,
    ty: number,
    yielder: Yieldable,
    signal: AbortSignal,
  ): Promise<void> {
    const scale = this.ZOOM_TIERS[tier];
    const world = this.tileToWorld(tier, tx, ty);
    const pad = this.OS / scale + 4 / scale;
    const q: WorldRect = {
      x: world.x - pad,
      y: world.y - pad,
      w: world.w + 2 * pad,
      h: world.h + 2 * pad,
    };
    const objects = this.index.query(q);
    const key = `${tier}:${tx}:${ty}`;
    const builtGen = this.gen.get(key) ?? 0;

    if (objects.length === 0) {
      this.store(key, tier, tx, ty, null, 4, builtGen);
      return;
    }

    const off = this.acquire();
    const c2d = off.getContext("2d");
    if (!c2d) {
      this.release(off);
      return;
    }
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, this.BMP, this.BMP);
    c2d.save();
    c2d.translate(this.OS, this.OS);
    c2d.scale(scale, scale);
    c2d.translate(-world.x, -world.y);
    c2d.beginPath();
    c2d.rect(q.x, q.y, q.w, q.h);
    c2d.clip();
    // Chunked render: a single dense tile can never freeze the main thread.
    for (let i = 0; i < objects.length; i++) {
      try {
        this.renderer(c2d as any, objects[i], scale);
      } catch (err) {
        if (this.debug) console.warn("[Committed] render threw", err);
      }
      if (i % this.CHUNK === this.CHUNK - 1 && yielder.shouldYield()) {
        await yielder.yield();
        if (signal.aborted) {
          c2d.restore();
          this.release(off);
          return;
        }
      }
    }
    c2d.restore();

    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(off);
    } catch {
      this.release(off);
      return;
    }
    this.release(off);
    if (signal.aborted) {
      bmp.close();
      return;
    }

    const bytes = this.BMP * this.BMP * 4;
    if (!this.ensureMemory(bytes)) {
      bmp.close();
      return;
    }
    this.store(key, tier, tx, ty, bmp, bytes, builtGen);
  }

  private store(
    key: string,
    tier: number,
    tx: number,
    ty: number,
    bitmap: ImageBitmap | null,
    bytes: number,
    builtGen: number,
  ) {
    const prev = this.tiles.get(key);
    if (prev) {
      if (prev.bitmap) prev.bitmap.close();
      this.memoryBytes -= prev.bytes;
    }
    this.tiles.set(key, {
      bitmap,
      tier,
      tx,
      ty,
      bytes,
      builtGen,
      lastUsed: performance.now(),
    });
    this.memoryBytes += bytes;
  }

  /**
   * Delete tiles overlapping rect at `tier` so composite falls back to the
   * overview there. Used by erase to show an instant, correct hole (the
   * overview is content-only, so the background shows through) while the sharp
   * rebuild runs — no un-erase flash, no transparent-hole-through-background bug.
   */
  dropTiles(rect: WorldRect, tier: number): void {
    const r = this.tileRange(rect, tier);
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const k = `${tier}:${tx}:${ty}`;
        const t = this.tiles.get(k);
        if (t) {
          if (t.bitmap) t.bitmap.close();
          this.memoryBytes -= t.bytes;
          this.tiles.delete(k);
        }
      }
  }

  /** True if every active-tier tile covering rect is present and fresh. */
  isRegionReady(rect: WorldRect, zoom: number): boolean {
    const tier = this.pickActiveTier(zoom);
    if (tier <= this.OVERVIEW_TIER) return true; // overview always "ready"
    const r = this.tileRange(rect, tier);
    for (let ty = r.ty0; ty <= r.ty1; ty++)
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const key = `${tier}:${tx}:${ty}`;
        const t = this.tiles.get(key);
        if (!t || !this.isFresh(key, t)) return false;
      }
    return true;
  }

  // ── memory + pool ────────────────────────────────────────────────────────
  private ensureMemory(need: number): boolean {
    if (this.memoryBytes + need <= this.MEM_HARD) return true;
    const sorted = [...this.tiles.entries()].sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    );
    for (const [k, t] of sorted) {
      if (t.bitmap) t.bitmap.close();
      this.memoryBytes -= t.bytes;
      this.tiles.delete(k);
      if (this.memoryBytes + need <= this.MEM_HARD) return true;
    }
    return false;
  }
  private acquire(): OffscreenCanvas {
    return this.pool.pop() ?? new OffscreenCanvas(this.BMP, this.BMP);
  }
  private release(c: OffscreenCanvas): void {
    if (this.pool.length < this.POOL_MAX) this.pool.push(c);
  }

  reset(): void {
    for (const t of this.tiles.values()) if (t.bitmap) t.bitmap.close();
    this.tiles.clear();
    this.gen.clear();
    this.memoryBytes = 0;
    this.overview.reset();
  }
}
