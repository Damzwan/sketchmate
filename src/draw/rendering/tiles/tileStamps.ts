import { TileBaker } from "./tileBaker";
import type { Bounded, WorldRect } from "./tileLayerBase";
import { isCanvasSurface } from "./tileStore";
import { tileKey, type TileKey } from "./tileKey";
import { minimumTiledZoom, minimumViewportZoomFor } from "../zoomLevels";

export class TileStamps<T extends Bounded> extends TileBaker<T> {
	/**
	 * Draw one object into a tile that already owns a writable canvas.
	 *
	 * This is the whole point of M2. The bitmap path for the same edit is:
	 * clear a scratch canvas, blit 588 KB of tile into it, render, allocate a
	 * NEW GPU texture via `transferToImageBitmap()`, destroy the old one. Per
	 * covered tile. Per stroke. Forever. Here it is one `drawImage` of the
	 * object onto pixels that are already in the right place.
	 *
	 * The generation bookkeeping is identical to the bitmap path — the tile stays
	 * FRESH under a bumped gen, because the pixels genuinely are up to date.
	 *
	 * @returns false if anything went wrong, so the caller can fall back to the
	 *   bitmap path rather than leave the tile half-drawn.
	 */
	private stampInPlace(
		key: TileKey,
		surface: OffscreenCanvas,
		obj: T,
		tier: number,
		tx: number,
		ty: number,
		oldGen: number,
	): boolean {
		const c2d = surface.getContext("2d");
		if (!c2d) return false;
		const scale = this.ZOOM_TIERS[tier];
		const world = this.tileToWorld(tier, tx, ty);
		const pad = this.OS / scale + 4 / scale;
		const q: WorldRect = {
			x: world.x - pad,
			y: world.y - pad,
			w: world.w + 2 * pad,
			h: world.h + 2 * pad,
		};
		c2d.setTransform(1, 0, 0, 1, 0, 0);
		c2d.save();
		c2d.translate(this.OS, this.OS);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(q.x, q.y, q.w, q.h);
		c2d.clip();
		try {
			// An eraser stroke carries its own destination-out composite operation
			// (fabric sets it in object.render), exactly as on the bitmap path, so
			// erase and add need no different treatment here.
			this.renderer(c2d as any, obj, scale, q);
		} catch {
			c2d.restore();
			return false;
		}
		c2d.restore();

		const newGen = oldGen + 1;
		this.gen.set(key, newGen);
		const tile = this.tiles.get(key)!;
		tile.builtGen = newGen;
		tile.usable = true;
		tile.transition = false;
		this.dirtyRects.delete(key);
		this.touchTile(key, tile);
		return true;
	}

	/**
	 * Can this tile take an in-place stamp, and if so promote it to a canvas.
	 *
	 * Promotion costs exactly what ONE bitmap-path stamp used to cost (a blit
	 * plus a canvas), and every subsequent stamp on the tile is then free of
	 * allocation entirely. Bounded by `HOT_TILE_MAX` because a canvas-backed tile
	 * holds a pooled canvas hostage and can composite slower than a bitmap.
	 */
	private hotSurfaceFor(key: TileKey): OffscreenCanvas | null {
		if (this.HOT_TILE_MAX === 0) return null;
		const tile = this.tiles.get(key);
		if (!tile?.bitmap) return null;
		if (isCanvasSurface(tile.bitmap)) return tile.bitmap;
		if (this.hotTileCount() >= this.HOT_TILE_MAX) return null;

		const off = this.acquire();
		const c2d = off.getContext("2d");
		if (!c2d) {
			this.release(off);
			return null;
		}
		c2d.setTransform(1, 0, 0, 1, 0, 0);
		c2d.clearRect(0, 0, this.BMP, this.BMP);
		try {
			c2d.drawImage(tile.bitmap, 0, 0);
		} catch {
			this.release(off);
			return null;
		}
		// The old texture is dead the moment its content lives in the canvas.
		(tile.bitmap as ImageBitmap).close();
		tile.bitmap = off;
		return off;
	}

	private hotTileCount(): number {
		let n = 0;
		for (const tile of this.tiles.values()) {
			if (isCanvasSurface(tile.bitmap)) n++;
		}
		return n;
	}

