import { recordComposite } from "@/draw/rendering/renderMetrics";
import { type TileKey, tileKey } from "./tileKey";
import {
	type Bounded,
	type CompositeCell,
	type CompositeResult,
	type Draw,
	isOpaqueColor,
	MAX_PARTIAL_OVERLAYS,
	NO_HOLE,
	type PartialDraw,
	TileLayerBase,
	type WorldRect,
} from "./tileLayerBase";
import type { Tile } from "./tileStore";

export class TileCompositor<T extends Bounded> extends TileLayerBase<T> {
	// ── compositing ────────────────────────────────────────────────────────
	composite(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		vpt: number[],
		px: { w: number; h: number },
		dpr: number,
		bg?: string,
		fallbackDepth = 0, // 0 → use FALLBACK_DEPTH; >0 → cap (1 while gesturing)
	): CompositeResult {
		const __t0all = performance.now();
		const zoom = vpt[0];
		const tier = this.pickActiveTier(zoom);
		// Eviction protects this tier and its neighbours (see TileStore.reserve).
		// Reported from the composite rather than the bake because this is the tier
		// pixels are actually being read from, which is what must survive.
		this.tileStore.setActiveTier(tier);
		const vw = this.viewWorld(vpt, px, dpr);

		// top instrumentation hook (debug only — dead telemetry off the hot path in prod)
		const __t0 = this.debug ? performance.now() : 0;

		const maxDepth = fallbackDepth > 0 ? fallbackDepth : this.FALLBACK_DEPTH;

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		// clearRect + fillRect is TWO full-surface writes per frame. When the
		// background is opaque the fill already overwrites every pixel, so the clear
		// is pure waste — and this is the single biggest fixed cost of a composite:
		// at MAX_RENDER_SCALE 2 on a phone that is ~1.3Mpx, written twice, on EVERY
		// frame of every pan and zoom. Only clear when there is no opaque fill
		// coming (transparent / unset background), where it is load-bearing.
		if (bg && isOpaqueColor(bg)) {
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, px.w, px.h);
		} else {
			ctx.clearRect(0, 0, px.w, px.h);
			if (bg) {
				ctx.fillStyle = bg;
				ctx.fillRect(0, 0, px.w, px.h);
			}
		}
		ctx.restore();

		if (tier <= this.OVERVIEW_TIER) {
			this.overview.composite(ctx, vpt, px, dpr, vw);
			recordComposite(
				performance.now() - __t0all,
				0,
				0,
				0,
				this.tiles.size,
				this.memoryBytes,
				this.MEM_HARD,
				this.dirtyRects.size,
				this.inFlight.size,
			);
			return {
				needsBake: this.overview.isDirty(),
				nonFresh: this.overview.isDirty() ? 1 : 0,
			};
		}

		const range = this.tileRange(vw, tier);
		const a = vpt[0] * dpr,
			d = vpt[3] * dpr,
			e = vpt[4] * dpr,
			f = vpt[5] * dpr;
		const tws = this.TILE / this.ZOOM_TIERS[tier];

		// Reuse per-frame scratch (see fields). Counts track fill length; slots are
		// overwritten in place so a steady-state frame allocates no descriptors.
		const present = this._present;
		const uncovered = this._uncovered;
		const partial = this._partial;
		const fallback = this._fallback;
		fallback.length = 0;
		const needsOverview = this._needsOverview;
		let presentN = 0,
			uncoveredN = 0,
			partialN = 0,
			needsOverviewN = 0;
		let nonFreshN = 0;
		// Overview coverage is now an arbitrary rect list, not one entry per cell:
		// it must line up EXACTLY with what no tile source will paint.
		const needsOverviewAt = (i: number): CompositeCell =>
			needsOverview[i] ??
			(needsOverview[i] = { tx: 0, ty: 0, dx: 0, dy: 0, dw: 0, dh: 0 });

		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const dx0 = Math.floor(tx * tws * a + e);
				const dy0 = Math.floor(ty * tws * d + f);
				const dx1 = Math.floor((tx + 1) * tws * a + e);
				const dy1 = Math.floor((ty + 1) * tws * d + f);
				const dw = dx1 - dx0,
					dh = dy1 - dy0;

