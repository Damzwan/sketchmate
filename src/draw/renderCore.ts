// renderCore.ts
//
// Orchestrator. Frame loop + bake loop + lifecycle hooks the store delegates to.
//   • in-flight object        → live layer (rendered directly, never baked)
//   • settled / changed object → index + invalidate(region)  (committed rebuilds)
//   • every frame             → committed.composite() then live.composite()
//
// Low-end hardening:
//   • viewport gating: off-screen adds/changes invalidate (cheap) but never
//     take a live slot or schedule a composite.
//   • remote-modify coalescing: many streamed object:modified events collapse
//     into ONE destructive sync-rebuild per frame (unioned rect).
//   • BATCH invalidation: a drained remote-event queue collapses to ONE pass —
//     drop regions + patch overview + one frame + one bake, no per-rect sync
//     rebuild (invalidateRegions).
//   • off-screen overview patches are DEFERRED (pendingOverview) and flushed on
//     bake / pan-end — invisible regions don't pay the clip+redraw.
//   • depth-1 fallback while gesturing (passed down to committed.composite).

import {
  type Bounded,
  CommittedLayer,
  type CommittedOptions,
  type SpatialIndex,
  type TileRenderer,
  type WorldRect,
  type Yieldable
} from './committedLayer'
import { LiveLayer, type LiveMode, type LiveRenderer } from './liveLayer'

export interface Surface {
  getContext(): CanvasRenderingContext2D;

  getSize(): { w: number; h: number };

  getVpt(): number[];

  getDpr(): number;

  getBackground(): string | undefined;
}

export interface RenderCoreOptions extends CommittedOptions {
  liveMax?: number;
  bakeDebounceMs?: number;
  afterComposite?: () => void;
}

export class RenderCore<T extends Bounded> {
  private readonly committed: CommittedLayer<T>
  private readonly live: LiveLayer<T>
  private readonly surface: Surface
  private readonly liveRender: LiveRenderer<T>
  private readonly makeYielder: () => Yieldable
  private readonly afterComposite?: () => void
  private readonly bakeDebounce: number

  private frameScheduled = false
  private bakeTimer: any = null
  private overviewTimer: any = null
  private bakeCtrl: AbortController | null = null
  private gesturing = false
  private loading = false
  private erasing = false
  private baking = false
  private bakeAgain = false

  // remote-modify coalescing
  private pendingRemote: WorldRect | null = null
  private remoteRaf = 0

  // deferred off-screen overview patches (item C)
  private pendingOverview: WorldRect[] = []

  private contentBounds: WorldRect | null = null

  constructor(
    index: SpatialIndex<T>,
    tileRenderer: TileRenderer<T>,
    liveRenderer: LiveRenderer<T>,
    surface: Surface,
    makeYielder: () => Yieldable,
    opts: RenderCoreOptions = {}
  ) {
    this.committed = new CommittedLayer<T>(index, tileRenderer, opts)
    this.live = new LiveLayer<T>({ max: opts.liveMax })
    this.surface = surface
    this.liveRender = liveRenderer
    this.makeYielder = makeYielder
    this.afterComposite = opts.afterComposite
    this.bakeDebounce = opts.bakeDebounceMs ?? 80
  }

  get tiers(): number[] {
    return this.committed.ZOOM_TIERS
  }

  // ── frame ────────────────────────────────────────────────────────────────
  requestFrame(): void {
    if (this.erasing) return // brush owns the lower context during a stroke
    if (this.frameScheduled) return
    this.frameScheduled = true
    requestAnimationFrame(() => {
      this.frameScheduled = false
      this.renderNow()
    })
  }

