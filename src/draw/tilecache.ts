// src/draw/tilecache.ts
//
// Bug fixes in this revision:
//   - deferBitmapClose option: bitmap.close() runs in next microtask instead
//     of inline. Prevents tearing when a composite() call is still using a
//     bitmap reference that gets closed under it during a rapid additive
//     patch cycle.
//   - bakeMissing accepts an optional panHint to bias priority in the
//     direction of recent motion (predictive prefetch).
//   - fallback search radius widened to 3 by default for better cross-tier
//     visibility when adding objects at one zoom then viewing at another.

import { Yielder } from "@/draw/helpers/yielding.helper";

export interface WorldRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Bounded {
	id: string;
	getBoundingRect(
		absolute?: boolean,
		calculate?: boolean,
	): { left: number; top: number; width: number; height: number };
}

export type TileRenderer<T extends Bounded> = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: T,
	tierScale: number,
) => boolean | void;

export interface SpatialIndex<T extends Bounded> {
	query(rect: WorldRect): T[];
}

interface Tile {
	bitmap: ImageBitmap | null;
	tier: number;
	tx: number;
	ty: number;
	bytes: number;
	lastUsed: number;
	gen: number;
	patchCount: number;
}

interface BakeRequest {
	tier: number;
	tx: number;
	ty: number;
	priority: number;
}

export interface TileCacheOptions {
	tileSize?: number;
	zoomTiers?: number[];
	memoryBudgetMB?: number;
	fallbackTierRadius?: number;
	viewportPaddingTiles?: number;
	debug?: boolean;
	tierSwitchThreshold?: number;
	overscanPx?: number;
	debugOverlay?: boolean;
	additivePatchBudget?: number;
	deferBitmapClose?: boolean;
	maxRenderScale?: number;
	fallbackFinerRadius?: number;
}

export interface PanHint {
	panDx: number;
	panDy: number;
}

export class TileCache<T extends Bounded> {
	private readonly TILE_SIZE: number;
	private readonly OVERSCAN: number;
	private readonly BITMAP_SIZE: number;
	public readonly ZOOM_TIERS: number[];
	private readonly MEMORY_HARD: number;
	private readonly FALLBACK_RADIUS: number;
	private readonly VP_PADDING: number;
	private readonly debug: boolean;
	private readonly TIER_SWITCH_THRESHOLD: number;
	private readonly debugOverlay: boolean;
	private readonly PATCH_COUNT_BUDGET: number;
	private readonly DEFER_BITMAP_CLOSE: boolean;

	private tiles = new Map<string, Tile>();
	private objectToTiles = new Map<string, Set<string>>();
	private tileGen = new Map<string, number>();

	private memoryBytes = 0;
	private canvasPool: OffscreenCanvas[] = [];
	private readonly POOL_MAX = 4;
	private currentGen = 0;

	private lastRenderedTier: number | null = null;

	private readonly index: SpatialIndex<T>;
	private readonly renderer: TileRenderer<T>;

	private readonly MAX_RENDER_SCALE: number;
	private renderScale: number;
	private readonly FALLBACK_FINER_RADIUS: number;

	constructor(
		index: SpatialIndex<T>,
		renderer: TileRenderer<T>,
		opts: TileCacheOptions = {},
	) {
		this.index = index;
		this.renderer = renderer;
		this.TILE_SIZE = opts.tileSize ?? 256;
		this.OVERSCAN = Math.max(0, opts.overscanPx ?? 2);
		this.BITMAP_SIZE = this.TILE_SIZE + 2 * this.OVERSCAN;
		this.ZOOM_TIERS = opts.zoomTiers ?? [0.125, 0.25, 0.5, 1, 2, 4];
		this.MEMORY_HARD = (opts.memoryBudgetMB ?? 128) * 1024 * 1024;
		this.FALLBACK_RADIUS = opts.fallbackTierRadius ?? 3;
		this.VP_PADDING = opts.viewportPaddingTiles ?? 1;
		this.debug = opts.debug ?? false;
		this.TIER_SWITCH_THRESHOLD = opts.tierSwitchThreshold ?? 0.5;
		this.debugOverlay = opts.debugOverlay ?? false;
		this.PATCH_COUNT_BUDGET = opts.additivePatchBudget ?? 16;
		this.DEFER_BITMAP_CLOSE = opts.deferBitmapClose ?? false;
		this.MAX_RENDER_SCALE = opts.maxRenderScale ?? 2;
		this.renderScale = Math.min(
			typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
			this.MAX_RENDER_SCALE,
		);
		this.FALLBACK_FINER_RADIUS =
			opts.fallbackFinerRadius ?? Math.max(this.FALLBACK_RADIUS, 12);
	}

	public pickActiveTier(zoom: number): number {
		return this.pickTierForEffective(zoom * this.renderScale);
	}

	private pickTierForEffective(effective: number): number {
		const UPSCALE_TOL = 1.15; // tolerate ≤15% upscale before bumping a tier
		for (let i = 0; i < this.ZOOM_TIERS.length; i++) {
			if (this.ZOOM_TIERS[i] * UPSCALE_TOL >= effective) return i;
		}
		return this.ZOOM_TIERS.length - 1;
	}

	private tileRangeForWorld(worldRect: WorldRect, tier: number) {
		const scale = this.ZOOM_TIERS[tier];
		const tileWorldSize = this.TILE_SIZE / scale;
		return {
			tx0: Math.floor(worldRect.x / tileWorldSize),
			ty0: Math.floor(worldRect.y / tileWorldSize),
			tx1: Math.floor((worldRect.x + worldRect.w) / tileWorldSize),
			ty1: Math.floor((worldRect.y + worldRect.h) / tileWorldSize),
		};
	}

