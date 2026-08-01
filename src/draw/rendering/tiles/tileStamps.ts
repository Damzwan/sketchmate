import { TileBaker } from "./tileBaker";
import type { Bounded, WorldRect } from "./tileLayerBase";
import { minimumTiledZoom } from "../zoomLevels";

export class TileStamps<T extends Bounded> extends TileBaker<T> {
	additiveStamp(rect: WorldRect, obj: T, tier: number): boolean {
		if (tier < 0 || tier >= this.ZOOM_TIERS.length) return false;
		const scale = this.ZOOM_TIERS[tier];
		const r = this.tileRange(rect, tier);
		let stampedAny = false;
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				const oldGen = this.gen.get(key) ?? 0;
				const t = this.tiles.get(key);
				const stampable = !!(t && t.bitmap && t.builtGen === oldGen);

				if (!stampable) {
					if (this.tiles.has(key)) this.invalidateKey(key, rect);
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
				const key = `${tier}:${tx}:${ty}`;
				const oldGen = this.gen.get(key) ?? 0;
				const t = this.tiles.get(key);
				const fresh = !!t && t.builtGen === oldGen;

				if (t && fresh && !t.bitmap) continue; // fresh-empty: nothing to erase

				if (!t || !fresh || !t.bitmap) {
					if (this.tiles.has(key)) this.invalidateKey(key, rect);
					complete = false;
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
				const key = `${tier}:${tx}:${ty}`;
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

	get minTiledZoom(): number {
		return minimumTiledZoom(
			this.renderScale,
			this.ZOOM_TIERS,
			this.OVERVIEW_TIER,
		);
	}
	get maxUsableZoom(): number {
		// Finest tier ÷ renderScale — past this we'd ask for a tier we never bake.
		return this.ZOOM_TIERS[this.ZOOM_TIERS.length - 1] / this.renderScale;
	}

	reset(): void {
		this.tileStore.reset();
		this.overview.reset();
	}
}