  private renderNow(): void {
    this.frameCounter++
    const ctx = this.surface.getContext()
    if (!ctx) return
    const vpt = this.surface.getVpt()
    const size = this.surface.getSize()
    const dpr = this.surface.getDpr()

    this.live.gcExpired()
    const { needsBake } = this.committed.composite(
      ctx, vpt, size, dpr, this.surface.getBackground(), this.gesturing ? 1 : 0
    )
    const vw = this.committed.viewWorld(vpt, size, dpr)
    this.live.composite(ctx, vpt, dpr, this.liveRender, vw)

    if (this.pendingDemote && !needsBake) {
      this.pendingDemote = false
      this.demoteSettled()
    }

    if (needsBake) this.scheduleBake()
    this.afterComposite?.()
  }

  // ── bake ─────────────────────────────────────────────────────────────────
  scheduleBake(): void {
    if (this.gesturing || this.loading || this.erasing) return
    if (this.baking) {
      this.bakeAgain = true
      return
    }
    if (this.bakeTimer !== null) return
    this.bakeTimer = setTimeout(() => {
      this.bakeTimer = null
      void this.runBake()
    }, this.bakeDebounce)
  }

  abortBakes(): void {
    this.bakeCtrl?.abort()
    this.bakeCtrl = null
    this.bakeAgain = false
    if (this.bakeTimer !== null) {
      clearTimeout(this.bakeTimer)
      this.bakeTimer = null
    }
  }
  private pendingDemote = false

  private async runBake(): Promise<void> {
    if (this.gesturing || this.loading || this.erasing) return
    if (this.baking) {
      this.bakeAgain = true
      return
    }
    this.baking = true
    this.bakeAgain = false
    this.flushPendingOverview() // off-screen patches now matter (we're about to bake)
    const ctrl = new AbortController()
    this.bakeCtrl = ctrl
    try {
      await this.committed.bake(
        this.surface.getVpt(), this.surface.getSize(), this.surface.getDpr(),
        this.makeYielder(), ctrl.signal, this.contentBounds
      )
    } catch { /* aborted / transient */
    }
    this.baking = false
    if (this.bakeCtrl === ctrl) this.bakeCtrl = null
    if (ctrl.signal.aborted) {
      if (this.bakeAgain) {
        this.bakeAgain = false
        this.scheduleBake()
      }
      return
    }
    this.pendingDemote = true
    this.requestFrame()
    if (this.bakeAgain) {
      this.bakeAgain = false
      this.scheduleBake()
    } else {
      this.committed.trimPool()
      this.committed.pruneEmpties()
    }
  }

  private demoteSettled(): void {
    if (this.live.isEmpty()) return
    if (this.committed.overview.isDirty()) return
    const zoom = this.surface.getVpt()[0]
    const ids = this.live.settledIds((rect) => this.committed.isRegionReady(rect, zoom))
    for (const id of ids) this.live.remove(id)
  }

  onObjectAdded(obj: T, topmost = false): void {
    const rect = this.boundsOf(obj)
    if (!rect) return
    this.growContentBounds(rect)
    const tier = this.committed.pickActiveTier(this.surface.getVpt()[0])

    const gco = (obj as any).globalCompositeOperation
    const stampSafe = !gco || gco === 'source-over'

    const canStamp =
      topmost && stampSafe &&
      tier > this.committed.overviewTier &&
      !this.gesturing &&
      this.intersectsView(rect) &&
      // All-or-nothing: only stamp when EVERY covered tile is stampable.
      // A partial stamp leaves stale tiles with no live fallback → flicker.
      this.committed.canStampAll(rect, tier)

    if (canStamp) {
      this.committed.dropOtherTiers(rect, tier)
      this.committed.additiveStamp(rect, obj, tier)
      this.patchOverview(rect)
      this.requestFrame()
      this.scheduleBake()
      return
    }

    // Fallback: full rebuild + live overlay for multiply/blend strokes,
    // and for any stroke that wasn't fully stampable (covered by live here).
    this.additiveInvalidate(rect)
    if (this.intersectsView(rect) && topmost) this.live.add(obj, rect, 'normal')
    this.requestFrame()
    this.scheduleBake()
  }