	/**
	 * Convert canvas-backed tiles back to immutable bitmaps.
	 *
	 * Called when a region settles (bake completion, pool trim). A bitmap is the
	 * cheaper resting state — one texture, no pooled canvas held hostage, and
	 * `drawImage` from a bitmap is at least as fast as from a canvas everywhere.
	 * The hot form only pays for itself while stamps are still arriving.
	 *
	 * `keep` leaves the N most recently used hot tiles alone, so a user who is
	 * still drawing in one spot does not pay a demote/promote cycle per stroke.
	 */
	demoteHotTiles(keep = 0): void {
		if (this.HOT_TILE_MAX === 0) return;
		const hot: { key: TileKey; lastUsed: number }[] = [];
		for (const [key, tile] of this.tiles) {
			if (isCanvasSurface(tile.bitmap))
				hot.push({ key, lastUsed: tile.lastUsed });
		}
		if (hot.length <= keep) return;
		hot.sort((a, b) => a.lastUsed - b.lastUsed); // coldest first
		for (let i = 0; i < hot.length - keep; i++) {
			const tile = this.tiles.get(hot[i].key);
			if (!tile || !isCanvasSurface(tile.bitmap)) continue;
			const canvas = tile.bitmap;
			let bmp: ImageBitmap;
			try {
				// Leaves `canvas` blank but reusable, which is why it can go straight
				// back to the pool instead of being reallocated.
				bmp = canvas.transferToImageBitmap();
			} catch {
				continue; // keep it hot rather than lose the pixels
			}
			tile.bitmap = bmp;
			this.release(canvas);
		}
	}

