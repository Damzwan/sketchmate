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
	RemoteOverview,
	SpatialIndex,
	TileRenderer,
	WorldRect,
	Yieldable,
} from "./committedLayer";
import { Yielder } from "@/draw/scheduling/yielder";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import { chooseOverviewDimensions } from "./overviewSizing";

interface OverviewOptions {
	px?: number;
	targetDensity?: number;
	renderChunk?: number;
	remoteOverview?: RemoteOverview<any>;
}

export class WorldOverview<T extends Bounded> {
	private readonly PIXEL_BUDGET_EDGE: number;
	private readonly TARGET_DENSITY: number;
	private readonly CHUNK: number;
	private readonly index: SpatialIndex<T>;
	private readonly renderer: TileRenderer<T>;
	private readonly remoteOverview?: RemoteOverview<T>;

	private canvas: OffscreenCanvas | null = null;
	private ctx: OffscreenCanvasRenderingContext2D | null = null;
	private bounds: WorldRect | null = null; // world region the bitmap covers
	private sx = 1;
	private sy = 1; // world → overview px
	private dirty = true;
	private dirtyRevision = 1;
	private rebuildInFlight: Promise<void> | null = null;

	constructor(
		index: SpatialIndex<T>,
		renderer: TileRenderer<T>,
		opts: OverviewOptions = {},
	) {
		this.index = index;
		this.renderer = renderer;
		this.PIXEL_BUDGET_EDGE = opts.px ?? 2048;
		this.TARGET_DENSITY = opts.targetDensity ?? 0.5;
		this.CHUNK = opts.renderChunk ?? 128;
		this.remoteOverview = opts.remoteOverview;
	}

	markDirty(): void {
		this.dirty = true;
		this.dirtyRevision++;
	}

	isDirty(): boolean {
		return this.dirty || !this.canvas;
	}

	/** Incrementally fold one freshly-committed object into the overview. */
	add(obj: T): void {
		if (!this.canvas || !this.ctx || !this.bounds) {
			this.markDirty();
			return;
		}
		const b = obj.getBoundingRect(true, true);
		const r: WorldRect = { x: b.left, y: b.top, w: b.width, h: b.height };
		// Object outside current coverage → grow lazily via full rebuild.
		if (!this.contains(this.bounds, r)) {
			this.markDirty();
			return;
		}
		this.paintOne(this.ctx, obj);
	}

	/**
	 * Punch one eraser stroke into the overview. The stroke's own
	 * globalCompositeOperation (destination-out) applies during render, so this
	 * is exact at overview resolution — the overview stays NOT dirty.
	 * Returns false if no bitmap exists yet (caller falls back to markDirty).
	 */
	eraseObject(obj: T): boolean {
		if (!this.canvas || !this.ctx || !this.bounds) return false;
		this.paintOne(this.ctx, obj);
		return true;
	}

	/** Destination-out the eraser stroke into the overview (approximate). */
	erase(renderEraser: (ctx: OffscreenCanvasRenderingContext2D) => void): void {
		if (!this.ctx || !this.bounds) return;
		const ctx = this.ctx;
		ctx.save();
		this.applyWorldTransform(ctx);
		ctx.globalCompositeOperation = "destination-out";
		try {
			renderEraser(ctx);
		} catch {
			/* approximation; ignore */
		}
		ctx.restore();
	}