  onObjectRemoved(obj: T, oldRect?: WorldRect): void {
    const rect = oldRect ?? this.boundsOf(obj)
    if (obj.id) this.live.remove(obj.id)
    if (rect) {
      this.destructiveInvalidate(rect)
      if (this.intersectsView(rect)) this.requestFrame()
    }
    this.scheduleBake()
  }

  onObjectChanged(obj: T, oldRect?: WorldRect): void {
    const rect = this.boundsOf(obj)
    if (oldRect) this.destructiveInvalidate(oldRect)
    if (rect) {
      this.growContentBounds(rect)
      this.additiveInvalidate(rect)
    }
    const inView =
      (rect ? this.intersectsView(rect) : false) ||
      (oldRect ? this.intersectsView(oldRect) : false)
    if (inView) this.requestFrame()
    this.scheduleBake()
  }

  /**
   * Coalesced change — for STREAMED remote drags. The live overlay keeps it
   * smooth per-event (viewport-culled); the destructive sync-rebuild runs at
   * most ONCE per frame on the unioned rect.
   */
  onObjectChangedCoalesced(obj: T, oldRect?: WorldRect): void {
    const cur = this.boundsOf(obj)
    if (cur) {
      this.growContentBounds(cur)
      if (this.intersectsView(cur)) this.live.add(obj, cur, 'normal')
    }
    let r: WorldRect | null = cur
    if (oldRect) r = cur ? this.union(cur, oldRect) : oldRect
    if (!r) return
    this.pendingRemote = this.pendingRemote ? this.union(this.pendingRemote, r) : { ...r }
    this.scheduleRemoteFlush()
  }

  private scheduleRemoteFlush(): void {
    if (this.remoteRaf) return
    this.remoteRaf = requestAnimationFrame(() => {
      this.remoteRaf = 0
      if (this.gesturing || this.loading) {
        this.scheduleRemoteFlush()
        return
      }
      const rect = this.pendingRemote
      this.pendingRemote = null
      if (!rect) return
      this.destructiveInvalidate(rect)
      if (this.intersectsView(rect)) this.requestFrame()
      this.scheduleBake()
    })
  }

  /**
   * BATCH invalidation for a drained remote-event queue (item A). Many
   * adds/removes/edits collapse into ONE pass: drop each region at every tier
   * (so removed / moved objects can't ghost), patch the overview (on-screen) or
   * defer it (off-screen), then a SINGLE requestFrame + scheduleBake. No
   * per-rect synchronous rebuild — the async bake refreshes; the overview
   * covers holes. Nearby rects are merged so a multi-stroke region is one drop;
   * far-apart edits stay separate so we don't over-invalidate the whole span.
   */
  invalidateRegions(rects: WorldRect[]): void {
    if (rects.length === 0) return
    const merged = this.mergeRects(rects)
    let anyInView = false
    for (const rect of merged) {
      this.growContentBounds(rect)
      const tier = this.committed.pickActiveTier(this.surface.getVpt()[0])
      this.committed.dropOtherTiers(rect, tier)  // additive: keep active-tier sharp
      this.committed.markDirty(rect)
      this.patchOverview(rect)
      if (this.intersectsView(rect)) anyInView = true
    }
    if (anyInView) this.requestFrame()
    this.scheduleBake()
  }

  onErase(_eraserObj: T, rect: WorldRect): void {
    const tier = this.committed.pickActiveTier(this.surface.getVpt()[0])
    this.markDirtyAndRebuildSync(rect, tier)
  }

  private destructiveInvalidate(rect: WorldRect): void {
    const vpt = this.surface.getVpt()
    const tier = this.committed.pickActiveTier(vpt[0])
    this.committed.dropAllTiers(rect)
    if (tier > this.committed.overviewTier) {
      const size = this.surface.getSize()
      const dpr = this.surface.getDpr()
      const vw = this.committed.viewWorld(vpt, size, dpr)
      this.committed.rebuildRectSync(rect, tier, vw)
    }
    this.patchOverview(rect)
  }

