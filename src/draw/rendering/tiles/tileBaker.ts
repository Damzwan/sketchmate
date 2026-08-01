import {
	recordLocalFallback,
	recordPhase,
	recordWorkerDeferral,
} from "@/draw/rendering/renderMetrics";
import { TileCompositor } from "./tileCompositor";
import {
	type Bounded,
	isRemoteBakeFailure,
	type RemoteBakeResult,
	type Yieldable,
	type WorldRect,
	MAX_SYNC_OVERLAY_CHILDREN,
	MAX_SYNC_OVERLAY_OBJECTS,
} from "./tileLayerBase";

/** Relative cost of a full tile rebuild vs a sub-rect repair. Used to budget
 *  synchronous repair by work rather than by tile count. */
const FULL_REBUILD_COST = 4;

/** Wall-clock slice a synchronous repair may spend. Sized to fit inside one
 *  frame alongside the composite that follows it. */
const REPAIR_BUDGET_MS = 6;

export class TileBaker<T extends Bounded> extends TileCompositor<T> {
	// ── baking ───────────────────────────────────────────────────────────────
	async bake(
		vpt: number[],
		px: { w: number; h: number },
		dpr: number,
		makeYielder: (label?: string) => Yieldable,
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
				makeYielder("overview-build") as any,
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
			const yielder = makeYielder("tile-bake");
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
		const queryStartedAt = performance.now();
		const objects = this.index.query(q);
		if (this.remoteBaker) {
			// The current spatial index returns an already z-sorted array, so W0
			// measures the two together. W2 moves both operations into the worker.
			recordPhase("workerPrepQuerySort", performance.now() - queryStartedAt);
		}
		const key = `${tier}:${tx}:${ty}`;
		const builtGen = this.gen.get(key) ?? 0;
		let localFallbackReason:
			| "worker-unavailable"
			| "backpressure"
			| "timeout"
			| "missing"
			| "refusal"
			| "z-order"
			| "hard-error"
			| "hybrid-overlay-failed"
			| null = null;
		let remoteFailureKind: "unsupported" | "failed" | null = null;

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
					const outcome = await this.remoteBaker(
						objects,
						world,
						scale,
						this.OS,
						this.BMP,
					);
					if (isRemoteBakeFailure(outcome)) {
						if (outcome.kind === "deferred") {
							recordWorkerDeferral(outcome.fallbackReason);
							return;
						}
						localFallbackReason = outcome.fallbackReason;
						remoteFailureKind = outcome.kind;
					} else {
						res = outcome;
					}
				} catch {
					localFallbackReason = "hard-error";
					remoteFailureKind = "failed";
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
						if (
							this.commitRemoteBitmap(
								key,
								tier,
								tx,
								ty,
								res.bitmap,
								bytes,
								builtGen,
							)
						)
							return;
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
						if (!bmp) {
							localFallbackReason = "hybrid-overlay-failed";
							remoteFailureKind = "unsupported";
						}
					}
					if (signal.aborted) {
						bmp?.close();
						return;
					}
					if (bmp) {
						const bytes = this.BMP * this.BMP * 4;
						if (
							!this.commitRemoteBitmap(key, tier, tx, ty, bmp, bytes, builtGen)
						) {
							bmp.close();
							return;
						}
						return;
					}
					// overlay failed → fall through to a full local render below.
				}
				// null → refused (interleaved z / all-unshippable) or failed: local below.
			}

			if (
				this.remoteBaker &&
				localFallbackReason &&
				remoteFailureKind &&
				!this.isSafeCompatibilityBake(objects)
			) {
				recordWorkerDeferral(localFallbackReason);
				return;
			}

			if (this.remoteBaker && localFallbackReason) {
				const admitted = await this.waitForIdle(signal);
				if (
					!admitted ||
					signal.aborted ||
					(this.gen.get(key) ?? 0) !== builtGen
				) {
					recordWorkerDeferral(localFallbackReason);
					return;
				}
			}

			// SUB-RECT REPAIR. If this tile still holds a bitmap and we know exactly
			// which sub-region an edit invalidated, repaint only that — same trick as
			// the synchronous path. An erase (or its undo) marks a thin trail dirty,
			// yet a full local bake re-renders every object in the tile at ~25 ms
			// each. Only valid when nothing else has already dropped the bitmap.
			const known = this.unionDirtyRects(key);
			if (known && this.tiles.get(key)?.bitmap) {
				const __tRepair = performance.now();
				if (this.repairTileRegionSync(tier, tx, ty, known)) {
					recordPhase("localBake", performance.now() - __tRepair);
					return;
				}
			}

			// LOCAL FALLBACK. The worker refused this tile (or is paused/failed), so
			// every object in it rasterizes HERE, on the main thread. Timed because it
			// is the single biggest per-object main-thread block in the engine and the
			// one whose cost tracks brush weight — a watercolor tile is far heavier
			// than the same tile in pencil.
			if (localFallbackReason) recordLocalFallback(localFallbackReason);
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
			this.tileStore.finishFlight(key);
		}
	}

	/**
	 * Main-thread compatibility rendering is the last correctness fallback for
	 * objects the worker cannot represent. Admit only work with a predictable
	 * upper bound; dense groups, deep erase clips, large paths, and large source
	 * images keep the overview/stale pixels until worker support catches up.
	 */
	private isSafeCompatibilityBake(objects: T[]): boolean {
		const mobile =
			typeof navigator !== "undefined" &&
			/Mobi|Android/i.test(navigator.userAgent);
		if (objects.length > (mobile ? 4 : 8)) return false;

		const maxChildren = mobile ? 16 : 32;
		const maxClipChildren = mobile ? 6 : 12;
		const maxPathPoints = mobile ? 750 : 2_000;
		const maxSourcePixels = mobile ? 512 * 512 : 1_024 * 1_024;

		for (const object of objects as any[]) {
			if (object.__hasImageClip) return false;
			if (
				Array.isArray(object._objects) &&
				object._objects.length > maxChildren
			) {
				return false;
			}
			if (
				Array.isArray(object.clipPath?._objects) &&
				object.clipPath._objects.length > maxClipChildren
			) {
				return false;
			}
			const compactPathPoints =
				typeof object._hasCompactPathGeometry === "function" &&
				object._hasCompactPathGeometry()
					? object.complexity()
					: null;
			const pathPoints =
				compactPathPoints ??
				(Array.isArray(object.path) ? object.path.length : 0);
			if (pathPoints > maxPathPoints) {
				return false;
			}

			const source = object.getElement?.() ?? object.stampCanvas;
			const sourcePixels = (source?.width ?? 0) * (source?.height ?? 0);
			if (sourcePixels > maxSourcePixels) return false;
		}
		return true;
	}

	private waitForIdle(signal: AbortSignal): Promise<boolean> {
		if (signal.aborted) return Promise.resolve(false);
		return new Promise((resolve) => {
			const run = () => resolve(!signal.aborted);
			const requestIdle = (globalThis as any).requestIdleCallback;
			if (requestIdle) requestIdle(run, { timeout: 1_000 });
			else setTimeout(run, 32);
		});
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
		// Budget in COST, not tiles. A sub-rect repair repaints a thin trail and
		// costs a fraction of a full rebuild, so charging both the same left an
		// edit's footprint only partly repaired — and the unrepaired part is what
		// the user sees drop to a coarser tier or the overview for a moment. This
		// lets a small edit be fixed across its whole visible footprint in one go,
		// while a dense region still stops after ~`maxTiles` real rebuilds.
		const budget = maxTiles * FULL_REBUILD_COST;
		let cost = 0;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				if (cr && (tx < cr.tx0 || tx > cr.tx1 || ty < cr.ty0 || ty > cr.ty1))
					continue;
				// Stop on WORK or on TIME, whichever comes first.
				//
				// A count-only cap is what leaves an edit half-repaired: a long
				// stroke at high zoom crosses far more tiles than the cap, and every
				// tile past it is what visibly drops to a coarser tier for a beat.
				// Repairs are cheap now, so the honest bound is a slice of a frame —
				// small and medium edits then get their whole visible footprint
				// repaired before the next paint and never show a fallback at all,
				// while a pathological region still stops on schedule.
				if (
					cost >= budget ||
					(count > 0 && performance.now() - __t0 >= REPAIR_BUDGET_MS)
				) {
					recordPhase("rebuildSync", performance.now() - __t0);
					return count;
				}
				cost += this.rebuildTileSync(tier, tx, ty, rect)
					? 1
					: FULL_REBUILD_COST;
				count++;
			}
		}
		if (count) recordPhase("rebuildSync", performance.now() - __t0);
		return count;
	}

	/**
	 * Repair only the part of a tile an edit actually touched.
	 *
	 * A full `rebuildTileSync` re-renders EVERY object in the tile — on a dense
	 * board that is tens of objects, each with an eraser ClippingGroup whose mask
	 * fabric rasterizes at tier resolution. Measured at ~13 ms per call (max
	 * 268 ms) during an erase-undo burst, for edits whose changed region is a
	 * thin eraser trail covering a few percent of the tile.
	 *
	 * When the tile already holds a bitmap and we know WHERE it went wrong
	 * (`dirtyRects`), the correct repair is: keep the bitmap, clear just that
	 * sub-rect, and re-render only the objects intersecting it, in z-order,
	 * clipped to it. Cost then scales with the edit, not with the tile.
	 *
	 * Falls back to the full rebuild when the sub-rect is unknown, covers most
	 * of the tile anyway, or the tile has no bitmap to patch.
	 */
	private repairTileRegionSync(
		tier: number,
		tx: number,
		ty: number,
		changed: WorldRect,
	): boolean {
		const key = `${tier}:${tx}:${ty}`;
		const tile = this.tiles.get(key);
		if (!tile?.bitmap) return false;

		// A repair marks the tile FRESH, so it must cover EVERYTHING still owed on
		// this tile — not merely the region the current caller cares about.
		//
		// The caller's rect is one edit. A tile can be carrying several: erase A
		// invalidates region A and its bake is still pending when undo B repairs
		// region B of the same tile. Repairing only B and declaring the tile fresh
		// silently drops A — the erase hole from A stays on screen for the rest of
		// the session, and nothing will ever invalidate it again. That is the
		// residual "small permanent holes", and it is worst early on, when the
		// cache is cold and several tiles carry a backlog at once.
		//
		// `dirtyRects` is the authoritative record of what is owed:
		//   rect      → repair the union of it and the caller's rect
		//   null      → whole tile is wrong; a sub-rect repair cannot be correct
		//   undefined → nothing recorded. Fine if the tile is fresh (a forced
		//               repair), never fine if it is stale for reasons unknown.
		const recorded = this.dirtyRects.get(key);
		if (recorded === null) return false;
		const isFresh = tile.builtGen === (this.gen.get(key) ?? 0);
		if (recorded === undefined && !isFresh) return false;
		// The repair marks the tile fresh, so it must cover EVERY recorded region,
		// not just the ones near the caller's rect.
		const owed = this.unionDirtyRects(key);
		if (owed) {
			const ux = Math.min(owed.x, changed.x);
			const uy = Math.min(owed.y, changed.y);
			const ux2 = Math.max(owed.x + owed.w, changed.x + changed.w);
			const uy2 = Math.max(owed.y + owed.h, changed.y + changed.h);
			changed = { x: ux, y: uy, w: ux2 - ux, h: uy2 - uy };
		}

		const scale = this.ZOOM_TIERS[tier];
		const world = this.tileToWorld(tier, tx, ty);
		// Intersect with the tile's own world rect, padded like a normal bake so
		// stroke width and antialiasing at the seam are redrawn, never clipped.
		const pad = this.OS / scale + 4 / scale;
		let x0 = Math.max(world.x - pad, changed.x - pad);
		let y0 = Math.max(world.y - pad, changed.y - pad);
		let x1 = Math.min(world.x + world.w + pad, changed.x + changed.w + pad);
		let y1 = Math.min(world.y + world.h + pad, changed.y + changed.h + pad);
		if (x1 <= x0 || y1 <= y0) return false;

		// SNAP TO WHOLE TILE PIXELS.
		//
		// The repair clears this region and redraws it clipped, while the pixels
		// outside stay as they were. If the boundary falls mid-pixel, that pixel
		// gets PARTIAL coverage from the clip's antialiasing instead of the full
		// coverage the old bitmap had — a permanently lighter 1px line straight
		// through the tile, which survives every later composite because the tile
		// is stored fresh. That is the "white seams that are still there after
		// baking". On an integer boundary the clip is pixel-exact: a pixel is
		// either fully repainted or fully untouched.
		//
		// Tile space is `px = OS + (world - tileOrigin) * scale`, so snapping in
		// px and converting back is what guarantees it. Expanding OUTWARD is safe:
		// a repainted pixel is redrawn from the objects, never approximated.
		const toPx = (w: number, origin: number) => this.OS + (w - origin) * scale;
		const toWorld = (px: number, origin: number) =>
			origin + (px - this.OS) / scale;
		x0 = toWorld(Math.floor(toPx(x0, world.x)), world.x);
		y0 = toWorld(Math.floor(toPx(y0, world.y)), world.y);
		x1 = toWorld(Math.ceil(toPx(x1, world.x)), world.x);
		y1 = toWorld(Math.ceil(toPx(y1, world.y)), world.y);
		const sub: WorldRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

		// Not worth the extra bitmap copy if we would redraw most of the tile.
		const tileArea = (world.w + 2 * pad) * (world.h + 2 * pad);
		if (sub.w * sub.h > tileArea * 0.6) return false;

		const objects = this.index.query(sub);
		const builtGen = this.gen.get(key) ?? 0;

		const off = this.acquire();
		const c2d = off.getContext("2d");
		if (!c2d) {
			this.release(off);
			return false;
		}
		c2d.setTransform(1, 0, 0, 1, 0, 0);
		c2d.clearRect(0, 0, this.BMP, this.BMP);
		try {
			c2d.drawImage(tile.bitmap, 0, 0);
		} catch {
			this.release(off);
			return false;
		}
		c2d.save();
		c2d.translate(this.OS, this.OS);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(sub.x, sub.y, sub.w, sub.h);
		c2d.clip();
		// Clear inside the clip, then repaint that region from scratch in z-order.
		c2d.clearRect(sub.x, sub.y, sub.w, sub.h);
		for (let i = 0; i < objects.length; i++) {
			try {
				this.renderer(c2d as any, objects[i], scale, sub);
			} catch (err) {
				if (this.debug) console.warn("[Committed] region repair threw", err);
			}
		}
		c2d.restore();

		let bmp: ImageBitmap;
		try {
			bmp = off.transferToImageBitmap();
		} catch {
			this.release(off);
			return false;
		}
		this.release(off);
		const bytes = this.BMP * this.BMP * 4;
		if (!this.ensureMemory(bytes)) {
			bmp.close();
			return false;
		}
		this.store(key, tier, tx, ty, bmp, bytes, builtGen);
		return true;
	}

	/** @returns true when the cheap sub-rect repair handled it. */
	protected rebuildTileSync(
		tier: number,
		tx: number,
		ty: number,
		changed?: WorldRect,
	): boolean {
		// Sub-rect repair first: an erase (or its undo) changes a thin trail, not a
		// whole tile, and re-rendering every object in the tile was the dominant
		// `rebuildSync` cost. Falls through to the full rebuild when it declines.
		if (changed && this.repairTileRegionSync(tier, tx, ty, changed)) return true;
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
			return false;
		}

		const off = this.acquire();
		const c2d = off.getContext("2d");
		if (!c2d) {
			this.release(off);
			return false;
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
			return false;
		}
		this.release(off);
		const bytes = this.BMP * this.BMP * 4;
		if (!this.ensureMemory(bytes)) {
			bmp.close();
			return false;
		}
		this.store(key, tier, tx, ty, bmp, bytes, builtGen);

		return false;
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
	private commitRemoteBitmap(
		key: string,
		tier: number,
		tx: number,
		ty: number,
		bitmap: ImageBitmap,
		bytes: number,
		builtGen: number,
	): boolean {
		const startedAt = performance.now();
		try {
			if (!this.ensureMemory(bytes)) return false;
			// Keep a result even if its generation advanced during the round-trip.
			// It remains non-fresh and its dirty sub-rect records what changed.
			this.store(key, tier, tx, ty, bitmap, bytes, builtGen);
			return true;
		} finally {
			recordPhase("workerResultCommit", performance.now() - startedAt);
		}
	}

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