	additiveStamp(rect: WorldRect, obj: T, tier: number): boolean {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false;
		const scale = this.ZOOM_TIERS[tier];
		const r = this.tileRange(rect, tier);
		let stampedAny = false;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = tileKey(tier, tx, ty);
				const oldGen = this.gen.get(key) ?? 0;
				const t = this.tiles.get(key);
				const stampable = !!(t && t.bitmap && t.builtGen === oldGen);

				if (!stampable) {
					if (this.tiles.has(key)) this.invalidateKey(key, rect);
					continue;
				}

				// HOT PATH. If this tile already owns a writable canvas — or can be
				// promoted to one — the whole stamp is a single drawImage of the new
				// object, with no texture allocated and none destroyed. See M2.
				const hot = this.hotSurfaceFor(key);
				if (hot && this.stampInPlace(key, hot, obj, tier, tx, ty, oldGen)) {
					stampedAny = true;
					continue;
				}

				// Stampable: composite obj on top, store FRESH under a bumped gen.
				const newGen = oldGen + 1;
				this.gen.set(key, newGen);

				const world = this.tileToWorld(tier, tx, ty);
				const pad = this.OS / scale + 4 / scale;
				const q: WorldRect = {
					x: world.x - pad,
					y: world.y - pad,
					w: world.w + 2 * pad,
					h: world.h + 2 * pad,
				};

				const off = this.acquire();
				const c2d = off.getContext("2d");
				if (!c2d) {
					this.release(off);
					continue;
				}
				c2d.setTransform(1, 0, 0, 1, 0, 0);
				c2d.clearRect(0, 0, this.BMP, this.BMP);
				c2d.drawImage(t!.bitmap!, 0, 0);
				c2d.save();
				c2d.translate(this.OS, this.OS);
				c2d.scale(scale, scale);
				c2d.translate(-world.x, -world.y);
				c2d.beginPath();
				c2d.rect(q.x, q.y, q.w, q.h);
				c2d.clip();
				try {
					this.renderer(c2d as any, obj, scale, q);
				} catch {
					/* ignore */
				}
				c2d.restore();

				let bmp: ImageBitmap;
				try {
					bmp = off.transferToImageBitmap();
				} catch {
					this.release(off);
					continue;
				}
				this.release(off);
				const bytes = this.BMP * this.BMP * 4;
				if (!this.ensureMemory(bytes)) {
					bmp.close();
					continue;
				}
				this.store(key, tier, tx, ty, bmp, bytes, newGen);
				stampedAny = true;
			}
		}
		return stampedAny;
	}

	/**
	 * Destination-out stamp of an eraser stroke onto existing FRESH tiles.
	 * Tiles are flattened content and a plain eraser stroke is topmost, so
	 * punching it into the bitmap is PIXEL-EXACT — stamped tiles stay FRESH
	 * under a bumped gen and need NO rebake. The stroke's own
	 * globalCompositeOperation applies during render (fabric sets it in
	 * object.render), which also keeps alpha erasers correct.
	 *
	 * Returns false if any covered tile couldn't be stamped (missing / stale /
	 * failed) — those are left stale and the caller schedules a bake, which
	 * rebuilds them from the objects' already-updated clipPaths.
	 */
	eraseStamp(rect: WorldRect, obj: T, tier: number): boolean {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false;
		const scale = this.ZOOM_TIERS[tier];
		const r = this.tileRange(rect, tier);
		let complete = true;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = tileKey(tier, tx, ty);
				const oldGen = this.gen.get(key) ?? 0;
				const t = this.tiles.get(key);
				const fresh = !!t && t.builtGen === oldGen;

				if (t && fresh && !t.bitmap) continue; // fresh-empty: nothing to erase

				if (!t || !fresh || !t.bitmap) {
					if (this.tiles.has(key)) this.invalidateKey(key, rect);
					complete = false;
					continue;
				}

				// Erasing is the worst case for texture churn — a stroke commits
				// continuously, and every commit used to replace the texture of every
				// tile it crossed. This is where the in-place path earns the most.
				const hotErase = this.hotSurfaceFor(key);
				if (
					hotErase &&
					this.stampInPlace(key, hotErase, obj, tier, tx, ty, oldGen)
				) {
					continue;
				}

				const newGen = oldGen + 1;
				this.gen.set(key, newGen);

				const world = this.tileToWorld(tier, tx, ty);
				const pad = this.OS / scale + 4 / scale;
				const q: WorldRect = {
					x: world.x - pad,
					y: world.y - pad,
					w: world.w + 2 * pad,
					h: world.h + 2 * pad,
				};

				const off = this.acquire();
				const c2d = off.getContext("2d");
				if (!c2d) {
					this.release(off);
					complete = false;
					continue;
				}
				c2d.setTransform(1, 0, 0, 1, 0, 0);
				c2d.clearRect(0, 0, this.BMP, this.BMP);
				c2d.drawImage(t.bitmap, 0, 0);
				c2d.save();
				c2d.translate(this.OS, this.OS);
				c2d.scale(scale, scale);
				c2d.translate(-world.x, -world.y);
				c2d.beginPath();
				c2d.rect(q.x, q.y, q.w, q.h);
				c2d.clip();
				try {
					this.renderer(c2d as any, obj, scale, q);
				} catch {
					/* ignore */
				}
				c2d.restore();

				let bmp: ImageBitmap;
				try {
					bmp = off.transferToImageBitmap();
				} catch {
					this.release(off);
					complete = false;
					continue;
				}
				this.release(off);
				const bytes = this.BMP * this.BMP * 4;
				if (!this.ensureMemory(bytes)) {
					bmp.close();
					complete = false;
					continue;
				}
				this.store(key, tier, tx, ty, bmp, bytes, newGen);
			}
		}
		return complete;
	}

	/**
	 * Stamp a pre-rendered bitmap (the transform controller's drag layer) into
	 * the tiles covering `rect`, mapped through `m` (bitmap px → world, 2x3
	 * matrix). This makes a drag/scale/rotate commit O(touched tiles) drawImage
	 * work instead of re-rendering N objects — the pixels the user already sees
	 * on the GPU layer become the tile content immediately.
	 *
	 * Stamped tiles are stored STALE (gen bumped, builtGen left behind): they
	 * draw at full quality right away, while the async bake later repaints them
	 * exactly (correct z-order where the selection sits under other content).
	 *
	 * Returns true only if EVERY covered tile now shows the stamp (had a fresh
	 * bitmap, or was fresh-empty and got a new tile). On false the caller keeps
	 * its fallback cover (GPU layer) until the bake lands.
	 */
	stampBitmapRegion(
		rect: WorldRect,
		tier: number,
		bmp: ImageBitmap,
		m: [number, number, number, number, number, number],
	): boolean {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false;
		const scale = this.ZOOM_TIERS[tier];
		const r = this.tileRange(rect, tier);
		let complete = true;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = tileKey(tier, tx, ty);
				const oldGen = this.gen.get(key) ?? 0;
				const t = this.tiles.get(key);
				const fresh = !!t && t.builtGen === oldGen;

				if (!fresh || !t) {
					// stale or missing → bake owns it; make sure it's queued
					if (this.tiles.has(key)) this.invalidateKey(key, rect);
					complete = false;
					continue;
				}

				const world = this.tileToWorld(tier, tx, ty);
				const off = this.acquire();
				const c2d = off.getContext("2d");
				if (!c2d) {
					this.release(off);
					complete = false;
					continue;
				}
				c2d.setTransform(1, 0, 0, 1, 0, 0);
				c2d.clearRect(0, 0, this.BMP, this.BMP);
				if (t.bitmap) c2d.drawImage(t.bitmap, 0, 0);
				c2d.save();
				c2d.translate(this.OS, this.OS);
				c2d.scale(scale, scale);
				c2d.translate(-world.x, -world.y);
				c2d.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
				try {
					c2d.drawImage(bmp, 0, 0);
				} catch {
					c2d.restore();
					this.release(off);
					// Nothing was written, and the object HAS moved here — invalidate
					// properly (usable=false + dirty rect) rather than only bumping the
					// gen, which would leave the old pixels flagged as showable.
					this.invalidateKey(key, rect);
					complete = false;
					continue;
				}
				c2d.restore();

				let out: ImageBitmap;
				try {
					out = off.transferToImageBitmap();
				} catch {
					this.release(off);
					this.invalidateKey(key, rect);
					complete = false;
					continue;
				}
				this.release(off);
				const bytes = this.BMP * this.BMP * 4;
				if (!this.ensureMemory(bytes)) {
					out.close();
					this.invalidateKey(key, rect);
					complete = false;
					continue;
				}
				// Store visually-correct pixels under a BUMPED gen with the OLD
				// builtGen → tile draws now, bake repaints it exactly later.
				//
				// `usable: true` is what makes "draws now" true. The compositor
				// otherwise refuses any tile whose builtGen is behind, which silently
				// turned this whole fast path into "invalidate the region and show the
				// overview" — the blur-and-shift the user sees on every move commit.
				this.gen.set(key, oldGen + 1);
				this.dirtyRects.delete(key);
				this.store(key, tier, tx, ty, out, bytes, oldGen, true);
			}
		}
		return complete;
	}

	/**
	 * Called when the engine goes idle (bake done, gesture settled).
	 *
	 * Demote FIRST: a hot tile is holding a pooled canvas, so trimming the pool
	 * before demoting would free canvases that are about to be handed back and
	 * leave the hot ones outstanding. `keep = 1` lets a user still drawing in one
	 * place keep that tile hot across the idle gap instead of paying a
	 * demote/promote round trip on their next stroke.
	 */
	trimPool(keep = 2): void {
		this.demoteHotTiles(1);
		super.trimPool(keep);
	}

	get minTiledZoom(): number {
		return minimumTiledZoom(
			this.renderScale,
			this.ZOOM_TIERS,
			this.OVERVIEW_TIER,
		);
	}
	/** Overview pixels per world unit; 0 until the first bitmap exists. */
	get overviewDensity(): number {
		return this.overview.pixelDensity();
	}

	/**
	 * How far out the viewport may go, given the zoom at which the whole drawing
	 * fits on screen.
	 *
	 * The floor is content-derived, not a ladder constant: always reach the tiled
	 * tier, then as far out as `fitZoom` if the overview bitmap can serve it
	 * without visible upscale. See `minimumViewportZoomFor` for why. Callers that
	 * do not know the content bounds pass a non-finite `fitZoom` and get the
	 * tiled floor.
	 */
	minViewportZoomFor(fitZoom: number): number {
		return minimumViewportZoomFor(
			fitZoom,
			this.overview.pixelDensity(),
			this.renderScale,
			this.ZOOM_TIERS,
			this.OVERVIEW_TIER,
		);
	}

	/** The floor with no content information at all: the first tiled tier. */
	get minViewportZoom(): number {
		return this.minViewportZoomFor(Number.POSITIVE_INFINITY);
	}
	get maxUsableZoom(): number {
		// Finest tier ÷ renderScale — past this we'd ask for a tier we never bake.
		return this.ZOOM_TIERS[this.ZOOM_TIERS.length - 1] / this.renderScale;
	}

	reset(): void {
		this.tileStore.reset();
		this.overview.reset();
	}

	/**
	 * Drop every tile bitmap and the canvas pool, KEEPING the overview.
	 *
	 * For memory pressure / backgrounding. Tiles are the bulk of the engine's GPU
	 * footprint and are cheap to rebuild for whatever is on screen; the overview
	 * is one bitmap and is the only thing standing between a released cache and a
	 * blank board (it is the base layer under every unbaked tile). Releasing both
	 * is what turns a reclaim into a white screen — see
	 * `RenderEngine.releaseGraphicsMemory`.
	 */
	releaseTiles(): void {
		this.tileStore.reset();
	}
}