  dropRegion(rect: WorldRect): void {
    this.destructiveInvalidate(rect)
    if (this.intersectsView(rect)) this.requestFrame()
    this.scheduleBake()
  }

  // ── direct live control ──────────────────────────────────────────────────
  liveAdd(obj: T, mode: LiveMode = 'normal'): boolean {
    const rect = this.boundsOf(obj)
    if (!rect) return false
    if (!this.intersectsView(rect)) return false
    return this.live.add(obj, rect, mode)
  }

  liveRemove(id: string): void {
    this.live.remove(id)
    this.requestFrame()
  }

  markDirty(rect: WorldRect): void {
    this.additiveInvalidate(rect)
    if (this.intersectsView(rect)) this.requestFrame()
    this.scheduleBake()
  }

  markDirtyAndRebuildSync(rect: WorldRect, tier: number): void {
    this.committed.dropOtherTiers(rect, tier)
    this.committed.markDirty(rect)
    if (tier > this.committed.overviewTier) {
      const vpt = this.surface.getVpt()
      const vw = this.committed.viewWorld(vpt, this.surface.getSize(), this.surface.getDpr())
      this.committed.rebuildRectSync(rect, tier, vw)
    }
    this.patchOverview(rect)
    this.requestFrame()
    this.scheduleBake()
  }

  // ── gesture / loading / erase seams ──────────────────────────────────────
  setGesturing(on: boolean): void {
    this.gesturing = on
    if (on) this.abortBakes()
    else {
      this.flushPendingOverview() // regions we panned toward may now be visible
      this.requestFrame()
      this.scheduleBake()
    }
  }

  setLoading(on: boolean): void {
    this.loading = on
    if (on) {
      this.abortBakes()
      this.live.clear()
    }
  }

  setErasing(on: boolean): void {
    this.erasing = on
    if (on) this.abortBakes()
    else {
      this.requestFrame()
      this.scheduleBake()
    }
  }

  pickActiveTier(zoom: number): number {
    return this.committed.pickActiveTier(zoom)
  }

  setContentBounds(rect: WorldRect | null): void {
    this.contentBounds = rect ? { ...rect } : null
  }

  markAllDirty(): void {
    this.committed.markAllDirty()
    this.requestFrame()
    this.scheduleBake()
  }

  warmOverview(): void {
    void this.committed.overview
      .rebuildIfNeeded(this.contentBounds, this.makeYielder() as any, new AbortController().signal)
      .then(() => this.requestFrame())
  }

  /**
   * On-screen edits patch the overview immediately (it's the fallback base
   * layer under not-yet-baked tiles). Off-screen edits DEFER the patch (item
   * C): an invisible region isn't drawn until the user pans there, and the
   * flush points (bake / pan-end) refresh it before those tiles render. Saves
   * an O(objects-in-region) clip+redraw per invisible edit.
   */
  private patchOverview(rect: WorldRect): void {
    if (!this.intersectsView(rect)) {
      this.pendingOverview.push({ ...rect })
      if (this.pendingOverview.length > 256) this.flushPendingOverview()
      return
    }
    if (this.committed.overview.patchRect(rect)) return
    this.committed.overview.markDirty()
    this.scheduleOverviewRebuild()
  }

  private flushPendingOverview(): void {
    if (this.pendingOverview.length === 0) return
    const rects = this.pendingOverview
    this.pendingOverview = []
    let needRebuild = false
    for (const r of rects) {
      if (!this.committed.overview.patchRect(r)) needRebuild = true
    }
    if (needRebuild) {
      this.committed.overview.markDirty()
      this.scheduleOverviewRebuild()
    }
  }