	/**
	 * LOCALIZED rebuild: clear `rect` in the overview and redraw exactly that
	 * region from the index. This keeps the overview a correct function of
	 * current content (handles add / remove / move / erase / undo uniformly)
	 * WITHOUT an O(N) full redraw — cost is O(objects intersecting rect).
	 *
	 * Returns false if the overview isn't built yet, `rect` isn't fully inside
	 * coverage (content grew), or more than `maxObjects` intersect the region —
	 * a dense patch is a synchronous N-object render, and the async yielded
	 * full rebuild is cheaper than janking the frame. Caller rebuilds on false.
	 */
	patchRect(rect: WorldRect, maxObjects = Infinity): boolean {
		if (!this.canvas || !this.ctx || !this.bounds) return false;
		if (!this.contains(this.bounds, rect)) return false;
		// Timed: this is a SYNCHRONOUS re-render of every object in the rect, and its
		// cost tracks brush weight (`objectCaching` is off during a bake render, so a
		// watercolor path is stroked in full every time).
		const __t0 = performance.now();
		const ctx = this.ctx;

		// Pad by ~2 overview-px (in world units) so stroke width / AA at the
		// region edges is fully cleared and redrawn — no half-erased seams.
		const mx = 2 / this.sx,
			my = 2 / this.sy;
		const r: WorldRect = {
			x: rect.x - mx,
			y: rect.y - my,
			w: rect.w + 2 * mx,
			h: rect.h + 2 * my,
		};

		// Query BEFORE clearing — bail out density check must not leave a hole.
		// Gate on VISIBLE objects only: the transform controller hides a dragged
		// selection via opacity=0 while it's still indexed at the old position, so
		// counting hidden objects made every big-selection drag defer this patch
		// to the async rebuild — leaving a ghost at the vacated spot. Invisible
		// objects cost nothing to "render" (fabric skips them), so they must not
		// trip the cost gate; dropping them from the loop too skips the no-ops.
		const objects = this.index
			.query(r)
			.filter((o: any) => o.visible !== false && o.opacity !== 0);
		if (objects.length > maxObjects) {
			recordPhase("overviewPatch", performance.now() - __t0);
			return false;
		}

		// Clear the sub-rect (identity space).
		const cx = (r.x - this.bounds.x) * this.sx;
		const cy = (r.y - this.bounds.y) * this.sy;
		const cw = r.w * this.sx,
			ch = r.h * this.sy;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(cx, cy, cw, ch);
		ctx.restore();

		// Redraw objects intersecting r, clipped to r (z-ordered by the index).
		ctx.save();
		this.applyWorldTransform(ctx);
		ctx.beginPath();
		ctx.rect(r.x, r.y, r.w, r.h);
		ctx.clip();
		for (let i = 0; i < objects.length; i++) {
			try {
				this.renderer(ctx as any, objects[i], Math.max(this.sx, this.sy));
			} catch {
				/* ignore */
			}
		}
		ctx.restore();
		recordPhase("overviewPatch", performance.now() - __t0);
		return true;
	}

	async rebuildIfNeeded(
		contentBounds: WorldRect | null,
		yielder: Yielder,
		signal: AbortSignal,
	): Promise<void> {
		if (!contentBounds || contentBounds.w <= 0 || contentBounds.h <= 0) return;
		const fits =
			this.canvas && this.bounds && this.contains(this.bounds, contentBounds);
		if (!this.dirty && fits) return;

		// Coalesce callers. Loading, reset and the regular warm path used to start
		// separate full-scene renders against separate temp canvases. If content is
		// dirtied while the shared build runs, the revision check below preserves
		// that dirtiness and the waiting caller may start one follow-up build.
		if (this.rebuildInFlight) {
			await this.rebuildInFlight;
			if (signal.aborted) return;
			const stillFits =
				this.canvas && this.bounds && this.contains(this.bounds, contentBounds);
			if (this.dirty || !stillFits) {
				return this.rebuildIfNeeded(contentBounds, yielder, signal);
			}
			return;
		}

		const task = this.performRebuild(contentBounds, yielder, signal);
		this.rebuildInFlight = task;
		try {
			await task;
		} finally {
			if (this.rebuildInFlight === task) this.rebuildInFlight = null;
		}
	}

