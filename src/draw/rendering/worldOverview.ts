// worldOverview.ts
//
// One low-res bitmap of the whole drawing, mapped to the current content
// bounds. It is the far-zoom picture (composited with a single drawImage) AND
// the base layer that fills any not-yet-baked tile so the viewport is never
// blank and never flashes.
//
// It is a deliberately LOW-STAKES approximation, but it is kept CORRECT (not
// just "close") by localized patching:
//   - patchRect(): synchronous clear only when the region is empty
//   - patchRectYielded(): render locally into scratch, then commit atomically
//   - rebuildIfNeeded(): full low-res re-render, only on growth/init — O(N), rare
// Because object-bearing patches redraw from the index, add / remove / move /
// erase / undo all remain drift-free without a synchronous object loop.

import { estimateRenderCost } from "@/draw/rendering/renderCost";
import {
	recordPhase,
	recordRenderObject,
	recordSyncRepairDeclined,
	shouldTimeRenderObject,
} from "@/draw/rendering/renderMetrics";
import type { Yielder } from "@/draw/scheduling/yielder";
import type {
	Bounded,
	RemoteOverview,
	SpatialIndex,
	SplitTileRenderer,
	TileRenderer,
	WorldRect,
} from "./committedLayer";
import { chooseOverviewDimensions } from "./overviewSizing";
import {
	createRasterSurface,
	type RasterContext,
	type RasterSurface,
	releaseRasterSurface,
} from "./rasterSurface";

/**
 * How much of the requested preview edge the overview must actually hold in
 * source pixels before a bitmap copy is allowed to stand in for a real render.
 *
 * 0.75 lets the ordinary drawing (which covers enough world to be sampled well
 * above the preview size) keep the cheap path, while a small sketch — where the
 * copy would be a visible upscale — is handed back to the caller.
 */
const MIN_THUMBNAIL_SOURCE_RATIO = 0.75;

interface OverviewOptions {
	px?: number;
	targetDensity?: number;
	/**
	 * Accepted from the device memory profile (4–32 by tier) but NOT honoured
	 * here — the overview does its own chunking. The field it used to be stored
	 * in was write-only, so it was removed rather than left as dead state; wiring
	 * the knob up is a draw-engine change tracked separately.
	 */
	renderChunk?: number;
	remoteOverview?: RemoteOverview<any>;
	splitRenderer?: SplitTileRenderer<any>;
	/** Cost ceiling for a synchronous overview eraser stamp. See renderCost.ts. */
	syncCostBudget?: number;
}

interface PreparedOverviewPatch<T> {
	target: RasterSurface;
	targetCtx: RasterContext;
	px0: number;
	py0: number;
	width: number;
	height: number;
	r: WorldRect;
	objects: T[];
}

export class WorldOverview<T extends Bounded> {
	private readonly PIXEL_BUDGET_EDGE: number;
	private readonly TARGET_DENSITY: number;
	private readonly SYNC_COST_BUDGET: number;
	private readonly index: SpatialIndex<T>;
	private readonly renderer: TileRenderer<T>;
	private readonly remoteOverview?: RemoteOverview<T>;
	private readonly splitRenderer?: SplitTileRenderer<T>;
	private readonly PATCH_PIXEL_BUDGET: number;

	private canvas: RasterSurface | null = null;
	private ctx: RasterContext | null = null;
	private bounds: WorldRect | null = null; // world region the bitmap covers
	private sx = 1;
	private sy = 1; // world → overview px
	private dirty = true;
	private dirtyRevision = 1;
	private rebuildInFlight: Promise<void> | null = null;
	/** One bounded reusable localized-repair surface. On low-end Android this is
	 * capped to 192² (~144 KB), avoiding per-edit canvas allocation churn. */
	private patchCanvas: RasterSurface | null = null;

