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
import {
	recordPhase,
	recordSyncRepairDeclined,
} from "@/draw/rendering/renderMetrics";
import { estimateRenderCost } from "@/draw/rendering/renderCost";
import { chooseOverviewDimensions } from "./overviewSizing";

interface OverviewOptions {
	px?: number;
	targetDensity?: number;
	renderChunk?: number;
	remoteOverview?: RemoteOverview<any>;
	/** Cost ceiling for one synchronous `patchRect`. See renderCost.ts. */
	syncCostBudget?: number;
}

export class WorldOverview<T extends Bounded> {
	private readonly PIXEL_BUDGET_EDGE: number;
	private readonly TARGET_DENSITY: number;
	private readonly CHUNK: number;
	private readonly SYNC_COST_BUDGET: number;
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
		this.SYNC_COST_BUDGET = opts.syncCostBudget ?? Infinity;
		this.remoteOverview = opts.remoteOverview;
	}

	markDirty(): void {
		this.dirty = true;
		this.dirtyRevision++;
	}

	usesRemoteRenderer(): boolean {
		return this.remoteOverview !== undefined;
	}

	/**
	 * Does the bitmap cover this region at all? A `patchRect` failure has two
	 * very different causes — "too many objects here" (subdivide) and "this is
	 * outside what the bitmap maps" (only a rebuild can fix it, since the
	 * mapping itself has to grow). Callers that subdivide MUST check this first,
	 * or they split a region into pieces that can never be patched.
	 */
	covers(rect: WorldRect): boolean {
		if (!this.canvas || !this.bounds) return false;
		return this.contains(this.bounds, rect);
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
		const desired: WorldRect = {
			x: rect.x - mx,
			y: rect.y - my,
			w: rect.w + 2 * mx,
			h: rect.h + 2 * my,
		};
		// Snap the clear + clip to WHOLE OVERVIEW PIXELS. At fractional boundaries
		// Canvas antialiases the clip against transparency; the untouched pixels on
		// the other side do not add back to full coverage, leaving a pale line that
		// becomes a conspicuous white seam when the overview is upscaled on mobile.
		const px0 = Math.max(0, Math.floor((desired.x - this.bounds.x) * this.sx));
		const py0 = Math.max(0, Math.floor((desired.y - this.bounds.y) * this.sy));
		const px1 = Math.min(
			this.canvas.width,
			Math.ceil((desired.x + desired.w - this.bounds.x) * this.sx),
		);
		const py1 = Math.min(
			this.canvas.height,
			Math.ceil((desired.y + desired.h - this.bounds.y) * this.sy),
		);
		if (px1 <= px0 || py1 <= py0) return true;
		const r: WorldRect = {
			x: this.bounds.x + px0 / this.sx,
			y: this.bounds.y + py0 / this.sy,
			w: (px1 - px0) / this.sx,
			h: (py1 - py0) / this.sy,
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
		// A COUNT cap does not bound cost: `maxObjects` pencil lines and the same
		// number of watercolour strokes differ by orders of magnitude, and one
		// heavily erased object can exceed both on its own. This loop cannot yield,
		// so the honest gate is estimated work. Declining is already the supported
		// outcome — the caller falls back to the yielded async rebuild.
		if (this.SYNC_COST_BUDGET !== Infinity) {
			const cost = estimateRenderCost(objects, this.SYNC_COST_BUDGET);
			if (cost > this.SYNC_COST_BUDGET) {
				recordSyncRepairDeclined(cost);
				recordPhase("overviewPatch", performance.now() - __t0);
				return false;
			}
		}

		// Clear the sub-rect (identity space).
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(px0, py0, px1 - px0, py1 - py0);
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
		const discardTmp = () => {
			// Dropping the JS reference leaves backing-store reclamation to GC, which
			// is far too late under Android WebView memory pressure. Resizing to zero
			// releases the raster allocation immediately.
			tmp.width = 0;
			tmp.height = 0;
		};
		if (!tctx) {
			discardTmp();
			return;
		}
		const sx = width / bounds.w;
		const sy = height / bounds.h;
		const minPx = 0.75;
		const commitTmp = () => {
			const previous = this.canvas;
			this.canvas = tmp;
			this.ctx = tctx;
			this.bounds = bounds;
			this.sx = sx;
			this.sy = sy;
			this.dirty = this.dirtyRevision !== buildRevision;
			if (previous && previous !== tmp) {
				previous.width = 0;
				previous.height = 0;
			}
		};

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
		yielder.reset();
		if (withBounds) {
			for (let i = 0; i < withBounds.length; i++) {
				const b = withBounds[i].bounds;
				if (b.w * sx >= minPx || b.h * sy >= minPx)
					visible.push(withBounds[i].obj);
				// Reading cached bounds is cheap, so checking once per block retains
				// throughput. The loop is still O(scene), though, and a 50k-object board
				// must not delay the first touch event just because no bounds are being
				// recomputed.
				if ((i & 255) === 255) {
					await yielder.maybeYield();
					if (signal.aborted) {
						discardTmp();
						return;
					}
				}
			}
		} else {
			const objects = this.index.query(bounds);
			for (let i = 0; i < objects.length; i++) {
				const b = objects[i].getBoundingRect(true, true);
				if (b.width * sx >= minPx || b.height * sy >= minPx)
					visible.push(objects[i]);
				if ((i & 127) === 127) {
					await yielder.maybeYield();
					if (signal.aborted) {
						discardTmp();
						return;
					}
				}
			}
		}
		if (signal.aborted) {
			discardTmp();
			return;
		}

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
					discardTmp();
					return;
				}
				if (remote) {
					const resultCommitStartedAt = performance.now();
					tctx.setTransform(1, 0, 0, 1, 0, 0);
					tctx.clearRect(0, 0, width, height);
					tctx.drawImage(remote.bitmap, 0, 0);
					remote.bitmap.close();
					recordPhase(
						"overviewResultCommit",
						performance.now() - resultCommitStartedAt,
					);
					if (remote.skipped.length) {
						tctx.save();
						tctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy);
						for (let i = 0; i < remote.skipped.length; i++) {
							const overlayStartedAt = performance.now();
							try {
								this.renderer(tctx as any, remote.skipped[i], Math.max(sx, sy));
							} catch {
								/* ignore */
							}
							recordPhase(
								"overviewOverlayObject",
								performance.now() - overlayStartedAt,
							);
							await yielder.maybeYield();
							if (signal.aborted) {
								tctx.restore();
								discardTmp();
								return;
							}
						}
						tctx.restore();
					}
					commitTmp();
					return;
				}
			} catch {
				/* fall through to local render */
			}
			// A cancelled, superseded, or temporarily busy worker should not turn
			// into a full-scene main-thread render. Keep the last coherent bitmap
			// and remain dirty; the coordinator will re-arm this rebuild.
			if (this.canvas) {
				this.dirty = true;
				discardTmp();
				return;
			}
			// Initial load has no fallback bitmap yet, so retain the yielded local
			// path below as the final correctness fallback.
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
				discardTmp();
				return;
			} // discard temp, keep old overview visible
		}
		tctx.restore();

		// Atomic swap.
		commitTmp();
		// WALL CLOCK, not CPU: this loop yields, so a large number here means the
		// rebuild spanned many frames, not that it blocked for that long. The
		// per-frame cost is bounded by the yielder's budget. `longTasks` is the
		// check for whether it actually blocked.
		recordPhase("overviewBuild", performance.now() - __t0);
	}

	/**
	 * Copy the current low-resolution world overview into a small draft preview.
	 *
	 * This deliberately does not rebuild or enliven the scene. The overview is
	 * already the engine's coherent whole-board fallback, so reusing it avoids a
	 * second Fabric scene (and a second copy of every serialized object) during
	 * autosave. The copy into `output` happens synchronously; the engine may then
	 * be destroyed while `convertToBlob` finishes encoding that private canvas.
	 */
	createThumbnailBlob(
		contentBounds: WorldRect | null,
		maxSize: number,
		quality: number,
		background = "#ffffff",
	): Promise<Blob | null> {
		const copyStartedAt = performance.now();
		if (
			!this.canvas ||
			!this.bounds ||
			this.canvas.width <= 0 ||
			this.canvas.height <= 0 ||
			maxSize <= 0
		) {
			return Promise.resolve(null);
		}

		const content = contentBounds
			? this.intersect(contentBounds, this.bounds)
			: this.bounds;
		if (!content || content.w <= 0 || content.h <= 0)
			return Promise.resolve(null);

		// Keep a little breathing room around the drawing, while never sampling
		// outside the overview bitmap (which would add transparent edge pixels).
		const padX = Math.max(content.w * 0.05, 2 / this.sx);
		const padY = Math.max(content.h * 0.05, 2 / this.sy);
		const framed = this.intersect(
			{
				x: content.x - padX,
				y: content.y - padY,
				w: content.w + padX * 2,
				h: content.h + padY * 2,
			},
			this.bounds,
		);
		if (!framed) return Promise.resolve(null);

		const aspect = framed.w / framed.h;
		const width = Math.max(
			1,
			Math.round(aspect >= 1 ? maxSize : maxSize * aspect),
		);
		const height = Math.max(
			1,
			Math.round(aspect >= 1 ? maxSize / aspect : maxSize),
		);
		const output = new OffscreenCanvas(width, height);
		const ctx = output.getContext("2d");
		if (!ctx) {
			output.width = 0;
			output.height = 0;
			return Promise.resolve(null);
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, width, height);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(
			this.canvas,
			(framed.x - this.bounds.x) * this.sx,
			(framed.y - this.bounds.y) * this.sy,
			framed.w * this.sx,
			framed.h * this.sy,
			0,
			0,
			width,
			height,
		);
		recordPhase("draftThumbnailCopy", performance.now() - copyStartedAt);

		const convert = (
			output as OffscreenCanvas & {
				convertToBlob?: (options: {
					type: string;
					quality: number;
				}) => Promise<Blob>;
			}
		).convertToBlob;
		if (!convert) {
			output.width = 0;
			output.height = 0;
			return Promise.resolve(null);
		}

		return convert
			.call(output, { type: "image/webp", quality })
			.catch(() => null)
			.finally(() => {
				// Release the temporary backing store deterministically on WebView.
				output.width = 0;
				output.height = 0;
			});
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
		// Snapped OUTWARD by up to a pixel: this is the base under uncovered tile
		// cells and is clipped to exactly those cells, so growing it cannot leak,
		// while a fractional edge puts antialiasing against transparent right at a
		// tile boundary — the thin background-coloured line seen during a bake.
		//
		// The SOURCE rect grows by the same amount. Expanding only the destination
		// stretches the bitmap by up to a pixel over the region, so overview
		// content sits at a slightly different place than the tiles covering the
		// rest of the screen — and at high zoom "slightly" is many device pixels.
		// That is the "it goes blurry AND shifts" half of the artifact: not just a
		// resolution drop, a visible jump. Scaling both rects keeps world→device
		// identical to the tile path; only the coverage grows.
		const dxf = inter.x * a + e;
		const dyf = inter.y * d + f;
		const dxf1 = (inter.x + inter.w) * a + e;
		const dyf1 = (inter.y + inter.h) * d + f;
		const dx = Math.floor(dxf),
			dy = Math.floor(dyf);
		const dw = Math.ceil(dxf1) - dx,
			dh = Math.ceil(dyf1) - dy;
		if (srcW <= 0 || srcH <= 0 || dw <= 0 || dh <= 0) return;
		// device px → source px, so the same expansion is applied on both sides.
		const spx = srcW / Math.max(1e-6, dxf1 - dxf);
		const spy = srcH / Math.max(1e-6, dyf1 - dyf);
		const sx = srcX - (dxf - dx) * spx;
		const sy = srcY - (dyf - dy) * spy;
		const sw = dw * spx;
		const sh = dh * spy;

		// The outward snap above can grow `sx/sy` just past zero (or the far edge)
		// when the viewport intersects the overview's own bounds. drawImage treats
		// out-of-source pixels as transparent, which exposes the white canvas below.
		// Clamp the source and trim the destination by the identical proportion so
		// world→device mapping remains unchanged and no transparent sample is made.
		const csx = Math.max(0, sx);
		const csy = Math.max(0, sy);
		const csx1 = Math.min(this.canvas.width, sx + sw);
		const csy1 = Math.min(this.canvas.height, sy + sh);
		if (csx1 <= csx || csy1 <= csy) return;
		const dstPerSrcX = dw / sw;
		const dstPerSrcY = dh / sh;
		const cdx = dx + (csx - sx) * dstPerSrcX;
		const cdy = dy + (csy - sy) * dstPerSrcY;
		const cdw = (csx1 - csx) * dstPerSrcX;
		const cdh = (csy1 - csy) * dstPerSrcY;

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = true;
		// @ts-ignore
		ctx.imageSmoothingQuality = "low";
		ctx.drawImage(
			this.canvas,
			csx,
			csy,
			csx1 - csx,
			csy1 - csy,
			cdx,
			cdy,
			cdw,
			cdh,
		);
		ctx.restore();
	}

	reset(): void {
		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
		}
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
