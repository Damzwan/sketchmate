import { recordPhase } from "@/draw/rendering/renderMetrics";
import { TileCompositor } from "./tileCompositor";
import {
	type Bounded,
	type RemoteBakeResult,
	type Yieldable,
	type WorldRect,
	MAX_SYNC_OVERLAY_CHILDREN,
	MAX_SYNC_OVERLAY_OBJECTS,
} from "./tileLayerBase";

export class TileBaker<T extends Bounded> extends TileCompositor<T> {
	// ── baking ───────────────────────────────────────────────────────────────
	async bake(
		vpt: number[],
		px: { w: number; h: number },
		dpr: number,
		makeYielder: () => Yieldable,
		signal: AbortSignal,
		contentBounds: WorldRect | null,
		/** Called after each tile is stored so the caller can composite the partial
		 *  result (F9). Coalesced by the caller — safe to invoke per tile. */
		onProgress?: () => void,
	): Promise<void> {
		const zoom = vpt[0];
		const tier = this.pickActiveTier(zoom);
		const vw = this.viewWorld(vpt, px, dpr);

		if (tier <= this.OVERVIEW_TIER) {
			await this.overview.rebuildIfNeeded(
				contentBounds,
				makeYielder() as any,
				signal,
			);
			return;
		}

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
				if (t && this.isFresh(key, t)) continue;
				todo.push({ tx, ty, pri: (tx - cx) ** 2 + (ty - cy) ** 2 });
			}
		todo.sort((p, q) => p.pri - q.pri);

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
		const lanes = this.remoteBaker ? 2 : 1;
		let next = 0;
		const drain = async (): Promise<void> => {
			// Per-lane yielder (F8). A single shared yielder had every lane call
			// reset() on the same budget timer, so the effective per-lane budget
			// collapsed to budgetMs / lanes and input-pending checks fought each
			// other. One timer per chain restores the intended budget.
			const yielder = makeYielder();
			yielder.reset();
			while (next < todo.length) {
				if (signal.aborted) return;
				const { tx, ty } = todo[next++];
				await this.rebuildTile(tier, tx, ty, yielder, signal);
				// Repaint the partial result now — otherwise the viewport stays on
				// overview/fallback for the entire ~40-tile pass (F9). Coalesced caller.
				if (!signal.aborted) onProgress?.();
				if (yielder.shouldYield()) await yielder.yield();
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(lanes, todo.length) }, () => drain()),
		);
	}

	protected async rebuildTile(
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

		this.inFlight.add(key);
		try {
			if (objects.length === 0) {
				this.store(key, tier, tx, ty, null, 4, builtGen);
				return;
			}

			// Worker bake first: main thread pays only the (lazy, coalesced) toJSON
			// deltas + a drawImage on store — the rasterization runs off-thread.
			if (this.remoteBaker) {
				let res: RemoteBakeResult<T> | null = null;
				try {
					res = await this.remoteBaker(
						objects,
						world,
						scale,
						this.OS,
						this.BMP,
					);
				} catch {
					/* worker hiccup → local fallback */
				}
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
					if (
						res &&
						!res.skipped.length &&
						(this.gen.get(key) ?? 0) === builtGen
					) {
						const bytes = this.BMP * this.BMP * 4;
						if (this.ensureMemory(bytes)) {
							this.store(key, tier, tx, ty, res.bitmap, bytes, builtGen);
							return;
						}
					}
					res?.bitmap.close();
					return;
				}
				if (res) {
					// Hybrid tile (F3-C): the worker rendered everything it could; overlay
					// the few objects it couldn't (image / group / unshippable text) on
					// top on the main thread. The baker guarantees those all sit z-above
					// what's in the bitmap. `skipped` empty → pure worker bitmap, no
					// overlay (the common case).
					let bmp: ImageBitmap | null = res.bitmap;
					if (res.skipped.length) {
						bmp = this.overlaySkipped(res.bitmap, res.skipped, world, scale, q);
					}
					if (signal.aborted) {
						bmp?.close();
						return;
					}
					if (bmp) {
						const bytes = this.BMP * this.BMP * 4;
						if (!this.ensureMemory(bytes)) {
							bmp.close();
							return;
						}
						// Store even if `gen` advanced while we awaited the worker. It is kept
						// under the ORIGINAL builtGen, so isFresh() stays false and the next
						// bake repaints it exactly — same contract as stampBitmapRegion.
						this.store(key, tier, tx, ty, bmp, bytes, builtGen);
						return;
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
			const __tLocal = performance.now();
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
			for (let i = 0; i < objects.length; i++) {
				if (i > 0 && yielder.shouldYield()) {
					await yielder.yield();
					if (signal.aborted) {
						c2d.restore();
						this.release(off);
						return;
					}
				}
				try {
					this.renderer(c2d as any, objects[i], scale, q);
				} catch (err) {
					if (this.debug) console.warn("[Committed] render threw", err);
				}
				if (i % this.CHUNK === this.CHUNK - 1 || yielder.shouldYield()) {
					await yielder.yield();
					if (signal.aborted) {
						c2d.restore();
						this.release(off);
						return;
					}
				}
			}
			c2d.restore();

			// Zero-copy transfer
			let bmp: ImageBitmap;
			try {
				bmp = off.transferToImageBitmap();
			} catch {
				this.release(off);
				return;
			}
			this.release(off);
			if (signal.aborted) {
				bmp.close();
				return;
			}

			// Gen may have advanced during an await yield above → drop stale bitmap;
			if ((this.gen.get(key) ?? 0) !== builtGen) {
				bmp.close();
				return;
			}

			const bytes = this.BMP * this.BMP * 4;
			if (!this.ensureMemory(bytes)) {
				bmp.close();
				return;
			}
			this.store(key, tier, tx, ty, bmp, bytes, builtGen);
			recordPhase("localBake", performance.now() - __tLocal);
		} finally {
			this.inFlight.delete(key);
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
	protected overlaySkipped(
		base: ImageBitmap,
		skipped: T[],
		world: WorldRect,
		scale: number,
		q: WorldRect,
	): ImageBitmap | null {
		const __t0 = performance.now();
		let childCount = 0;
		for (let i = 0; i < skipped.length; i++) {
			const children = (skipped[i] as any)?._objects;
			if (Array.isArray(children)) childCount += children.length;
		}
		if (
			skipped.length > MAX_SYNC_OVERLAY_OBJECTS ||
			childCount > MAX_SYNC_OVERLAY_CHILDREN
		) {
			// `base` is owned by this method. Closing before returning null lets the
			// caller safely enter the yielded full-local fallback without retaining
			// a worker bitmap nobody will draw.
			base.close();
			return null;
		}
		const off = this.acquire();
		const c2d = off.getContext("2d");
		if (!c2d) {
			this.release(off);
			base.close();
			return null;
		}
		c2d.setTransform(1, 0, 0, 1, 0, 0);
		c2d.clearRect(0, 0, this.BMP, this.BMP);
		try {
			c2d.drawImage(base, 0, 0);
		} catch {
			this.release(off);
			base.close();
			return null;
		}
		base.close();
		c2d.save();
		c2d.translate(this.OS, this.OS);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(q.x, q.y, q.w, q.h);
		c2d.clip();
		for (let i = 0; i < skipped.length; i++) {
			try {
				this.renderer(c2d as any, skipped[i], scale, q);
			} catch (err) {
				if (this.debug) console.warn("[Committed] overlay render threw", err);
			}
		}
		c2d.restore();
		let out: ImageBitmap;
		try {
			out = off.transferToImageBitmap();
		} catch {
			this.release(off);
			return null;
		}
		this.release(off);
		recordPhase("overlaySkipped", performance.now() - __t0);
		return out;
	}

	/** @returns how many tiles were actually rebuilt, so a caller spreading one
	 *  budget over several rects (a batched undo/redo) can track what is left. */
	rebuildRectSync(
		rect: WorldRect,
		tier: number,
		clip?: WorldRect,
		maxTiles = 6,
	): number {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return 0;
		const __t0 = performance.now();
		const r = this.tileRange(rect, tier);
		const cr = clip ? this.tileRange(clip, tier) : null;
		let count = 0;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				if (cr && (tx < cr.tx0 || tx > cr.tx1 || ty < cr.ty0 || ty > cr.ty1))
					continue;
				if (count >= maxTiles) {
					recordPhase("rebuildSync", performance.now() - __t0);
					return count;
				}
				this.rebuildTileSync(tier, tx, ty);
				count++;
			}
		}
		if (count) recordPhase("rebuildSync", performance.now() - __t0);
		return count;
	}

	protected rebuildTileSync(tier: number, tx: number, ty: number): void {
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
		for (let i = 0; i < objects.length; i++) {
			try {
				this.renderer(c2d as any, objects[i], scale, q);
			} catch (err) {
				if (this.debug) console.warn("[Committed] sync render threw", err);
			}
		}
		c2d.restore();

		let bmp: ImageBitmap;
		try {
			bmp = off.transferToImageBitmap();
		} catch {
			this.release(off);
			return;
		}
		this.release(off);
		const bytes = this.BMP * this.BMP * 4;
		if (!this.ensureMemory(bytes)) {
			bmp.close();
			return;
		}
		this.store(key, tier, tx, ty, bmp, bytes, builtGen);
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
	protected store(
		key: string,
		tier: number,
		tx: number,
		ty: number,
		bitmap: ImageBitmap | null,
		bytes: number,
		builtGen: number,
		usable = (this.gen.get(key) ?? 0) === builtGen,
	) {
		this.tileStore.store(key, tier, tx, ty, bitmap, bytes, builtGen, usable);
	}

	isRegionReady(rect: WorldRect, zoom: number): boolean {
		const tier = this.pickActiveTier(zoom);
		// At overview tier the overview IS the picture. Not "ready" while it's dirty
		// — else a drop-layer (e.g. drag commit) hides before the regrown overview
		// repaints → flicker.
		if (tier <= this.OVERVIEW_TIER) return !this.overview.isDirty();
		const r = this.tileRange(rect, tier);
		for (let ty = r.ty0; ty <= r.ty1; ty++)
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				const t = this.tiles.get(key);
				if (!t || !this.isFresh(key, t)) return false;
			}
		return true;
	}

	/** True only if EVERY active-tier tile the rect covers is present, has a
	 *  bitmap, and is fresh — i.e. additiveStamp would FULLY cover the rect. A
	 *  partial stamp would leave stale tiles showing old content with no live
	 *  fallback (the draw-commit flicker), so callers gate stamping on this. */
	canStampAll(rect: WorldRect, tier: number): boolean {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false;
		const r = this.tileRange(rect, tier);
		for (let ty = r.ty0; ty <= r.ty1; ty++)
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				const t = this.tiles.get(key);
				if (!t || !t.bitmap || !this.isFresh(key, t)) return false;
			}
		return true;
	}

	// ── memory + pool ─────────────────────────────────────────────────────────
	protected ensureMemory(need: number): boolean {
		return this.tileStore.reserve(need);
	}

	protected acquire(): OffscreenCanvas {
		return this.tileStore.acquireCanvas();
	}

	protected release(c: OffscreenCanvas): void {
		this.tileStore.releaseCanvas(c);
	}

	/** Call when idle (gesture-end / bake-done) to release pooled backing store. */
	trimPool(keep = 2): void {
		this.tileStore.trimPool(keep);
	}

	/** Drop long-untouched empty tiles so the maps don't grow unbounded on a
	 * sparse infinite canvas. Empty tiles cost ~nothing to rebuild on revisit. */
	pruneEmpties(maxAgeMs = 30_000): void {
		this.tileStore.pruneEmpty(maxAgeMs);
	}
}