	constructor(
		index: SpatialIndex<T>,
		renderer: TileRenderer<T>,
		opts: OverviewOptions = {},
	) {
		this.index = index;
		this.renderer = renderer;
		this.PIXEL_BUDGET_EDGE = opts.px ?? 2048;
		this.TARGET_DENSITY = opts.targetDensity ?? 0.5;
		this.SYNC_COST_BUDGET = opts.syncCostBudget ?? Infinity;
		this.remoteOverview = opts.remoteOverview;
		this.splitRenderer = opts.splitRenderer;
		this.PATCH_PIXEL_BUDGET =
			this.PIXEL_BUDGET_EDGE <= 768
				? 192 * 192
				: this.PIXEL_BUDGET_EDGE <= 1024
					? 256 * 256
					: 512 * 512;
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

	/**
	 * Overview pixels per WORLD unit, on its coarser axis. 0 before the first
	 * bitmap exists.
	 *
	 * This is the number that decides whether the overview can be shown sharply.
	 * The bitmap is budget-capped (PIXEL_BUDGET_EDGE), so density collapses as the
	 * world grows: a lobby spread over 20k world units gets ~0.1 px/unit, and
	 * displaying that where the viewport wants 0.5 is the blur users see. The zoom
	 * policy in TileStamps reads it to decide how far out the viewport may go.
	 */
	pixelDensity(): number {
		if (!this.canvas) return 0;
		return Math.min(this.sx, this.sy);
	}

	/** Incrementally fold one freshly-committed object into the overview. */
	add(obj: T): void {
		if (!this.canvas || !this.ctx || !this.bounds) {
			this.markDirty();
			return;
		}
		const b = obj.getBoundingRect();
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
	 * Returns false if no bitmap exists yet or the stroke exceeds the synchronous
	 * device budget (caller marks dirty and schedules the yielded rebuild).
	 */
	eraseObject(obj: T): boolean {
		if (!this.canvas || !this.ctx || !this.bounds) return false;
		if (this.SYNC_COST_BUDGET !== Infinity) {
			const cost = estimateRenderCost([obj], this.SYNC_COST_BUDGET);
			if (cost > this.SYNC_COST_BUDGET) {
				recordSyncRepairDeclined(cost);
				return false;
			}
		}
		const startedAt = performance.now();
		this.paintOne(this.ctx, obj);
		recordRenderObject(
			"overviewEraseObject",
			performance.now() - startedAt,
			obj,
		);
		return true;
	}

	/** Destination-out the eraser stroke into the overview (approximate). */
	erase(renderEraser: (ctx: RasterContext) => void): void {
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
	 * This synchronous entry point is deliberately CLEAR-ONLY. If any visible
	 * object intersects the rect it returns false so the coordinator routes the
	 * work through `patchRectYielded`; no Fabric object is ever rasterized here.
	 * That makes transform/drop seams cheap while removing overviewPatch as an
	 * ANR-shaped, uninterruptible object loop.
	 */
	patchRect(rect: WorldRect, maxObjects = Infinity): boolean {
		const __t0 = performance.now();
		const prepared = this.preparePatch(rect, maxObjects);
		if (!prepared) return false;
		if (prepared.objects.length > 0) {
			recordPhase("overviewPatch", performance.now() - __t0);
			return false;
		}
		const commitStartedAt = performance.now();
		prepared.targetCtx.setTransform(1, 0, 0, 1, 0, 0);
		prepared.targetCtx.clearRect(
			prepared.px0,
			prepared.py0,
			prepared.width,
			prepared.height,
		);
		recordPhase("overviewPatchCommit", performance.now() - commitStartedAt);
		recordPhase("overviewPatch", performance.now() - __t0);
		return true;
	}

	/**
	 * Localized overview repair built off-screen and committed atomically.
	 * Rendering yields between objects and, for large plain groups, between
	 * children. Oversized pixel regions return false so the coordinator splits
	 * them; the reusable scratch surface therefore stays tiny on low-end phones.
	 */
	async patchRectYielded(
		rect: WorldRect,
		maxObjects: number,
		yielder: Yielder,
		signal: AbortSignal,
	): Promise<boolean> {
		if (signal.aborted) return false;
		const __t0 = performance.now();
		const prepared = this.preparePatch(rect, maxObjects);
		if (!prepared) return false;
		if (prepared.objects.length === 0) return this.patchRect(rect, maxObjects);
		if (prepared.width * prepared.height > this.PATCH_PIXEL_BUDGET)
			return false;
		const scratch = this.acquirePatchCanvas(prepared.width, prepared.height);
		const ctx = scratch.getContext("2d");
		if (!ctx) return false;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, prepared.width, prepared.height);
		ctx.save();
		ctx.setTransform(
			this.sx,
			0,
			0,
			this.sy,
			-prepared.r.x * this.sx,
			-prepared.r.y * this.sy,
		);
		ctx.beginPath();
		ctx.rect(prepared.r.x, prepared.r.y, prepared.r.w, prepared.r.h);
		ctx.clip();

		yielder.reset();
		for (let i = 0; i < prepared.objects.length; i++) {
			const object = prepared.objects[i];
			try {
				if (this.splitRenderer?.canSplit(object)) {
					await this.splitRenderer.render(
						ctx,
						object,
						Math.max(this.sx, this.sy),
						prepared.r,
						yielder,
						() => signal.aborted,
						(ms, child) => recordRenderObject("overviewPatchObject", ms, child),
					);
				} else {
					const timed = shouldTimeRenderObject();
					const objectStartedAt = timed ? performance.now() : 0;
					this.renderer(
						ctx as any,
						object,
						Math.max(this.sx, this.sy),
						prepared.r,
					);
					if (timed) {
						recordRenderObject(
							"overviewPatchObject",
							performance.now() - objectStartedAt,
							object,
						);
					}
				}
			} catch {
				/* overview is a fallback approximation; keep repairing */
			}
			await yielder.maybeYield();
			if (signal.aborted) {
				ctx.restore();
				return false;
			}
		}
		ctx.restore();

		// A reset/rebuild may have replaced the target while this yielded. Never
		// stamp old pixels into a new overview mapping.
		if (
			signal.aborted ||
			this.canvas !== prepared.target ||
			this.ctx !== prepared.targetCtx
		)
			return false;
		const commitStartedAt = performance.now();
		prepared.targetCtx.setTransform(1, 0, 0, 1, 0, 0);
		prepared.targetCtx.clearRect(
			prepared.px0,
			prepared.py0,
			prepared.width,
			prepared.height,
		);
		prepared.targetCtx.drawImage(
			scratch,
			0,
			0,
			prepared.width,
			prepared.height,
			prepared.px0,
			prepared.py0,
			prepared.width,
			prepared.height,
		);
		recordPhase("overviewPatchCommit", performance.now() - commitStartedAt);
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
		const tmp = createRasterSurface(width, height);
		const tctx = tmp.getContext("2d") as RasterContext | null;
		const discardTmp = () => {
			// Dropping the JS reference leaves backing-store reclamation to GC, which
			// is far too late under Android WebView memory pressure. Resizing to zero
			// releases the raster allocation immediately.
			releaseRasterSurface(tmp);
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
			if (previous && previous !== tmp) releaseRasterSurface(previous);
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
				const b = objects[i].getBoundingRect();
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
							try {
								if (this.splitRenderer?.canSplit(remote.skipped[i])) {
									await this.splitRenderer.render(
										tctx,
										remote.skipped[i],
										Math.max(sx, sy),
										bounds,
										yielder,
										() => signal.aborted,
										(ms, child) =>
											recordRenderObject("overviewOverlayObject", ms, child),
									);
								} else {
									const overlayTimed = shouldTimeRenderObject();
									const overlayStartedAt = overlayTimed ? performance.now() : 0;
									this.renderer(
										tctx as any,
										remote.skipped[i],
										Math.max(sx, sy),
									);
									if (overlayTimed) {
										recordRenderObject(
											"overviewOverlayObject",
											performance.now() - overlayStartedAt,
											remote.skipped[i],
										);
									}
								}
							} catch {
								/* ignore */
							}
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
				if (this.splitRenderer?.canSplit(visible[i])) {
					await this.splitRenderer.render(
						tctx,
						visible[i],
						Math.max(sx, sy),
						bounds,
						yielder,
						() => signal.aborted,
						(ms, child) => recordRenderObject("overviewBuildObject", ms, child),
					);
				} else {
					const timed = shouldTimeRenderObject();
					const objectStartedAt = timed ? performance.now() : 0;
					this.renderer(tctx as any, visible[i], Math.max(sx, sy), bounds);
					if (timed) {
						recordRenderObject(
							"overviewBuildObject",
							performance.now() - objectStartedAt,
							visible[i],
						);
					}
				}
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

		/**
		 * The overview is a fixed-DENSITY bitmap (px per world unit), so the pixels
		 * behind a drawing are proportional to how much WORLD it covers — not to
		 * how big the requested preview is. A few dots occupy a few world units and
		 * therefore a few dozen overview pixels; blowing those up to 640 is the
		 * blurry-preview-of-a-small-sketch report.
		 *
		 * Refuse instead of upscaling. The caller renders that case from the
		 * document itself, where vectors rasterize at whatever size is asked for.
		 * Anything that genuinely has the pixels keeps the cheap bitmap copy.
		 */
		const sourceEdge = Math.max(framed.w * this.sx, framed.h * this.sy);
		if (sourceEdge < maxSize * MIN_THUMBNAIL_SOURCE_RATIO) {
			return Promise.resolve(null);
		}

		const aspect = framed.w / framed.h;
		const width = Math.max(
			1,
			Math.round(aspect >= 1 ? maxSize : maxSize * aspect),
		);
		const height = Math.max(
			1,
			Math.round(aspect >= 1 ? maxSize / aspect : maxSize),
		);
		// The caller already has a vector-render fallback for thumbnails. Old
		// Android WebViews do not expose OffscreenCanvas, so decline this cheap
		// overview-copy path instead of crashing the draw page.
		if (typeof OffscreenCanvas !== "function") return Promise.resolve(null);
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
		_px: { w: number; h: number },
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
		if (this.patchCanvas) {
			this.patchCanvas.width = 0;
			this.patchCanvas.height = 0;
		}
		this.patchCanvas = null;
		this.markDirty();
	}

	// ── helpers ──────────────────────────────────────────────────────────────
	private preparePatch(
		rect: WorldRect,
		maxObjects: number,
	): PreparedOverviewPatch<T> | null {
		if (!this.canvas || !this.ctx || !this.bounds) return null;
		if (!this.contains(this.bounds, rect)) return null;

		// Pad by ~2 overview pixels and snap outward so a localized clear never
		// leaves a half-antialiased seam against untouched pixels.
		const mx = 2 / this.sx;
		const my = 2 / this.sy;
		const desired: WorldRect = {
			x: rect.x - mx,
			y: rect.y - my,
			w: rect.w + 2 * mx,
			h: rect.h + 2 * my,
		};
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
		if (px1 <= px0 || py1 <= py0) {
			return {
				target: this.canvas,
				targetCtx: this.ctx,
				px0,
				py0,
				width: 0,
				height: 0,
				r: rect,
				objects: [],
			};
		}
		const r: WorldRect = {
			x: this.bounds.x + px0 / this.sx,
			y: this.bounds.y + py0 / this.sy,
			w: (px1 - px0) / this.sx,
			h: (py1 - py0) / this.sy,
		};
		const objects = this.index
			.query(r)
			.filter((o: any) => o.visible !== false && o.opacity !== 0);
		if (objects.length > maxObjects) return null;
		return {
			target: this.canvas,
			targetCtx: this.ctx,
			px0,
			py0,
			width: px1 - px0,
			height: py1 - py0,
			r,
			objects,
		};
	}

	private acquirePatchCanvas(width: number, height: number): RasterSurface {
		if (!this.patchCanvas) {
			this.patchCanvas = createRasterSurface(width, height);
			return this.patchCanvas;
		}
		// Grow when the retained shape stays inside the budget. Alternating a wide,
		// short patch with a narrow, tall one would otherwise accumulate both maxima
		// and silently exceed the cap; resize to the exact requested shape instead.
		const retainedWidth = Math.max(this.patchCanvas.width, width);
		const retainedHeight = Math.max(this.patchCanvas.height, height);
		if (retainedWidth * retainedHeight > this.PATCH_PIXEL_BUDGET) {
			this.patchCanvas.width = width;
			this.patchCanvas.height = height;
		} else {
			if (this.patchCanvas.width < width) this.patchCanvas.width = width;
			if (this.patchCanvas.height < height) this.patchCanvas.height = height;
		}
		return this.patchCanvas;
	}

	private applyWorldTransform(ctx: RasterContext) {
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

	private paintOne(ctx: RasterContext, obj: T) {
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