				const key = tileKey(tier, tx, ty);
				const t = this.tiles.get(key);
				const fresh = t ? this.isFresh(key, t) : false;
				if (t) this.touchTile(key, t);
				if (!t || !fresh) nonFreshN++;

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
					const dr =
						present[presentN] ??
						(present[presentN] = {
							bmp: t.bitmap,
							sx: 0,
							sy: 0,
							sw: 0,
							sh: 0,
							dx: 0,
							dy: 0,
							dw: 0,
							dh: 0,
							hx: 0,
							hy: 0,
							hw: 0,
							hh: 0,
						});
					dr.bmp = t.bitmap;
					dr.sx = this.OS;
					dr.sy = this.OS;
					dr.sw = this.TILE;
					dr.sh = this.TILE;
					dr.dx = dx0;
					dr.dy = dy0;
					dr.dw = dw;
					dr.dh = dh;
					presentN++;
					continue;
				}
				if (t && fresh && !t.bitmap) continue; // fresh-empty → genuinely empty

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
					// The tile IS the cell here, so every recorded region applies —
					// union them. `null`/absent → provenance unknown → whole tile.
					const dirty = this.unionDirtyRects(key);
					if (dirty) {
						// world → device, snapped OUTWARD so no stale pixel survives inside
						// the changed region (a gap here would be a ghost, not a seam).
						const hx0 = Math.max(dx0, Math.floor(dirty.x * a + e));
						const hy0 = Math.max(dy0, Math.floor(dirty.y * d + f));
						const hx1 = Math.min(
							dx0 + dw,
							Math.ceil((dirty.x + dirty.w) * a + e),
						);
						const hy1 = Math.min(
							dy0 + dh,
							Math.ceil((dirty.y + dirty.h) * d + f),
						);
						const coversAll =
							hx0 <= dx0 && hy0 <= dy0 && hx1 >= dx0 + dw && hy1 >= dy0 + dh;
						if (!coversAll) {
							const pd =
								partial[partialN] ??
								(partial[partialN] = {
									bmp: t.bitmap,
									dx: 0,
									dy: 0,
									dw: 0,
									dh: 0,
									hx: 0,
									hy: 0,
									hw: 0,
									hh: 0,
								});
							pd.bmp = t.bitmap;
							pd.dx = dx0;
							pd.dy = dy0;
							pd.dw = dw;
							pd.dh = dh;
							// An empty/degenerate hole means nothing in this cell changed —
							// clamp to zero area rather than emitting a negative rect.
							pd.hx = hx0;
							pd.hy = hy0;
							pd.hw = Math.max(0, hx1 - hx0);
							pd.hh = Math.max(0, hy1 - hy0);
							partialN++;
							// Fill the hole from the NEXT-BEST TILE before considering the
							// overview. The overview is the whole board in one bitmap; a
							// coarser tile of this exact region is orders of magnitude
							// closer to the truth, and the visible "edit → everything goes
							// soft for a moment" is almost entirely this one choice.
							//
							// The partition still holds: the stale tile paints cell MINUS
							// hole, this filler paints ONLY inside the hole (`k*`) minus its
							// own recorded hole, and the overview gets whatever is still
							// unclaimed. No pixel is painted twice, so semi-transparent
							// strokes keep their alpha.
							if (pd.hw > 0 && pd.hh > 0) {
								const filler = this.holeFiller(
									tier,
									tx,
									ty,
									dx0,
									dy0,
									dw,
									dh,
									maxDepth,
									a,
									d,
									e,
									f,
									pd,
								);
								if (filler) fallback.push(filler);
								// Overview covers what neither the stale tile nor the filler
								// claimed: the filler's own hole, or the whole hole if there
								// was no filler at all.
								const ov = needsOverviewAt(needsOverviewN++);
								if (filler && filler.hw > 0 && filler.hh > 0) {
									ov.dx = filler.hx;
									ov.dy = filler.hy;
									ov.dw = filler.hw;
									ov.dh = filler.hh;
								} else if (filler) {
									needsOverviewN--; // fully covered by the filler
								} else {
									ov.dx = pd.hx;
									ov.dy = pd.hy;
									ov.dw = pd.hw;
									ov.dh = pd.hh;
								}
							}
							continue;
						}
					}
				}

				const uc =
					uncovered[uncoveredN] ??
					(uncovered[uncoveredN] = {
						tx: 0,
						ty: 0,
						dx: 0,
						dy: 0,
						dw: 0,
						dh: 0,
					});
				uc.tx = tx;
				uc.ty = ty;
				uc.dx = dx0;
				uc.dy = dy0;
				uc.dw = dw;
				uc.dh = dh;
				uncoveredN++;
			}
		}

		const __tSearch = performance.now();
		for (let i = 0; i < uncoveredN; i++) {
			const cell = uncovered[i];
			const fbs = this.findBestSource(
				tier,
				cell.tx,
				cell.ty,
				cell.dx,
				cell.dy,
				cell.dw,
				cell.dh,
				maxDepth,
				a,
				d,
				e,
				f,
			);
			if (fbs.length) {
				for (let j = 0; j < fbs.length; j++) {
					const fb = fbs[j];
					fallback.push(fb);
					// Overview goes in the punched-out region of THIS fragment only.
					// Filling the whole cell would put it under the fragment's own pixels
					// and double every semi-transparent stroke in it.
					if (fb.hw > 0 && fb.hh > 0) {
						const ov = needsOverviewAt(needsOverviewN++);
						ov.dx = fb.hx;
						ov.dy = fb.hy;
						ov.dw = fb.hw;
						ov.dh = fb.hh;
					}
				}
			} else {
				// No tile data at any tier → the overview owns the whole cell.
				const ov = needsOverviewAt(needsOverviewN++);
				ov.dx = cell.dx;
				ov.dy = cell.dy;
				ov.dw = cell.dw;
				ov.dh = cell.dh;
			}
		}
		const searchMs = performance.now() - __tSearch;

		// Render the overview background strictly for gaps missing tile data
		if (needsOverviewN > 0) {
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.beginPath();
			for (let i = 0; i < needsOverviewN; i++) {
				const cell = needsOverview[i];
				ctx.rect(cell.dx, cell.dy, cell.dw, cell.dh);
			}
			ctx.clip();
			this.overview.composite(ctx, vpt, px, dpr, vw);
			ctx.restore();
		}

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "low";

		// Draw tiles on top safely without stacking transparency. Iterate by fill
		// count — the scratch arrays keep a stale tail from prior frames.
		//
		// Timed separately: the FIRST drawImage of a freshly-baked ImageBitmap also
		// uploads it as a GPU texture, so a bake pass landing dozens of tiles shows
		// up here and nowhere else. That is the difference between "the composite is
		// slow" (fill rate / DPR) and "the switch frame is slow" (upload burst).
		const __tDraw = performance.now();
		for (let i = 0; i < fallback.length; i++) {
			const dr = fallback[i];
			const keeps = (dr.kw ?? 0) > 0 && (dr.kh ?? 0) > 0;
			if (keeps || (dr.hw > 0 && dr.hh > 0)) {
				// Stale cross-tier source: trusted everywhere except the region an edit
				// changed. Punch that out (even-odd) and let the overview show through.
				// A `keep` rect restricts it further — that is a hole-filler, confined
				// to another source's hole so the two never overlap.
				ctx.save();
				ctx.beginPath();
				if (keeps) ctx.rect(dr.kx!, dr.ky!, dr.kw!, dr.kh!);
				else ctx.rect(dr.dx, dr.dy, dr.dw, dr.dh);
				if (dr.hw > 0 && dr.hh > 0) ctx.rect(dr.hx, dr.hy, dr.hw, dr.hh);
				ctx.clip("evenodd");
				ctx.drawImage(
					dr.bmp,
					dr.sx,
					dr.sy,
					dr.sw,
					dr.sh,
					dr.dx,
					dr.dy,
					dr.dw,
					dr.dh,
				);
				ctx.restore();
				continue;
			}
			ctx.drawImage(
				dr.bmp,
				dr.sx,
				dr.sy,
				dr.sw,
				dr.sh,
				dr.dx,
				dr.dy,
				dr.dw,
				dr.dh,
			);
		}
		// Stale-but-partly-correct tiles, on top of their own cover, with the
		// changed sub-rect punched out (even-odd: outer cell minus inner hole).
		// Drawn AFTER the cover so the hole can never expose the background — the
		// cover is already painted underneath the entire cell.
		for (let i = 0; i < partialN; i++) {
			const pd = partial[i];
			ctx.save();
			ctx.beginPath();
			ctx.rect(pd.dx, pd.dy, pd.dw, pd.dh);
			if (pd.hw > 0 && pd.hh > 0) ctx.rect(pd.hx, pd.hy, pd.hw, pd.hh);
			ctx.clip("evenodd");
			ctx.drawImage(
				pd.bmp,
				this.OS,
				this.OS,
				this.TILE,
				this.TILE,
				pd.dx,
				pd.dy,
				pd.dw,
				pd.dh,
			);
			ctx.restore();
		}
		for (let i = 0; i < presentN; i++) {
			const dr = present[i];
			ctx.drawImage(
				dr.bmp,
				dr.sx,
				dr.sy,
				dr.sw,
				dr.sh,
				dr.dx,
				dr.dy,
				dr.dw,
				dr.dh,
			);
		}
		const tileDrawMs = performance.now() - __tDraw;
		ctx.restore();
		recordComposite(
			performance.now() - __t0all,
			tileDrawMs,
			searchMs,
			presentN + fallback.length + partialN,
			this.tiles.size,
			this.memoryBytes,
			this.MEM_HARD,
			this.dirtyRects.size,
			this.inFlight.size,
		);

		// bottom instrumentation hook (debug only)
		if (this.debug) {
			const g = globalThis as any;
			const s = (g.__comp ||= {
				frames: 0,
				ms: 0,
				maxMs: 0,
				cells: 0,
				missFrames: 0,
			});
			const dt = performance.now() - __t0;
			s.frames++;
			s.ms += dt;
			s.maxMs = Math.max(s.maxMs, dt);
			s.cells += uncoveredN;
			if (needsOverviewN > 0) s.missFrames++;
		}

		return { needsBake: nonFreshN > 0, nonFresh: nonFreshN };
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
	/**
	 * @param region the WORLD area this source is about to paint. Only the
	 *   recorded regions that actually intersect it matter — a coarse tile
	 *   invalidated somewhere far away is perfectly good here, and treating it
	 *   as unusable is what collapsed the fallback ladder to the overview after
	 *   a handful of edits.
	 */
	protected fallbackHole(
		key: TileKey,
		t: Tile,
		region: WorldRect,
	): WorldRect | null | typeof NO_HOLE {
		if (this.isFresh(key, t) || t.usable) return NO_HOLE;
		const rects = this.dirtyRects.get(key);
		// undefined → never recorded; null → whole tile. Either way, unusable.
		if (!rects) return null;
		let hole: WorldRect | null = null;
		for (const r of rects) {
			if (
				r.x > region.x + region.w ||
				region.x > r.x + r.w ||
				r.y > region.y + region.h ||
				region.y > r.y + r.h
			) {
				continue;
			}
			if (!hole) {
				hole = { x: r.x, y: r.y, w: r.w, h: r.h };
				continue;
			}
			const x = Math.min(hole.x, r.x);
			const y = Math.min(hole.y, r.y);
			const x2 = Math.max(hole.x + hole.w, r.x + r.w);
			const y2 = Math.max(hole.y + hole.h, r.y + r.h);
			hole.x = x;
			hole.y = y;
			hole.w = x2 - x;
			hole.h = y2 - y;
		}
		// Nothing recorded touches this region → the source is exact here.
		return hole ?? NO_HOLE;
	}

	/**
	 * Find a tile source to paint INSIDE another source's hole.
	 *
	 * Used when an edit leaves part of an otherwise-good tile untrustworthy. The
	 * alternative for that patch is the whole-board overview, which is what makes
	 * an edit look like the picture briefly dissolves. A coarser tile of the same
	 * region is far closer to correct, and the result stays a strict partition:
	 * this draw is confined to `keep` (the hole) minus its own recorded hole.
	 *
	 * Deliberately COARSER-only: `finerDraws` returns several fragments, and
	 * intersecting each of them with the hole for a partition guarantee is not
	 * worth the complexity for the rarer zoomed-out case.
	 */
	protected holeFiller(
		tier: number,
		tx: number,
		ty: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
		maxDepth: number,
		a: number,
		d: number,
		e: number,
		f: number,
		hole: PartialDraw,
	): Draw | null {
		const maxOut = Math.min(maxDepth, this.ZOOM_TIERS.length);
		for (let step = 1; step <= maxOut; step++) {
			const coarser = tier - step;
			if (coarser <= this.OVERVIEW_TIER) break;
			const c = this.coarserDraw(
				tier,
				tx,
				ty,
				coarser,
				dx,
				dy,
				dw,
				dh,
				a,
				d,
				e,
				f,
				true,
			);
			if (!c) continue;
			// STRICTLY FRESH ONLY.
			//
			// The hole is precisely where content changed, so any source that
			// predates the change paints the OLD content there — the object at its
			// previous position, or an erase that was just undone, for one frame.
			// That reads as the picture flashing, which is worse than the blur it
			// was meant to replace. Outside a hole a stale source is merely older
			// and still correct; inside one it is actively wrong.
			if (c.hw > 0 || c.hh > 0) continue;
			c.kx = hole.hx;
			c.ky = hole.hy;
			c.kw = hole.hw;
			c.kh = hole.hh;
			return c;
		}
		return null;
	}

	protected findBestSource(
		tier: number,
		tx: number,
		ty: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
		maxDepth: number,
		a: number,
		d: number,
		e: number,
		f: number,
	): Draw[] {
		const maxOut = Math.min(maxDepth, this.ZOOM_TIERS.length);
		for (let step = 1; step <= maxOut; step++) {
			const coarser = tier - step;
			if (coarser > this.OVERVIEW_TIER) {
				const c = this.coarserDraw(
					tier,
					tx,
					ty,
					coarser,
					dx,
					dy,
					dw,
					dh,
					a,
					d,
					e,
					f,
				);
				if (c) return [c];
			}
			const finer = tier + step;
			if (finer < this.ZOOM_TIERS.length) {
				const fs = this.finerDraws(
					tier,
					tx,
					ty,
					finer,
					dx,
					dy,
					dw,
					dh,
					a,
					d,
					e,
					f,
				);
				if (fs.length) return fs;
			}
		}
		return [];
	}

	/** World hole → device px, clamped to the destination rect and snapped
	 *  outward. Writes into `out`; leaves a zero-size hole when nothing of it
	 *  lands inside the destination. */
	protected holeToDevice(
		hole: WorldRect,
		out: Draw,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
		a: number,
		d: number,
		e: number,
		f: number,
	): void {
		const x0 = Math.max(dx, Math.floor(hole.x * a + e));
		const y0 = Math.max(dy, Math.floor(hole.y * d + f));
		const x1 = Math.min(dx + dw, Math.ceil((hole.x + hole.w) * a + e));
		const y1 = Math.min(dy + dh, Math.ceil((hole.y + hole.h) * d + f));
		out.hx = x0;
		out.hy = y0;
		out.hw = Math.max(0, x1 - x0);
		out.hh = Math.max(0, y1 - y0);
	}

	protected coarserDraw(
		tier: number,
		tx: number,
		ty: number,
		ct: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
		a: number,
		d: number,
		e: number,
		f: number,
		/** Reject anything that owes a re-bake at all. For painting INSIDE a hole,
		 *  where "stale but trusted here" is not good enough — see holeFiller. */
		requireFresh = false,
	): Draw | null {
		const tws = this.TILE / this.ZOOM_TIERS[tier];
		const cwx = tx * tws,
			cwy = ty * tws,
			cww = tws;
		const ctws = this.TILE / this.ZOOM_TIERS[ct];
		const ctxi = Math.floor(cwx / ctws);
		const ctyi = Math.floor(cwy / ctws);
		const key = tileKey(ct, ctxi, ctyi);
		const t = this.tiles.get(key);
		if (
			requireFresh &&
			(!t || !this.isFresh(key, t) || this.dirtyRects.has(key))
		)
			return null;
		if (!t || !t.bitmap) return null;
		// Only the part of the coarse tile that maps to THIS cell is in play.
		const hole = this.fallbackHole(key, t, {
			x: cwx,
			y: cwy,
			w: cww,
			h: cww,
		});
		if (hole === null) return null;
		const fx = (cwx - ctxi * ctws) / ctws;
		const fy = (cwy - ctyi * ctws) / ctws;
		const fw = cww / ctws;
		this.touchTile(key, t, true);
		const out: Draw = {
			bmp: t.bitmap,
			sx: this.OS + fx * this.TILE,
			sy: this.OS + fy * this.TILE,
			sw: fw * this.TILE,
			sh: fw * this.TILE,
			dx,
			dy,
			dw,
			dh,
			hx: 0,
			hy: 0,
			hw: 0,
			hh: 0,
		};
		if (hole !== NO_HOLE) {
			this.holeToDevice(hole, out, dx, dy, dw, dh, a, d, e, f);
			// The hole swallows the whole cell → this source contributes nothing.
			if (out.hw >= dw && out.hh >= dh) return null;
		}
		return out;
	}

	protected finerDraws(
		tier: number,
		tx: number,
		ty: number,
		ft: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
		a: number,
		d: number,
		e: number,
		f: number,
	): Draw[] {
		const tws = this.TILE / this.ZOOM_TIERS[tier];
		const cellWorld: WorldRect = { x: tx * tws, y: ty * tws, w: tws, h: tws };
		const fr = this.tileRange(cellWorld, ft);
		const ftws = this.TILE / this.ZOOM_TIERS[ft];

		const draws: Draw[] = [];
		const dpw = dw / tws;
		const dph = dh / tws;
		for (let fty = fr.ty0; fty <= fr.ty1; fty++) {
			for (let ftx = fr.tx0; ftx <= fr.tx1; ftx++) {
				const k = tileKey(ft, ftx, fty);
				const t = this.tiles.get(k);
				if (!t) return [];

				const fwx = ftx * ftws,
					fwy = fty * ftws;
				const ix0 = Math.max(fwx, cellWorld.x);
				const iy0 = Math.max(fwy, cellWorld.y);
				const ix1 = Math.min(fwx + ftws, cellWorld.x + cellWorld.w);
				const iy1 = Math.min(fwy + ftws, cellWorld.y + cellWorld.h);
				if (ix1 <= ix0 || iy1 <= iy0) continue;

				// Scoped to the fragment's own slice of the cell, not the whole
				// finer tile: an edit elsewhere in it does not disqualify this piece.
				const hole = this.fallbackHole(k, t, {
					x: ix0,
					y: iy0,
					w: ix1 - ix0,
					h: iy1 - iy0,
				});
				if (hole === null) return []; // one untrusted fragment → drop the set
				if (!t.bitmap) continue;

				const fineScale = this.TILE / ftws;
				const sx = this.OS + (ix0 - fwx) * fineScale;
				const sy = this.OS + (iy0 - fwy) * fineScale;
				const sw = (ix1 - ix0) * fineScale;
				const sh = (iy1 - iy0) * fineScale;

				// SHARED-EDGE SNAP. These were floats, so two adjacent fragments of the
				// same cell left a sub-pixel gap the canvas background showed through —
				// the thin white lines during a bake. Both edges are floored (never
				// floor/ceil), so fragment i's far edge is bit-identical to fragment
				// i+1's near edge: no gap AND no overlap. Overlap is not free — tile
				// content is semi-transparent where strokes are, so a 1px overlap
				// composites those pixels twice and draws a darker seam.
				const ddx = Math.floor(dx + (ix0 - cellWorld.x) * dpw);
				const ddy = Math.floor(dy + (iy0 - cellWorld.y) * dph);
				const ddw = Math.floor(dx + (ix1 - cellWorld.x) * dpw) - ddx;
				const ddh = Math.floor(dy + (iy1 - cellWorld.y) * dph) - ddy;
				if (ddw <= 0 || ddh <= 0) continue;

				this.touchTile(k, t, true);
				const out: Draw = {
					bmp: t.bitmap,
					sx,
					sy,
					sw,
					sh,
					dx: ddx,
					dy: ddy,
					dw: ddw,
					dh: ddh,
					hx: 0,
					hy: 0,
					hw: 0,
					hh: 0,
				};
				if (hole !== NO_HOLE) {
					this.holeToDevice(hole, out, ddx, ddy, ddw, ddh, a, d, e, f);
					if (out.hw >= ddw && out.hh >= ddh) continue; // fully untrusted fragment
				}
				draws.push(out);
			}
		}
		return draws;
	}
}
