// liveLayer.ts
//
// The LIVE layer holds the handful of objects that are currently in flight:
// your active stroke, strokes that just arrived from other people, the object
// you are dragging, an in-progress eraser stroke. They are rendered DIRECTLY
// on top of the committed tiles every frame — never baked, never patched.
//
// This is what replaces additive patching. Because the set is always small and
// bounded (LIVE_MAX), drawing it per frame is cheap even on low-end devices and
// even with many simultaneous collaborators. An item is handed off to the
// committed layer (and dropped here) only once the committed tiles covering it
// are fresh, so there is never a pop or a double-render at the boundary.

import type { Bounded, WorldRect } from "./committedLayer";

export type LiveMode = "normal" | "erase";

interface LiveItem<T> {
  obj: T;
  mode: LiveMode;
  rect: WorldRect;
  addedAt: number;
}

export type LiveRenderer<T> = (
  ctx: CanvasRenderingContext2D,
  obj: T,
  mode: LiveMode,
) => void;

export class LiveLayer<T extends Bounded> {
  private items = new Map<string, LiveItem<T>>();
  private readonly MAX: number;

  constructor(opts: { max?: number } = {}) {
    this.MAX = opts.max ?? 64;
  }

  /** @returns false if the layer is full (caller should rely on committed/overview). */
  add(obj: T, rect: WorldRect, mode: LiveMode = "normal"): boolean {
    if (!obj.id) return false;
    if (!this.items.has(obj.id) && this.items.size >= this.MAX) return false;
    this.items.set(obj.id, { obj, mode, rect, addedAt: performance.now() });
    return true;
  }
  remove(id: string): void {
    this.items.delete(id);
  }
  has(id: string): boolean {
    return this.items.has(id);
  }
  get size(): number {
    return this.items.size;
  }
  isEmpty(): boolean {
    return this.items.size === 0;
  }
  clear(): void {
    this.items.clear();
  }

  /** Items whose covering tiles are now ready, so they can be demoted. */
  settledIds(isReady: (rect: WorldRect) => boolean): string[] {
    const out: string[] = [];
    for (const [id, it] of this.items)
      if (it.mode === "normal" && isReady(it.rect)) out.push(id);
    // erase-mode items are transient; demote them once their region is ready too
    for (const [id, it] of this.items)
      if (it.mode === "erase" && isReady(it.rect)) out.push(id);
    return out;
  }

  /** Render all live items in world space on top of an already-composited frame. */
  composite(
    ctx: CanvasRenderingContext2D,
    vpt: number[],
    dpr: number,
    render: LiveRenderer<T>,
  ): void {
    if (this.items.size === 0) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    for (const it of this.items.values()) {
      ctx.save();
      if (it.mode === "erase") ctx.globalCompositeOperation = "destination-out";
      try {
        render(ctx, it.obj, it.mode);
      } catch {
        /* ignore */
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