	private async performRebuild(
		contentBounds: WorldRect,
		yielder: Yielder,
		signal: AbortSignal,
	): Promise<void> {
		const buildRevision = this.dirtyRevision;
		const __t0 = performance.now();
		const pad = 0.15;
		const bounds: WorldRect = {
			x: contentBounds.x - contentBounds.w * pad,
			y: contentBounds.y - contentBounds.h * pad,
			w: contentBounds.w * (1 + 2 * pad),
			h: contentBounds.h * (1 + 2 * pad),
		};
		const { width, height } = chooseOverviewDimensions(
			bounds,
			this.TARGET_DENSITY,
			this.PIXEL_BUDGET_EDGE,
		);

		// Build into a TEMP canvas. The currently-displayed overview stays untouched
		// until we swap atomically at the end — never cleared mid-repaint.
		const tmp = new OffscreenCanvas(width, height);
		const tctx = tmp.getContext("2d");
		if (!tctx) return;
		const sx = width / bounds.w;
		const sy = height / bounds.h;
		const minPx = 0.75;

		// Objects big enough to leave a mark at overview resolution, z-ordered.
		//
		// This filter was a SYNCHRONOUS, un-yielded, un-abortable O(all objects)
		// loop, and `getBoundingRect(true, true)` recomputes the object's coords
		// rather than reading them — so on a big board it was a single multi-hundred
		// ms main-thread block before the (properly yielded) render even started.
		// That block is what a gesture ran into right after loading a heavy drawing.
		//
		// `queryBounds` gets the same rects from the spatial index, which already
		// tracks them, so the recompute disappears entirely. Where the index doesn't
		// offer it we keep the old call but yield through the loop.
		const withBounds = this.index.queryBounds?.(bounds);
		const visible: T[] = [];
		if (withBounds) {
			for (let i = 0; i < withBounds.length; i++) {
				const b = withBounds[i].bounds;
				if (b.w * sx >= minPx || b.h * sy >= minPx)
					visible.push(withBounds[i].obj);
			}
		} else {
			const objects = this.index.query(bounds);
			yielder.reset();
			for (let i = 0; i < objects.length; i++) {
				const b = objects[i].getBoundingRect(true, true);
				if (b.width * sx >= minPx || b.height * sy >= minPx)
					visible.push(objects[i]);
				if ((i & 127) === 127) {
					await yielder.maybeYield();
					if (signal.aborted) return;
				}
			}
		}
		if (signal.aborted) return;

		// Worker path: render the whole board off the main thread (the O(N) render
		// was the main-thread stall on big boards). Strokes bake in the worker;
		// text / images come back in `skipped` and are overlaid locally below.
		if (this.remoteOverview) {
			// Any failure in here (worker unavailable, timeout, bad bitmap) must fall
			// through to the local render — never leave the overview unbuilt, or the
			// far-zoom base layer stays blank until the user interacts.
			try {
				const remote = await this.remoteOverview(
					visible,
					bounds,
					width,
					height,
					Math.max(sx, sy),
				);
				if (signal.aborted) {
					remote?.bitmap.close();
					return;
				}
				if (remote) {
					tctx.setTransform(1, 0, 0, 1, 0, 0);
					tctx.clearRect(0, 0, width, height);
					tctx.drawImage(remote.bitmap, 0, 0);
					remote.bitmap.close();
					if (remote.skipped.length) {
						tctx.save();
						tctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy);
						for (let i = 0; i < remote.skipped.length; i++) {
							try {
								this.renderer(tctx as any, remote.skipped[i], Math.max(sx, sy));
							} catch {
								/* ignore */
							}
						}
						tctx.restore();
					}
					this.canvas = tmp;
					this.ctx = tctx;
					this.bounds = bounds;
					this.sx = sx;
					this.sy = sy;
					this.dirty = this.dirtyRevision !== buildRevision;
					return;
				}
			} catch {
				/* fall through to local render */
			}
			// null / threw → local render below.
		}

