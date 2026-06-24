// renderCore.ts
//
// The orchestrator. It owns the frame loop and the bake loop and exposes a
// small set of lifecycle hooks that the store delegates to. The entire mental
// model is three lines:
//
//   • in-flight object        → live layer (rendered directly, never baked)
//   • settled / changed object → index + markDirty(region)  (committed rebuilds)
//   • every frame             → committed.composite() then live.composite()
//
// There is no additive patching, no subtractive-erase patching, no overheat
// tracking, no giant-object guard, no modify-storm/overlay branching, no cross-
// tier fallback. Those all lived to paper over in-place tile mutation; with
// rebuild-only tiles they simply don't exist.
//
// SEAMS (wire these from the store, which still owns the quadtree, gesture
// store, localTransform, remoteOverlay, eraser): call setGesturing() around
// gestures, abortBakes() on zoom change, and the on*/live* hooks from the
// corresponding fabric events. Everything the core needs from the outside is a
// read-only Surface + the spatial index.

import {
  CommittedLayer, type Bounded, type CommittedOptions,
  type SpatialIndex, type TileRenderer, type WorldRect, type Yieldable
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
  /** Called after each composite so the store can redraw selection controls etc. */
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
    const ctx = this.surface.getContext()
    if (!ctx) return
    const vpt = this.surface.getVpt()
    const size = this.surface.getSize()
    const dpr = this.surface.getDpr()
    const { needsBake } = this.committed.composite(ctx, vpt, size, dpr, this.surface.getBackground())
    const vw = this.committed.viewWorld(vpt, size, dpr)
    this.live.composite(ctx, vpt, dpr, this.liveRender, vw)
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

  private async runBake(): Promise<void> {
    if (this.gesturing || this.loading || this.erasing) return
    if (this.baking) {
      this.bakeAgain = true
      return
    }
    this.baking = true
    this.bakeAgain = false
    // NOTE: we do NOT abort a previous bake here. A bake is only ever aborted
    // by an explicit gesture/zoom/reset (abortBakes). New edits ride bakeAgain.
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
      } // ← was: bakeAgain = false; return
      return
    }
    this.demoteSettled()
    this.requestFrame()
    if (this.bakeAgain) {
      this.bakeAgain = false
      this.scheduleBake()
    }
  }

  /** Hand finished objects off from live → committed once their tiles are fresh. */
  private demoteSettled(): void {
    if (this.live.isEmpty()) return
    if (this.committed.overview.isDirty()) return
    const zoom = this.surface.getVpt()[0]
    const ids = this.live.settledIds((rect) => this.committed.isRegionReady(rect, zoom))
    for (const id of ids) this.live.remove(id)
  }

  // ── lifecycle hooks (store delegates fabric events here) ─────────────────
  /** A new object exists in the index. Show it instantly, commit it lazily. */
  onObjectAdded(obj: T): void {
    const rect = this.boundsOf(obj)
    if (!rect) return
    this.growContentBounds(rect)
    this.additiveInvalidate(rect)
    this.live.add(obj, rect, 'normal')
    this.requestFrame()
    this.scheduleBake()
  }

  /** An object was removed. Drop its footprint so it can't ghost at any zoom. */
  onObjectRemoved(obj: T, oldRect?: WorldRect): void {
    const rect = oldRect ?? this.boundsOf(obj)
    if (obj.id) this.live.remove(obj.id)
    if (rect) this.destructiveInvalidate(rect)
    this.requestFrame()
    this.scheduleBake()
  }

  onObjectChanged(obj: T, oldRect?: WorldRect): void {
    const rect = this.boundsOf(obj)
    if (oldRect) this.destructiveInvalidate(oldRect)
    if (rect) {
      this.growContentBounds(rect)
      this.additiveInvalidate(rect)
    }
    this.requestFrame()
    this.scheduleBake()
  }

  /**
   * Erase. The stroke clips committed objects; drop the region (so the hole
   * shows the correct, localized-patched overview instantly) and rebake the
   * now-clipped objects sharp.
   */
  onErase(eraserObj: T, rect: WorldRect): void {
    const vpt = this.surface.getVpt();
    const tier = this.committed.pickActiveTier(vpt[0]);

    this.markDirtyAndRebuildSync(rect, tier);
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
    this.requestFrame()
    this.scheduleBake()
  }

  // ── direct live control (store wires drag begin/end here) ────────────────
  liveAdd(obj: T, mode: LiveMode = 'normal'): boolean {
    const rect = this.boundsOf(obj)
    if (!rect) return false
    return this.live.add(obj, rect, mode)
  }

  liveRemove(id: string): void {
    this.live.remove(id)
    this.requestFrame()
  }

  markDirty(rect: WorldRect): void {
    this.additiveInvalidate(rect)
    this.requestFrame()
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

  // ── gesture / loading seams ──────────────────────────────────────────────
  setGesturing(on: boolean): void {
    this.gesturing = on
    if (on) this.abortBakes()
    else {
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

  /**
   * While an erase STROKE is in progress, the @erase2d brush owns the canvas's
   * lower context — it post-composites destination-out after every render. If
   * our async compositor also repaints that context on its own rAF cadence,
   * the two race and the erase preview flickers. So we suspend compositing for
   * the duration of the stroke (requestFrame is a no-op) and do ONE clean
   * markDirty + rebake when the stroke ends via onErase.
   */
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

  /** Set the world bounds used to size/rebuild the overview (from the index). */
  setContentBounds(rect: WorldRect | null): void {
    this.contentBounds = rect ? { ...rect } : null
  }

  /** Invalidate every committed tile + the overview (used by reset / bulk load). */
  markAllDirty(): void {
    this.committed.markAllDirty()
    this.requestFrame()
    this.scheduleBake()
  }

  /** Eagerly build the overview so the base layer is present from frame one. */
  warmOverview(): void {
    void this.committed.overview
      .rebuildIfNeeded(this.contentBounds, this.makeYielder(), new AbortController().signal)
      .then(() => this.requestFrame())
  }

  /**
   * Keep the overview correct for a changed region. Localized patch (cheap,
   * synchronous) when the region is inside coverage; only when content has
   * grown beyond coverage do we fall back to a debounced full re-fit rebuild.
   */
  private patchOverview(rect: WorldRect): void {
    if (this.committed.overview.patchRect(rect)) return // common: O(local)
    this.committed.overview.markDirty()
    this.scheduleOverviewRebuild() // rare: content grew → re-fit
  }

  /**
   * Debounced full overview rebuild — ONLY for growth / first build. Not used
   * for ordinary edits (those go through patchOverview), so it can never become
   * the per-edit O(N) bottleneck.
   */
  private scheduleOverviewRebuild(): void {
    if (this.overviewTimer !== null) return
    this.overviewTimer = setTimeout(() => {
      this.overviewTimer = null
      if (this.gesturing || this.loading) {
        this.scheduleOverviewRebuild()
        return
      }
      void this.committed.overview
        .rebuildIfNeeded(this.contentBounds, this.makeYielder(), new AbortController().signal)
        .then(() => {
          this.requestFrame()
          this.scheduleBake()
        })
    }, 250)
  }

  /** True if the committed tiles covering rect are baked (used by the drag
   *  controller to hide its GPU layer only once the new position is ready). */
  isRegionBaked(rect: WorldRect): boolean {
    return this.committed.isRegionReady(rect, this.surface.getVpt()[0])
  }

  reset(): void {
    this.abortBakes()
    if (this.overviewTimer !== null) {
      clearTimeout(this.overviewTimer)
      this.overviewTimer = null
    }
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
}