  private scheduleOverviewRebuild(): void {
    if (this.overviewTimer !== null) return
    this.overviewTimer = setTimeout(() => {
      this.overviewTimer = null
      if (this.gesturing || this.loading) {
        this.scheduleOverviewRebuild()
        return
      }
      void this.committed.overview
        .rebuildIfNeeded(this.contentBounds, this.makeYielder() as any, new AbortController().signal)
        .then(() => {
          this.requestFrame()
          this.scheduleBake()
        })
    }, 250)
  }

  isRegionBaked(rect: WorldRect): boolean {
    return this.committed.isRegionReady(rect, this.surface.getVpt()[0])
  }

  reset(): void {
    this.abortBakes()
    if (this.overviewTimer !== null) {
      clearTimeout(this.overviewTimer)
      this.overviewTimer = null
    }
    if (this.remoteRaf) {
      cancelAnimationFrame(this.remoteRaf)
      this.remoteRaf = 0
    }
    this.pendingRemote = null
    this.pendingOverview = []
    this.live.clear()
    this.committed.reset()
    this.contentBounds = null
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private boundsOf(obj: T): WorldRect | null {
    try {
      const b = obj.getBoundingRect(true, true)
      if (!isFinite(b.left) || b.width <= 0 || b.height <= 0) return null
      return { x: b.left, y: b.top, w: b.width, h: b.height }
    } catch {
      return null
    }
  }

  private cachedViewWorld: WorldRect | null = null
  private viewWorldFrame = -1
  private frameCounter = 0

  private getViewWorld(): WorldRect {
    if (this.viewWorldFrame !== this.frameCounter || !this.cachedViewWorld) {
      this.cachedViewWorld = this.committed.viewWorld(
        this.surface.getVpt(), this.surface.getSize(), this.surface.getDpr())
      this.viewWorldFrame = this.frameCounter
    }
    return this.cachedViewWorld
  }

  private intersectsView(r: WorldRect): boolean {
    const v = this.getViewWorld()
    return !(r.x + r.w < v.x || r.x > v.x + v.w || r.y + r.h < v.y || r.y > v.y + v.h)
  }

  private union(a: WorldRect, b: WorldRect): WorldRect {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h)
    return { x, y, w: x2 - x, h: y2 - y }
  }

  /** Merge overlapping / near rects; far-apart rects stay separate. Pathological
   *  batches (>64 rects) collapse to one bounding union. */
  private mergeRects(rects: WorldRect[]): WorldRect[] {
    if (rects.length <= 1) return rects.map((r) => ({ ...r }))
    if (rects.length > 64) {
      let u = rects[0]
      for (let i = 1; i < rects.length; i++) u = this.union(u, rects[i])
      return [u]
    }
    const out: WorldRect[] = []
    for (const r of rects) {
      let merged = false
      for (let i = 0; i < out.length; i++) {
        if (this.nearOrOverlap(out[i], r)) {
          out[i] = this.union(out[i], r)
          merged = true
          break
        }
      }
      if (!merged) out.push({ ...r })
    }
    return out
  }

  private nearOrOverlap(a: WorldRect, b: WorldRect): boolean {
    const pad = 16
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
      a.y + a.h + pad < b.y || b.y + b.h + pad < a.y)
  }

  private growContentBounds(r: WorldRect): void {
    if (!this.contentBounds) {
      this.contentBounds = { ...r }
      return
    }
    const c = this.contentBounds
    const x = Math.min(c.x, r.x), y = Math.min(c.y, r.y)
    const x2 = Math.max(c.x + c.w, r.x + r.w), y2 = Math.max(c.y + c.h, r.y + r.h)
    this.contentBounds = { x, y, w: x2 - x, h: y2 - y }
  }

  private additiveInvalidate(rect: WorldRect): void {
    const tier = this.committed.pickActiveTier(this.surface.getVpt()[0])
    this.committed.dropOtherTiers(rect, tier)
    this.committed.markDirty(rect)
    this.patchOverview(rect)
  }

  get minZoom(): number {
    return this.committed.minUsableZoom
  }

  get maxZoom(): number {
    return this.committed.maxUsableZoom
  }
}