		tctx.setTransform(1, 0, 0, 1, 0, 0);
		tctx.clearRect(0, 0, width, height);
		tctx.save();
		tctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy);

		yielder.reset();
		for (let i = 0; i < visible.length; i++) {
			try {
				this.renderer(tctx as any, visible[i], Math.max(sx, sy));
			} catch {
				/* ignore */
			}
			await yielder.maybeYield();
			if (signal.aborted) {
				tctx.restore();
				return;
			} // discard temp, keep old overview visible
		}
		tctx.restore();

		// Atomic swap.
		this.canvas = tmp;
		this.ctx = tctx;
		this.bounds = bounds;
		this.sx = sx;
		this.sy = sy;
		this.dirty = this.dirtyRevision !== buildRevision;
		// WALL CLOCK, not CPU: this loop yields, so a large number here means the
		// rebuild spanned many frames, not that it blocked for that long. The
		// per-frame cost is bounded by the yielder's budget. `longTasks` is the
		// check for whether it actually blocked.
		recordPhase("overviewBuild", performance.now() - __t0);
	}

	/** Draw the overview region matching the viewport into ctx (screen space). */
	composite(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		vpt: number[],
		px: { w: number; h: number },
		dpr: number,
		vw: WorldRect,
	): void {
		if (!this.canvas || !this.bounds) return;
		const inter = this.intersect(vw, this.bounds);
		if (!inter) return;

		// source rect in overview px
		const srcX = (inter.x - this.bounds.x) * this.sx;
		const srcY = (inter.y - this.bounds.y) * this.sy;
		const srcW = inter.w * this.sx;
		const srcH = inter.h * this.sy;
		// dest rect in device px via vpt
		const a = vpt[0] * dpr,
			d = vpt[3] * dpr,
			e = vpt[4] * dpr,
			f = vpt[5] * dpr;
		// Destination snapped OUTWARD by up to a pixel. This is drawn as the base
		// under uncovered tile cells and is clipped to exactly those cells, so
		// growing it cannot leak — while leaving it fractional put an
		// antialiased edge against transparent right where a tile boundary is,
		// i.e. the thin background-coloured lines seen during a bake.
		const dx = Math.floor(inter.x * a + e),
			dy = Math.floor(inter.y * d + f);
		const dw = Math.ceil((inter.x + inter.w) * a + e) - dx,
			dh = Math.ceil((inter.y + inter.h) * d + f) - dy;
		if (srcW <= 0 || srcH <= 0 || dw <= 0 || dh <= 0) return;

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = true;
		// @ts-ignore
		ctx.imageSmoothingQuality = "low";
		ctx.drawImage(this.canvas, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
		ctx.restore();
	}

	reset(): void {
		this.canvas = null;
		this.ctx = null;
		this.bounds = null;
		this.markDirty();
	}

	// ── helpers ──────────────────────────────────────────────────────────────
	private applyWorldTransform(ctx: OffscreenCanvasRenderingContext2D) {
		if (!this.bounds) return;
		ctx.setTransform(
			this.sx,
			0,
			0,
			this.sy,
			-this.bounds.x * this.sx,
			-this.bounds.y * this.sy,
		);
	}

	private paintOne(ctx: OffscreenCanvasRenderingContext2D, obj: T) {
		ctx.save();
		this.applyWorldTransform(ctx);
		try {
			this.renderer(ctx as any, obj, Math.max(this.sx, this.sy));
		} catch {
			/* ignore */
		}
		ctx.restore();
	}

	private contains(o: WorldRect, i: WorldRect): boolean {
		return (
			i.x >= o.x &&
			i.y >= o.y &&
			i.x + i.w <= o.x + o.w &&
			i.y + i.h <= o.y + o.h
		);
	}

	private intersect(a: WorldRect, b: WorldRect): WorldRect | null {
		const x1 = Math.max(a.x, b.x),
			y1 = Math.max(a.y, b.y);
		const x2 = Math.min(a.x + a.w, b.x + b.w),
			y2 = Math.min(a.y + a.h, b.y + b.h);
		if (x2 <= x1 || y2 <= y1) return null;
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
	}
}