	private tileToWorld(tier: number, tx: number, ty: number): WorldRect {
		const scale = this.ZOOM_TIERS[tier];
		const tileWorldSize = this.TILE_SIZE / scale;
		return {
			x: tx * tileWorldSize,
			y: ty * tileWorldSize,
			w: tileWorldSize,
			h: tileWorldSize,
		};
	}

	private tierReadiness(tier: number, viewWorld: WorldRect) {
		const range = this.tileRangeForWorld(viewWorld, tier);
		let ready = 0;
		let total = 0;
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				total++;
				const t = this.tiles.get(`${tier}:${tx}:${ty}`);
				if (t && this.isFresh(`${tier}:${tx}:${ty}`, t)) ready++;
			}
		}
		return { ready, total };
	}

	private closeBitmap(bitmap: ImageBitmap | null) {
		if (!bitmap) return;
		if (this.DEFER_BITMAP_CLOSE) {
			queueMicrotask(() => bitmap.close());
		} else {
			bitmap.close();
		}
	}

	composite(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
		backgroundColor?: string,
	): CompositeReport {
		const zoom = vpt[0];
		const targetTier = this.pickActiveTier(zoom);

		const viewWorldX = -vpt[4] / zoom;
		const viewWorldY = -vpt[5] / zoom;
		const viewWorldW = viewportPx.w / (zoom * dpr);
		const viewWorldH = viewportPx.h / (zoom * dpr);
		const viewWorld: WorldRect = {
			x: viewWorldX,
			y: viewWorldY,
			w: viewWorldW,
			h: viewWorldH,
		};

		let pickedTier = targetTier;
		if (
			this.lastRenderedTier !== null &&
			this.lastRenderedTier !== targetTier
		) {
			const target = this.tierReadiness(targetTier, viewWorld);
			const targetRatio = target.total > 0 ? target.ready / target.total : 1;
			if (targetRatio < this.TIER_SWITCH_THRESHOLD) {
				const prev = this.tierReadiness(this.lastRenderedTier, viewWorld);
				const prevRatio = prev.total > 0 ? prev.ready / prev.total : 0;
				if (prevRatio >= 0.5 && prevRatio >= targetRatio + 0.2)
					pickedTier = this.lastRenderedTier;
			}
		}

		const pickedScale = this.ZOOM_TIERS[pickedTier];
		this.lastRenderedTier = pickedTier;

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, viewportPx.w, viewportPx.h);
		if (backgroundColor) {
			ctx.fillStyle = backgroundColor;
			ctx.fillRect(0, 0, viewportPx.w, viewportPx.h);
		}
		ctx.restore();

		const range = this.tileRangeForWorld(viewWorld, pickedTier);
		const tileWorldSize = this.TILE_SIZE / pickedScale;

		const a = vpt[0] * dpr;
		const d = vpt[3] * dpr;
		const e = vpt[4] * dpr;
		const f = vpt[5] * dpr;

		const xEdges = new Int32Array(range.tx1 - range.tx0 + 2);
		for (let i = 0; i <= range.tx1 - range.tx0 + 1; i++) {
			xEdges[i] = Math.floor((range.tx0 + i) * tileWorldSize * a + e);
		}
		const yEdges = new Int32Array(range.ty1 - range.ty0 + 2);
		for (let i = 0; i <= range.ty1 - range.ty0 + 1; i++) {
			yEdges[i] = Math.floor((range.ty0 + i) * tileWorldSize * d + f);
		}

		const exactDraws: any[] = [];
		const fallbackDraws: any[] = [];
		const report: CompositeReport = {
			tier: pickedTier,
			tilesRequested: 0,
			tilesExact: 0,
			tilesFallback: 0,
			tilesMissing: 0,
			missingTileKeys: [],
		};

		const OS = this.OVERSCAN;
		const TS = this.TILE_SIZE;

		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				report.tilesRequested++;
				const wx = tx * tileWorldSize;
				const wy = ty * tileWorldSize;
				const dx0 = xEdges[tx - range.tx0];
				const dx1 = xEdges[tx - range.tx0 + 1];
				const dy0 = yEdges[ty - range.ty0];
				const dy1 = yEdges[ty - range.ty0 + 1];
				const exactKey = `${pickedTier}:${tx}:${ty}`;
				const exact = this.tiles.get(exactKey);

				if (exact && this.isFresh(exactKey, exact)) {
					exact.lastUsed = performance.now();
					if (exact.bitmap !== null) {
						exactDraws.push({
							tile: exact,
							dx: dx0,
							dy: dy0,
							dw: dx1 - dx0,
							dh: dy1 - dy0,
						});
					}
					report.tilesExact++;
					continue;
				}

				let draws = this.findFallback(pickedTier, wx, wy, tileWorldSize, false);
				if (!draws || draws.length === 0)
					draws = this.findFallback(pickedTier, wx, wy, tileWorldSize, true);

				if (draws && draws.length > 0) {
					for (const fd of draws) {
						fallbackDraws.push({
							tile: fd.tile,
							sx: fd.sx,
							sy: fd.sy,
							sw: fd.sw,
							sh: fd.sh,
							dx: Math.floor(fd.dx * a + e),
							dy: Math.floor(fd.dy * d + f),
							dw:
								Math.ceil((fd.dx + fd.dw) * a + e) - Math.floor(fd.dx * a + e),
							dh:
								Math.ceil((fd.dy + fd.dh) * d + f) - Math.floor(fd.dy * d + f),
							stale: fd.stale,
						});
					}
					report.tilesFallback++;
					continue;
				}
				report.tilesMissing++;
				report.missingTileKeys.push(exactKey);
			}
		}

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		if (exactDraws.length > 0) {
			const exactFactor = (zoom * dpr) / pickedScale;
			const near1to1 = Math.abs(exactFactor - 1) < 0.01;
			ctx.imageSmoothingEnabled = !near1to1;
			for (const dr of exactDraws) {
				ctx.drawImage(
					dr.tile.bitmap,
					OS,
					OS,
					TS,
					TS,
					dr.dx,
					dr.dy,
					dr.dw,
					dr.dh,
				);
			}
		}
		if (fallbackDraws.length > 0) {
			// @ts-ignore
			ctx.imageSmoothingEnabled = true;
			// @ts-ignore
			ctx.imageSmoothingQuality = "medium";
			for (const dr of fallbackDraws) {
				if (dr.tile.bitmap === null) continue;
				ctx.drawImage(
					dr.tile.bitmap,
					dr.sx + OS,
					dr.sy + OS,
					dr.sw,
					dr.sh,
					dr.dx,
					dr.dy,
					dr.dw,
					dr.dh,
				);
			}
		}
		ctx.restore();

		if (this.debugOverlay) {
			this.drawDebugOverlay(ctx, {
				pickedTier,
				targetTier,
				viewWorld,
				range,
				tileWorldSize,
				a,
				d,
				e,
				f,
				fallbackDraws,
				report,
			});
		}
		return report;
	}

	public patchTilesAdditive(
		object: T,
		tiers?: number[],
	): { patched: number; skipped: number; tileKeys: string[] } {
		const b = object.getBoundingRect(true, true);
		const worldRect: WorldRect = {
			x: b.left,
			y: b.top,
			w: b.width,
			h: b.height,
		};
		if (!isFinite(worldRect.x) || worldRect.w <= 0 || worldRect.h <= 0) {
			return { patched: 0, skipped: 0, tileKeys: [] };
		}
		const tiersToPatch = tiers ?? this.ZOOM_TIERS.map((_, i) => i);
		let patched = 0,
			skipped = 0;
		const tileKeys: string[] = [];
		for (const tier of tiersToPatch) {
			if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
			const scale = this.ZOOM_TIERS[tier];
			const range = this.tileRangeForWorld(worldRect, tier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					const key = `${tier}:${tx}:${ty}`;
					const tile = this.tiles.get(key);
					if (!tile || !this.isFresh(key, tile)) {
						skipped++;
						continue;
					}
					if (tile.patchCount >= this.PATCH_COUNT_BUDGET) {
						this.bakeTileSync(tier, tx, ty, scale);
						patched++;
						tileKeys.push(key);
						let set = this.objectToTiles.get(object.id);
						if (!set) {
							set = new Set();
							this.objectToTiles.set(object.id, set);
						}
						set.add(key);
						continue;
					}
					if (this.additivelyPatchTile(tier, tx, ty, scale, object, tile)) {
						patched++;
						tileKeys.push(key);
						let set = this.objectToTiles.get(object.id);
						if (!set) {
							set = new Set();
							this.objectToTiles.set(object.id, set);
						}
						set.add(key);
					} else skipped++;
				}
			}
		}
		return { patched, skipped, tileKeys };
	}

	private additivelyPatchTile(
		tier: number,
		tx: number,
		ty: number,
		scale: number,
		object: T,
		existing: Tile,
	): boolean {
		const world = this.tileToWorld(tier, tx, ty);
		const overscanWorld = this.OVERSCAN / scale;
		const stroke = 4 / scale;
		const totalPadWorld = overscanWorld + stroke;
		const off = new OffscreenCanvas(this.BITMAP_SIZE, this.BITMAP_SIZE);
		const c2d = off.getContext("2d");
		if (!c2d) return false;
		if (existing.bitmap !== null) c2d.drawImage(existing.bitmap, 0, 0);
		c2d.save();
		c2d.translate(this.OVERSCAN, this.OVERSCAN);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(
			world.x - totalPadWorld,
			world.y - totalPadWorld,
			world.w + 2 * totalPadWorld,
			world.h + 2 * totalPadWorld,
		);
		c2d.clip();
		try {
			this.renderer(c2d as any, object, scale);
		} catch (err) {
			if (this.debug) console.warn("[TileCache] additive renderer threw", err);
			c2d.restore();
			return false;
		}
		c2d.restore();
		let newBitmap: ImageBitmap;
		try {
			// @ts-ignore
			newBitmap = off.transferToImageBitmap();
		} catch {
			return false;
		}
		this.closeBitmap(existing.bitmap);
		existing.bitmap = newBitmap;
		existing.lastUsed = performance.now();
		existing.patchCount += 1;
		return true;
	}

	public patchTilesAdditiveBatch(
		objects: T[],
		tiers?: number[],
	): { patched: number; skipped: number } {
		if (objects.length === 0) return { patched: 0, skipped: 0 };
		if (objects.length === 1) {
			const r = this.patchTilesAdditive(objects[0], tiers);
			return { patched: r.patched, skipped: r.skipped };
		}
		const tiersToPatch = tiers ?? this.ZOOM_TIERS.map((_, i) => i);
		const buckets = new Map<
			string,
			{ tier: number; tx: number; ty: number; objs: T[] }
		>();
		for (const obj of objects) {
			const b = obj.getBoundingRect(true, true);
			if (!isFinite(b.left) || b.width <= 0 || b.height <= 0) continue;
			const worldRect: WorldRect = {
				x: b.left,
				y: b.top,
				w: b.width,
				h: b.height,
			};
			for (const tier of tiersToPatch) {
				if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
				const range = this.tileRangeForWorld(worldRect, tier);
				for (let ty = range.ty0; ty <= range.ty1; ty++) {
					for (let tx = range.tx0; tx <= range.tx1; tx++) {
						const key = `${tier}:${tx}:${ty}`;
						let bucket = buckets.get(key);
						if (!bucket) {
							bucket = { tier, tx, ty, objs: [] };
							buckets.set(key, bucket);
						}
						bucket.objs.push(obj);
					}
				}
			}
		}
		let patched = 0,
			skipped = 0;
		for (const [key, bucket] of buckets) {
			const tile = this.tiles.get(key);
			if (!tile || !this.isFresh(key, tile)) {
				skipped++;
				continue;
			}
			if (tile.patchCount + bucket.objs.length >= this.PATCH_COUNT_BUDGET) {
				this.bakeTileSync(
					bucket.tier,
					bucket.tx,
					bucket.ty,
					this.ZOOM_TIERS[bucket.tier],
				);
				patched++;
				for (const obj of bucket.objs) {
					let set = this.objectToTiles.get(obj.id);
					if (!set) {
						set = new Set();
						this.objectToTiles.set(obj.id, set);
					}
					set.add(key);
				}
				continue;
			}
			if (
				this.additivelyPatchTileBatch(
					bucket.tier,
					bucket.tx,
					bucket.ty,
					this.ZOOM_TIERS[bucket.tier],
					bucket.objs,
					tile,
				)
			) {
				patched++;
				for (const obj of bucket.objs) {
					let set = this.objectToTiles.get(obj.id);
					if (!set) {
						set = new Set();
						this.objectToTiles.set(obj.id, set);
					}
					set.add(key);
				}
			} else skipped++;
		}
		return { patched, skipped };
	}

	public patchTilesAdditiveBatchRestricted(
		objects: T[],
		tiers: number[],
		restrictRect: WorldRect,
	): { patched: number; skipped: number } {
		if (objects.length === 0) return { patched: 0, skipped: 0 };
		const buckets = new Map<
			string,
			{ tier: number; tx: number; ty: number; objs: T[] }
		>();
		for (const obj of objects) {
			const b = obj.getBoundingRect(true, true);
			if (!isFinite(b.left) || b.width <= 0 || b.height <= 0) continue;
			const worldRect: WorldRect = {
				x: b.left,
				y: b.top,
				w: b.width,
				h: b.height,
			};
			for (const tier of tiers) {
				if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
				const range = this.tileRangeForWorld(worldRect, tier);
				const restrictRange = this.tileRangeForWorld(restrictRect, tier);
				const tx0 = Math.max(range.tx0, restrictRange.tx0);
				const ty0 = Math.max(range.ty0, restrictRange.ty0);
				const tx1 = Math.min(range.tx1, restrictRange.tx1);
				const ty1 = Math.min(range.ty1, restrictRange.ty1);
				for (let ty = ty0; ty <= ty1; ty++) {
					for (let tx = tx0; tx <= tx1; tx++) {
						const key = `${tier}:${tx}:${ty}`;
						let bucket = buckets.get(key);
						if (!bucket) {
							bucket = { tier, tx, ty, objs: [] };
							buckets.set(key, bucket);
						}
						bucket.objs.push(obj);
					}
				}
			}
		}
		let patched = 0,
			skipped = 0;
		for (const [key, bucket] of buckets) {
			const tile = this.tiles.get(key);
			if (!tile || !this.isFresh(key, tile)) {
				skipped++;
				continue;
			}
			if (tile.patchCount + bucket.objs.length >= this.PATCH_COUNT_BUDGET) {
				this.bakeTileSync(
					bucket.tier,
					bucket.tx,
					bucket.ty,
					this.ZOOM_TIERS[bucket.tier],
				);
				patched++;
				for (const obj of bucket.objs) {
					let set = this.objectToTiles.get(obj.id);
					if (!set) {
						set = new Set();
						this.objectToTiles.set(obj.id, set);
					}
					set.add(key);
				}
				continue;
			}
			if (
				this.additivelyPatchTileBatch(
					bucket.tier,
					bucket.tx,
					bucket.ty,
					this.ZOOM_TIERS[bucket.tier],
					bucket.objs,
					tile,
				)
			) {
				patched++;
				for (const obj of bucket.objs) {
					let set = this.objectToTiles.get(obj.id);
					if (!set) {
						set = new Set();
						this.objectToTiles.set(obj.id, set);
					}
					set.add(key);
				}
			} else skipped++;
		}
		return { patched, skipped };
	}

	public invalidateRectExceptInside(
		worldRect: WorldRect,
		insideRect: WorldRect,
		tiers: number[],
	): void {
		for (const tier of tiers) {
			if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
			const range = this.tileRangeForWorld(worldRect, tier);
			const insideRange = this.tileRangeForWorld(insideRect, tier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					if (
						tx >= insideRange.tx0 &&
						tx <= insideRange.tx1 &&
						ty >= insideRange.ty0 &&
						ty <= insideRange.ty1
					)
						continue;
					const key = `${tier}:${tx}:${ty}`;
					this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
				}
			}
		}
	}

	private additivelyPatchTileBatch(
		tier: number,
		tx: number,
		ty: number,
		scale: number,
		objects: T[],
		existing: Tile,
	): boolean {
		const world = this.tileToWorld(tier, tx, ty);
		const overscanWorld = this.OVERSCAN / scale;
		const stroke = 4 / scale;
		const totalPadWorld = overscanWorld + stroke;
		const off = new OffscreenCanvas(this.BITMAP_SIZE, this.BITMAP_SIZE);
		const c2d = off.getContext("2d");
		if (!c2d) return false;
		if (existing.bitmap !== null) c2d.drawImage(existing.bitmap, 0, 0);
		c2d.save();
		c2d.translate(this.OVERSCAN, this.OVERSCAN);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(
			world.x - totalPadWorld,
			world.y - totalPadWorld,
			world.w + 2 * totalPadWorld,
			world.h + 2 * totalPadWorld,
		);
		c2d.clip();
		for (const obj of objects) {
			try {
				this.renderer(c2d as any, obj, scale);
			} catch (err) {
				if (this.debug)
					console.warn("[TileCache] additive-batch renderer threw", err);
			}
		}
		c2d.restore();
		let newBitmap: ImageBitmap;
		try {
			// @ts-ignore
			newBitmap = off.transferToImageBitmap();
		} catch {
			return false;
		}
		this.closeBitmap(existing.bitmap);
		existing.bitmap = newBitmap;
		existing.lastUsed = performance.now();
		existing.patchCount += objects.length;
		return true;
	}

	patchTilesSync(
		worldRects: WorldRect[],
		tiers: number[],
	): { patched: number; skipped: number } {
		if (worldRects.length === 0 || tiers.length === 0)
			return { patched: 0, skipped: 0 };
		let patched = 0,
			skipped = 0;
		const seen = new Set<string>();
		for (const tier of tiers) {
			if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
			const scale = this.ZOOM_TIERS[tier];
			const dirtyTiles: Array<{ tx: number; ty: number }> = [];
			for (const r of worldRects) {
				const range = this.tileRangeForWorld(r, tier);
				for (let ty = range.ty0; ty <= range.ty1; ty++) {
					for (let tx = range.tx0; tx <= range.tx1; tx++) {
						const k = `${tier}:${tx}:${ty}`;
						if (seen.has(k)) continue;
						seen.add(k);
						dirtyTiles.push({ tx, ty });
					}
				}
			}
			for (const { tx, ty } of dirtyTiles) {
				const ok = this.bakeTileSync(tier, tx, ty, scale);
				if (ok) patched++;
				else skipped++;
			}
		}
		return { patched, skipped };
	}

	private bakeTileSync(
		tier: number,
		tx: number,
		ty: number,
		scale: number,
	): boolean {
		const world = this.tileToWorld(tier, tx, ty);
		const overscanWorld = this.OVERSCAN / scale;
		const stroke = 4 / scale;
		const totalPadWorld = overscanWorld + stroke;
		const queryRect: WorldRect = {
			x: world.x - totalPadWorld,
			y: world.y - totalPadWorld,
			w: world.w + 2 * totalPadWorld,
			h: world.h + 2 * totalPadWorld,
		};
		const objects = this.index.query(queryRect);
		const key = `${tier}:${tx}:${ty}`;
		const existing = this.tiles.get(key);
		const tileGen = this.tileGen.get(key) ?? 0;

		if (objects.length === 0) {
			if (existing) {
				this.closeBitmap(existing.bitmap);
				this.memoryBytes -= existing.bytes;
			}
			this.tiles.set(key, {
				bitmap: null,
				tier,
				tx,
				ty,
				bytes: 4,
				lastUsed: performance.now(),
				gen: tileGen,
				patchCount: 0,
			});
			this.memoryBytes += 4;
			return true;
		}
		const off = new OffscreenCanvas(this.BITMAP_SIZE, this.BITMAP_SIZE);
		const c2d = off.getContext("2d");
		if (!c2d) return false;
		c2d.setTransform(1, 0, 0, 1, 0, 0);
		c2d.clearRect(0, 0, this.BITMAP_SIZE, this.BITMAP_SIZE);
		c2d.save();
		c2d.translate(this.OVERSCAN, this.OVERSCAN);
		c2d.scale(scale, scale);
		c2d.translate(-world.x, -world.y);
		c2d.beginPath();
		c2d.rect(
			world.x - totalPadWorld,
			world.y - totalPadWorld,
			world.w + 2 * totalPadWorld,
			world.h + 2 * totalPadWorld,
		);
		c2d.clip();
		for (const obj of objects) {
			try {
				this.renderer(c2d as any, obj, scale);
			} catch (err) {
				if (this.debug) console.warn("[TileCache] renderer threw (sync)", err);
			}
		}
		c2d.restore();
		let bitmap: ImageBitmap;
		try {
			// @ts-ignore
			bitmap = off.transferToImageBitmap();
		} catch (err) {
			if (this.debug)
				console.warn("[TileCache] transferToImageBitmap failed", err);
			return false;
		}
		const bytes = this.BITMAP_SIZE * this.BITMAP_SIZE * 4;
		if (!this.ensureMemory(bytes)) {
			bitmap.close();
			return false;
		}
		if (existing) {
			this.closeBitmap(existing.bitmap);
			this.memoryBytes -= existing.bytes;
		}
		this.tiles.set(key, {
			bitmap,
			tier,
			tx,
			ty,
			bytes,
			lastUsed: performance.now(),
			gen: tileGen,
			patchCount: 0,
		});
		this.memoryBytes += bytes;
		for (const obj of objects) {
			let set = this.objectToTiles.get(obj.id);
			if (!set) {
				set = new Set();
				this.objectToTiles.set(obj.id, set);
			}
			set.add(key);
		}
		return true;
	}

	patchExistingTilesSync(worldRects: WorldRect[], tiers: number[]) {
		const seen = new Set<string>();
		for (const tier of tiers) {
			if (tier < 0 || tier >= this.ZOOM_TIERS.length) continue;
			const scale = this.ZOOM_TIERS[tier];
			for (const r of worldRects) {
				const range = this.tileRangeForWorld(r, tier);
				for (let ty = range.ty0; ty <= range.ty1; ty++) {
					for (let tx = range.tx0; tx <= range.tx1; tx++) {
						const k = `${tier}:${tx}:${ty}`;
						if (seen.has(k)) continue;
						seen.add(k);
						if (this.tiles.has(k)) this.bakeTileSync(tier, tx, ty, scale);
					}
				}
			}
		}
	}

	invalidateRect(worldRect: WorldRect): void {
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			const range = this.tileRangeForWorld(worldRect, tier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					const key = `${tier}:${tx}:${ty}`;
					this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
				}
			}
		}
	}

	invalidateObject(obj: T): void {
		const touched = this.objectToTiles.get(obj.id);
		if (touched) {
			for (const key of touched)
				this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
		}
		const b = obj.getBoundingRect(true, true);
		const worldRect: WorldRect = {
			x: b.left,
			y: b.top,
			w: b.width,
			h: b.height,
		};
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			const range = this.tileRangeForWorld(worldRect, tier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					const key = `${tier}:${tx}:${ty}`;
					this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
				}
			}
		}
	}

	invalidateObjectExcept(obj: T, exceptTiers: Set<number>): void {
		const b = obj.getBoundingRect(true, true);
		const worldRect: WorldRect = {
			x: b.left,
			y: b.top,
			w: b.width,
			h: b.height,
		};
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			if (exceptTiers.has(tier)) continue;
			const range = this.tileRangeForWorld(worldRect, tier);
			for (let ty = range.ty0; ty <= range.ty1; ty++) {
				for (let tx = range.tx0; tx <= range.tx1; tx++) {
					const key = `${tier}:${tx}:${ty}`;
					if (this.tiles.has(key)) {
						this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
					}
				}
			}
		}
	}

	invalidateAll(): void {
		for (const tile of this.tiles.values()) this.closeBitmap(tile.bitmap);
		this.tiles.clear();
		this.objectToTiles.clear();
		this.tileGen.clear();
		this.memoryBytes = 0;
		this.lastRenderedTier = null;
	}

	abortInflightBakes(): void {
		this.currentGen++;
	}
	private isFresh(key: string, tile: Tile): boolean {
		const expected = this.tileGen.get(key) ?? 0;
		return tile.gen === expected;
	}

	private findFallback(
		requestedTier: number,
		wx: number,
		wy: number,
		worldSize: number,
		allowStale: boolean,
	) {
		// Coarser first: cheap upscale, full coverage. Wins for zoom-in and for
		// areas where no finer detail has been baked.
		for (let dt = 1; dt <= this.FALLBACK_RADIUS; dt++) {
			const coarser = requestedTier - dt;
			if (coarser >= 0) {
				const d = this.findCoveringDraws(
					coarser,
					wx,
					wy,
					worldSize,
					allowStale,
				);
				if (d && d.length > 0) return d;
			}
		}
		// Finer next: downscale the already-baked detailed tier. Reaches much
		// further than the coarser search, so drawing while zoomed in and then
		// zooming out shows the fresh detail immediately instead of flashing
		// empty/stale until the coarse tier finishes baking.
		for (let dt = 1; dt <= this.FALLBACK_FINER_RADIUS; dt++) {
			const finer = requestedTier + dt;
			if (finer < this.ZOOM_TIERS.length) {
				const d = this.findCoveringDraws(finer, wx, wy, worldSize, allowStale);
				if (d && d.length > 0) return d;
			}
		}
		return null;
	}

	private findCoveringDraws(
		tier: number,
		wx: number,
		wy: number,
		worldSize: number,
		allowStale: boolean,
	) {
		const scale = this.ZOOM_TIERS[tier];
		const candidateWorldSize = this.TILE_SIZE / scale;
		const tx0 = Math.floor(wx / candidateWorldSize);
		const ty0 = Math.floor(wy / candidateWorldSize);
		const tx1 = Math.floor((wx + worldSize - 1e-6) / candidateWorldSize);
		const ty1 = Math.floor((wy + worldSize - 1e-6) / candidateWorldSize);
		const draws: any[] = [];
		for (let cty = ty0; cty <= ty1; cty++) {
			for (let ctx_ = tx0; ctx_ <= tx1; ctx_++) {
				const key = `${tier}:${ctx_}:${cty}`;
				const tile = this.tiles.get(key);
				if (!tile || tile.bitmap === null) continue;
				const fresh = this.isFresh(key, tile);
				if (!allowStale && !fresh) continue;
				tile.lastUsed = performance.now();
				const cwx = ctx_ * candidateWorldSize;
				const cwy = cty * candidateWorldSize;
				const ix0 = Math.max(wx, cwx);
				const iy0 = Math.max(wy, cwy);
				const ix1 = Math.min(wx + worldSize, cwx + candidateWorldSize);
				const iy1 = Math.min(wy + worldSize, cwy + candidateWorldSize);
				const iw = ix1 - ix0,
					ih = iy1 - iy0;
				if (iw <= 0 || ih <= 0) continue;
				draws.push({
					tile,
					sx: (ix0 - cwx) * scale,
					sy: (iy0 - cwy) * scale,
					sw: iw * scale,
					sh: ih * scale,
					dx: ix0,
					dy: iy0,
					dw: iw,
					dh: ih,
					stale: !fresh,
				});
			}
		}
		return draws.length > 0 ? draws : null;
	}

	async bakeRect(
		worldRect: WorldRect,
		tierIndex: number,
		yielder: Yielder,
		signal: AbortSignal,
	) {
		const gen = this.currentGen;
		const range = this.tileRangeForWorld(worldRect, tierIndex);
		const todo: BakeRequest[] = [];
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const key = `${tierIndex}:${tx}:${ty}`;
				const existing = this.tiles.get(key);
				if (existing && this.isFresh(key, existing)) continue;
				todo.push({ tier: tierIndex, tx, ty, priority: 0 });
			}
		}
		yielder.reset();
		for (const req of todo) {
			if (signal.aborted || gen !== this.currentGen) break;
			await this.bakeTile(req.tier, req.tx, req.ty, signal, gen);
			if (yielder.shouldYield()) await yielder.yield();
		}
	}

	async bakeMissing(
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
		yielder: Yielder,
		signal: AbortSignal,
		panHint?: PanHint,
	): Promise<BakeReport> {
		const gen = this.currentGen;
		const zoom = vpt[0];
		const tier = this.pickActiveTier(zoom);
		const scale = this.ZOOM_TIERS[tier];

		const viewWorldX = -vpt[4] / zoom;
		const viewWorldY = -vpt[5] / zoom;
		const viewWorldW = viewportPx.w / (zoom * dpr);
		const viewWorldH = viewportPx.h / (zoom * dpr);
		const tileWorldSize = this.TILE_SIZE / scale;
		const padding = this.VP_PADDING * tileWorldSize;

		let padLeft = padding,
			padRight = padding;
		let padTop = padding,
			padBottom = padding;
		if (
			panHint &&
			(Math.abs(panHint.panDx) > 0.5 || Math.abs(panHint.panDy) > 0.5)
		) {
			const dxNorm =
				panHint.panDx /
				Math.max(1, Math.abs(panHint.panDx) + Math.abs(panHint.panDy));
			const dyNorm =
				panHint.panDy /
				Math.max(1, Math.abs(panHint.panDx) + Math.abs(panHint.panDy));
			const extraPad = padding;
			if (dxNorm < 0) padRight += extraPad * Math.abs(dxNorm);
			else if (dxNorm > 0) padLeft += extraPad * Math.abs(dxNorm);
			if (dyNorm < 0) padBottom += extraPad * Math.abs(dyNorm);
			else if (dyNorm > 0) padTop += extraPad * Math.abs(dyNorm);
		}

		const paddedViewport: WorldRect = {
			x: viewWorldX - padLeft,
			y: viewWorldY - padTop,
			w: viewWorldW + padLeft + padRight,
			h: viewWorldH + padTop + padBottom,
		};
		const range = this.tileRangeForWorld(paddedViewport, tier);
		const cx = (range.tx0 + range.tx1) / 2;
		const cy = (range.ty0 + range.ty1) / 2;

		const todo: BakeRequest[] = [];
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				const existing = this.tiles.get(key);
				if (existing && this.isFresh(key, existing)) continue;
				let priority = (tx - cx) ** 2 + (ty - cy) ** 2;
				if (panHint) {
					const tileDirX = tx - cx;
					const tileDirY = ty - cy;
					const align = tileDirX * -panHint.panDx + tileDirY * -panHint.panDy;
					if (align > 0) priority *= 0.7;
				}
				todo.push({ tier, tx, ty, priority });
			}
		}
		todo.sort((a, b) => a.priority - b.priority);

		const report: BakeReport = {
			tier,
			requested: todo.length,
			baked: 0,
			aborted: false,
			remaining: 0,
		};
		yielder.reset();
		for (let i = 0; i < todo.length; i++) {
			const req = todo[i];
			if (signal.aborted || gen !== this.currentGen) {
				report.aborted = true;
				report.remaining = todo.length - i;
				break;
			}
			const ok = await this.bakeTile(req.tier, req.tx, req.ty, signal, gen);
			if (ok) report.baked++;
			if (yielder.shouldYield()) await yielder.yield();
		}
		return report;
	}

	private async bakeTile(
		tier: number,
		tx: number,
		ty: number,
		signal: AbortSignal,
		gen: number,
	): Promise<boolean> {
		if (signal.aborted || gen !== this.currentGen) return false;
		const scale = this.ZOOM_TIERS[tier];
		const world = this.tileToWorld(tier, tx, ty);
		const overscanWorld = this.OVERSCAN / scale;
		const stroke = 4 / scale;
		const totalPadWorld = overscanWorld + stroke;
		const queryRect: WorldRect = {
			x: world.x - totalPadWorld,
			y: world.y - totalPadWorld,
			w: world.w + 2 * totalPadWorld,
			h: world.h + 2 * totalPadWorld,
		};
		const objects = this.index.query(queryRect);
		let bitmap: ImageBitmap | null = null;
		let isDummy = false;
		if (objects.length === 0) {
			bitmap = null;
			isDummy = true;
		} else {
			const off = this.acquireCanvas();
			const c2d = off.getContext("2d");
			if (!c2d) {
				this.releaseCanvas(off);
				return false;
			}
			c2d.setTransform(1, 0, 0, 1, 0, 0);
			c2d.clearRect(0, 0, this.BITMAP_SIZE, this.BITMAP_SIZE);
			c2d.save();
			c2d.translate(this.OVERSCAN, this.OVERSCAN);
			c2d.scale(scale, scale);
			c2d.translate(-world.x, -world.y);
			c2d.beginPath();
			c2d.rect(
				world.x - totalPadWorld,
				world.y - totalPadWorld,
				world.w + 2 * totalPadWorld,
				world.h + 2 * totalPadWorld,
			);
			c2d.clip();
			for (const obj of objects) {
				try {
					this.renderer(c2d as any, obj, scale);
				} catch (err) {
					if (this.debug) console.warn("[TileCache] renderer threw", err);
				}
			}
			c2d.restore();
			if (signal.aborted || gen !== this.currentGen) {
				this.releaseCanvas(off);
				return false;
			}
			try {
				bitmap = await createImageBitmap(off);
			} catch {
				this.releaseCanvas(off);
				return false;
			}
			this.releaseCanvas(off);
		}
		if (signal.aborted || gen !== this.currentGen) {
			if (!isDummy && bitmap) bitmap.close();
			return false;
		}
		const bytes = isDummy ? 4 : this.BITMAP_SIZE * this.BITMAP_SIZE * 4;
		if (!this.ensureMemory(bytes)) {
			if (!isDummy && bitmap) bitmap.close();
			return false;
		}
		const key = `${tier}:${tx}:${ty}`;
		const existing = this.tiles.get(key);
		if (existing) {
			this.closeBitmap(existing.bitmap);
			this.memoryBytes -= existing.bytes;
		}
		const tileGen = this.tileGen.get(key) ?? 0;
		this.tiles.set(key, {
			bitmap: bitmap!,
			tier,
			tx,
			ty,
			bytes,
			lastUsed: performance.now(),
			gen: tileGen,
			patchCount: 0,
		});
		this.memoryBytes += bytes;
		for (const obj of objects) {
			let set = this.objectToTiles.get(obj.id);
			if (!set) {
				set = new Set();
				this.objectToTiles.set(obj.id, set);
			}
			set.add(key);
		}
		return true;
	}

	private ensureMemory(needed: number): boolean {
		if (this.memoryBytes + needed <= this.MEMORY_HARD) return true;
		const sorted = [...this.tiles.entries()].sort(
			(a, b) => a[1].lastUsed - b[1].lastUsed,
		);
		for (const [key, tile] of sorted) {
			this.closeBitmap(tile.bitmap);
			this.memoryBytes -= tile.bytes;
			this.tiles.delete(key);
			if (this.memoryBytes + needed <= this.MEMORY_HARD) return true;
		}
		return false;
	}

	private acquireCanvas(): OffscreenCanvas {
		const c = this.canvasPool.pop();
		if (c) return c;
		return new OffscreenCanvas(this.BITMAP_SIZE, this.BITMAP_SIZE);
	}
	private releaseCanvas(c: OffscreenCanvas): void {
		if (this.canvasPool.length < this.POOL_MAX) this.canvasPool.push(c);
	}

	private drawDebugOverlay(ctx: any, info: any): void {
		const {
			pickedTier,
			targetTier,
			viewWorld,
			range,
			tileWorldSize,
			a,
			d,
			e,
			f,
			fallbackDraws,
			report,
		} = info;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.font = "11px monospace";
		ctx.textBaseline = "top";
		const missingSet = new Set(report.missingTileKeys);
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const wx = tx * tileWorldSize,
					wy = ty * tileWorldSize;
				const dx0 = Math.floor(wx * a + e),
					dy0 = Math.floor(wy * d + f);
				const dx1 = Math.ceil((wx + tileWorldSize) * a + e);
				const dy1 = Math.ceil((wy + tileWorldSize) * d + f);
				const dw = dx1 - dx0,
					dh = dy1 - dy0;
				const exactKey = `${pickedTier}:${tx}:${ty}`;
				const tile = this.tiles.get(exactKey);
				let state: string;
				if (tile && this.isFresh(exactKey, tile)) state = "exact";
				else if (missingSet.has(exactKey)) state = "missing";
				else {
					let anyStale = false;
					for (const fd of fallbackDraws) {
						if (
							fd.dx < dx1 &&
							fd.dx + fd.dw > dx0 &&
							fd.dy < dy1 &&
							fd.dy + fd.dh > dy0
						) {
							if (fd.stale) {
								anyStale = true;
								break;
							}
						}
					}
					state = anyStale ? "fallback-stale" : "fallback-fresh";
				}
				if (state === "missing") {
					ctx.fillStyle = "rgba(255,0,0,0.35)";
					ctx.fillRect(dx0, dy0, dw, dh);
					ctx.strokeStyle = "red";
					ctx.lineWidth = 2;
				} else if (state === "fallback-stale") {
					ctx.strokeStyle = "magenta";
					ctx.lineWidth = 2;
				} else if (state === "fallback-fresh") {
					ctx.strokeStyle = "rgba(255,200,0,0.9)";
					ctx.lineWidth = 1.5;
				} else {
					ctx.strokeStyle = "rgba(0,200,0,0.7)";
					ctx.lineWidth = 1;
				}
				ctx.strokeRect(dx0 + 0.5, dy0 + 0.5, dw - 1, dh - 1);
				ctx.fillStyle = state === "missing" ? "white" : "rgba(0,0,0,0.75)";
				ctx.fillText(`T${pickedTier} ${tx},${ty}`, dx0 + 4, dy0 + 4);
				ctx.fillText(state, dx0 + 4, dy0 + 18);
				if (tile) ctx.fillText(`p${tile.patchCount}`, dx0 + 4, dy0 + 32);
			}
		}
		const hud: string[] = [];
		hud.push(`picked: T${pickedTier}  target: T${targetTier}`);
		hud.push(
			`exact:${report.tilesExact} fb:${report.tilesFallback} miss:${report.tilesMissing} req:${report.tilesRequested}`,
		);
		hud.push(
			`mem:${(this.memoryBytes / 1024 / 1024).toFixed(1)}MB  tiles:${this.tiles.size}`,
		);
		for (let t = 0; t < this.ZOOM_TIERS.length; t++) {
			const r = this.tierReadiness(t, viewWorld);
			const ratio = r.total > 0 ? r.ready / r.total : 0;
			const marker = t === pickedTier ? "►" : t === targetTier ? "·" : " ";
			hud.push(
				`${marker} T${t} ×${this.ZOOM_TIERS[t]}: ${r.ready}/${r.total} (${(ratio * 100).toFixed(0)}%)`,
			);
		}
		const pad = 6,
			lineH = 14,
			boxW = 260;
		const boxH = hud.length * lineH + pad * 2;
		ctx.fillStyle = "rgba(0,0,0,0.78)";
		ctx.fillRect(100, 8, boxW, boxH);
		ctx.fillStyle = "white";
		for (let i = 0; i < hud.length; i++)
			ctx.fillText(hud[i], 100 + pad, 8 + pad + i * lineH);
		ctx.restore();
	}
}

export interface CompositeReport {
	tier: number;
	tilesRequested: number;
	tilesExact: number;
	tilesFallback: number;
	tilesMissing: number;
	missingTileKeys: string[];
}

export interface BakeReport {
	tier: number;
	requested: number;
	baked: number;
	aborted: boolean;
	remaining: number;
}
