// src/draw/tilecache.ts
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
	): {
		left: number;
		top: number;
		width: number;
		height: number;
	};
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
	bitmap: ImageBitmap;
	tier: number;
	tx: number;
	ty: number;
	bytes: number;
	lastUsed: number;
	gen: number;
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
}

export interface TileDebugInfo {
	tier: number;
	tx: number;
	ty: number;
	scale: number;
	worldRect: WorldRect;
	queryRect: WorldRect;
	objectCount: number;
	objectIds: string[];
	objectBounds: Array<{
		id: string;
		bounds: { left: number; top: number; width: number; height: number };
		visible: boolean;
		opacity: number;
		intersectsQuery: boolean;
		containedInQuery: boolean;
	}>;
	tileExists: boolean;
	tileFresh: boolean;
	tileGen: number;
	expectedGen: number;
	hasBitmap: boolean;
	isDummy: boolean;
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

	private tiles = new Map<string, Tile>();
	private objectToTiles = new Map<string, Set<string>>();
	private tileGen = new Map<string, number>();

	private memoryBytes = 0;
	private canvasPool: OffscreenCanvas[] = [];
	private readonly POOL_MAX = 4;
	private currentGen = 0;

	private emptyBitmap: ImageBitmap | null = null;

	private lastRenderedTier: number | null = null;

	private readonly index: SpatialIndex<T>;
	private readonly renderer: TileRenderer<T>;

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
		this.FALLBACK_RADIUS = opts.fallbackTierRadius ?? 2;
		this.VP_PADDING = opts.viewportPaddingTiles ?? 1;
		this.debug = opts.debug ?? false;
		this.TIER_SWITCH_THRESHOLD = opts.tierSwitchThreshold ?? 0.5;
		this.debugOverlay = opts.debugOverlay ?? false;
	}

	public pickTierForZoom(zoom: number): number {
		const logZ = Math.log2(Math.max(zoom, 1e-6));
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < this.ZOOM_TIERS.length; i++) {
			const d = Math.abs(Math.log2(this.ZOOM_TIERS[i]) - logZ);
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			}
		}
		return bestIdx;
	}

	private tileRangeForWorld(
		worldRect: WorldRect,
		tier: number,
	): { tx0: number; ty0: number; tx1: number; ty1: number } {
		const scale = this.ZOOM_TIERS[tier];
		const tileWorldSize = this.TILE_SIZE / scale;
		const tx0 = Math.floor(worldRect.x / tileWorldSize);
		const ty0 = Math.floor(worldRect.y / tileWorldSize);
		const tx1 = Math.floor((worldRect.x + worldRect.w) / tileWorldSize);
		const ty1 = Math.floor((worldRect.y + worldRect.h) / tileWorldSize);
		return { tx0, ty0, tx1, ty1 };
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

	private tierReadiness(
		tier: number,
		viewWorld: WorldRect,
	): { ready: number; total: number } {
		const range = this.tileRangeForWorld(viewWorld, tier);
		let ready = 0;
		let total = 0;
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				total++;
				const key = `${tier}:${tx}:${ty}`;
				const t = this.tiles.get(key);
				if (t && this.isFresh(key, t)) ready++;
			}
		}
		return { ready, total };
	}

	composite(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
		backgroundColor?: string,
	): CompositeReport {
		const zoom = vpt[0];
		const targetTier = this.pickTierForZoom(zoom);

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
				if (prevRatio >= 0.5 && prevRatio >= targetRatio + 0.2) {
					pickedTier = this.lastRenderedTier;
				}
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

		interface ExactDraw {
			tile: Tile;
			dx: number;
			dy: number;
			dw: number;
			dh: number;
		}
		interface FallbackDraw {
			tile: Tile;
			sx: number;
			sy: number;
			sw: number;
			sh: number;
			dx: number;
			dy: number;
			dw: number;
			dh: number;
			stale: boolean;
		}

		const exactDraws: ExactDraw[] = [];
		const fallbackDraws: FallbackDraw[] = [];

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
				const wx2 = wx + tileWorldSize;
				const wy2 = wy + tileWorldSize;

				const dx0 = Math.floor(wx * a + e);
				const dy0 = Math.floor(wy * d + f);
				const dx1 = Math.ceil(wx2 * a + e);
				const dy1 = Math.ceil(wy2 * d + f);

				const exactKey = `${pickedTier}:${tx}:${ty}`;
				const exact = this.tiles.get(exactKey);

				if (exact && this.isFresh(exactKey, exact)) {
					exact.lastUsed = performance.now();
					exactDraws.push({
						tile: exact,
						dx: dx0,
						dy: dy0,
						dw: dx1 - dx0,
						dh: dy1 - dy0,
					});
					report.tilesExact++;
					continue;
				}

				let draws = this.findFallback(pickedTier, wx, wy, tileWorldSize, false);
				if (!draws || draws.length === 0) {
					draws = this.findFallback(pickedTier, wx, wy, tileWorldSize, true);
				}

				if (draws && draws.length > 0) {
					for (const fd of draws) {
						const fdx0 = Math.floor(fd.dx * a + e);
						const fdy0 = Math.floor(fd.dy * d + f);
						const fdx1 = Math.ceil((fd.dx + fd.dw) * a + e);
						const fdy1 = Math.ceil((fd.dy + fd.dh) * d + f);

						fallbackDraws.push({
							tile: fd.tile,
							sx: fd.sx,
							sy: fd.sy,
							sw: fd.sw,
							sh: fd.sh,
							dx: fdx0,
							dy: fdy0,
							dw: fdx1 - fdx0,
							dh: fdy1 - fdy0,
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
			// @ts-ignore
			ctx.imageSmoothingEnabled = false;
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
			ctx.imageSmoothingQuality = "low";
			for (const dr of fallbackDraws) {
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

	private drawDebugOverlay(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		info: {
			pickedTier: number;
			targetTier: number;
			viewWorld: WorldRect;
			range: { tx0: number; ty0: number; tx1: number; ty1: number };
			tileWorldSize: number;
			a: number;
			d: number;
			e: number;
			f: number;
			fallbackDraws: Array<{
				dx: number;
				dy: number;
				dw: number;
				dh: number;
				tile: Tile;
				stale: boolean;
			}>;
			report: CompositeReport;
		},
	): void {
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
		// @ts-ignore
		ctx.imageSmoothingEnabled = false;
		ctx.font = "11px monospace";
		ctx.textBaseline = "top";

		type TileState = "exact" | "fallback-fresh" | "fallback-stale" | "missing";
		const missingSet = new Set(report.missingTileKeys);

		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const wx = tx * tileWorldSize;
				const wy = ty * tileWorldSize;
				const wx2 = wx + tileWorldSize;
				const wy2 = wy + tileWorldSize;
				const dx0 = Math.floor(wx * a + e);
				const dy0 = Math.floor(wy * d + f);
				const dx1 = Math.ceil(wx2 * a + e);
				const dy1 = Math.ceil(wy2 * d + f);
				const dw = dx1 - dx0;
				const dh = dy1 - dy0;

				const exactKey = `${pickedTier}:${tx}:${ty}`;
				const tile = this.tiles.get(exactKey);

				let state: TileState;
				if (tile && this.isFresh(exactKey, tile)) {
					state = "exact";
				} else if (missingSet.has(exactKey)) {
					state = "missing";
				} else {
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
					ctx.fillStyle = "rgba(255, 0, 0, 0.35)";
					ctx.fillRect(dx0, dy0, dw, dh);
					ctx.strokeStyle = "red";
					ctx.lineWidth = 2;
				} else if (state === "fallback-stale") {
					ctx.strokeStyle = "magenta";
					ctx.lineWidth = 2;
				} else if (state === "fallback-fresh") {
					ctx.strokeStyle = "rgba(255, 200, 0, 0.9)";
					ctx.lineWidth = 1.5;
				} else {
					ctx.strokeStyle = "rgba(0, 200, 0, 0.7)";
					ctx.lineWidth = 1;
				}
				ctx.strokeRect(dx0 + 0.5, dy0 + 0.5, dw - 1, dh - 1);

				ctx.fillStyle = state === "missing" ? "white" : "rgba(0,0,0,0.75)";
				ctx.fillText(`T${pickedTier} ${tx},${ty}`, dx0 + 4, dy0 + 4);
				ctx.fillText(state, dx0 + 4, dy0 + 18);
			}
		}

		const hudLines: string[] = [];
		hudLines.push(`picked: T${pickedTier}  target: T${targetTier}`);
		hudLines.push(
			`exact: ${report.tilesExact}  fb: ${report.tilesFallback}  miss: ${report.tilesMissing}  req: ${report.tilesRequested}`,
		);
		hudLines.push(
			`mem: ${(this.memoryBytes / 1024 / 1024).toFixed(1)}MB  tiles: ${this.tiles.size}`,
		);
		for (let t = 0; t < this.ZOOM_TIERS.length; t++) {
			const r = this.tierReadiness(t, viewWorld);
			const ratio = r.total > 0 ? r.ready / r.total : 0;
			const marker = t === pickedTier ? "►" : t === targetTier ? "·" : " ";
			hudLines.push(
				`${marker} T${t} (×${this.ZOOM_TIERS[t]}): ${r.ready}/${r.total} (${(ratio * 100).toFixed(0)}%)`,
			);
		}

		const padding = 6;
		const lineH = 14;
		const boxW = 260;
		const boxH = hudLines.length * lineH + padding * 2;
		ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
		ctx.fillRect(100, 8, boxW, boxH);
		ctx.fillStyle = "white";
		for (let i = 0; i < hudLines.length; i++) {
			ctx.fillText(hudLines[i], 100 + padding, 8 + padding + i * lineH);
		}

		ctx.restore();
	}

	private findFallback(
		requestedTier: number,
		wx: number,
		wy: number,
		worldSize: number,
		allowStale: boolean,
	): Array<{
		tile: Tile;
		sx: number;
		sy: number;
		sw: number;
		sh: number;
		dx: number;
		dy: number;
		dw: number;
		dh: number;
		stale: boolean;
	}> | null {
		for (let dt = 1; dt <= this.FALLBACK_RADIUS; dt++) {
			const coarserTier = requestedTier - dt;
			if (coarserTier >= 0) {
				const draws = this.findCoveringDraws(
					coarserTier,
					wx,
					wy,
					worldSize,
					allowStale,
				);
				if (draws && draws.length > 0) return draws;
			}
		}
		for (let dt = 1; dt <= this.FALLBACK_RADIUS; dt++) {
			const finerTier = requestedTier + dt;
			if (finerTier < this.ZOOM_TIERS.length) {
				const draws = this.findCoveringDraws(
					finerTier,
					wx,
					wy,
					worldSize,
					allowStale,
				);
				if (draws && draws.length > 0) return draws;
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
	): Array<{
		tile: Tile;
		sx: number;
		sy: number;
		sw: number;
		sh: number;
		dx: number;
		dy: number;
		dw: number;
		dh: number;
		stale: boolean;
	}> | null {
		const scale = this.ZOOM_TIERS[tier];
		const candidateWorldSize = this.TILE_SIZE / scale;

		const tx0 = Math.floor(wx / candidateWorldSize);
		const ty0 = Math.floor(wy / candidateWorldSize);
		const tx1 = Math.floor((wx + worldSize - 1e-6) / candidateWorldSize);
		const ty1 = Math.floor((wy + worldSize - 1e-6) / candidateWorldSize);

		const draws: Array<{
			tile: Tile;
			sx: number;
			sy: number;
			sw: number;
			sh: number;
			dx: number;
			dy: number;
			dw: number;
			dh: number;
			stale: boolean;
		}> = [];

		for (let cty = ty0; cty <= ty1; cty++) {
			for (let ctx_ = tx0; ctx_ <= tx1; ctx_++) {
				const key = `${tier}:${ctx_}:${cty}`;
				const tile = this.tiles.get(key);
				if (!tile) continue;
				const fresh = this.isFresh(key, tile);
				if (!allowStale && !fresh) continue;

				tile.lastUsed = performance.now();

				const cwx = ctx_ * candidateWorldSize;
				const cwy = cty * candidateWorldSize;

				const ix0 = Math.max(wx, cwx);
				const iy0 = Math.max(wy, cwy);
				const ix1 = Math.min(wx + worldSize, cwx + candidateWorldSize);
				const iy1 = Math.min(wy + worldSize, cwy + candidateWorldSize);

				const iw = ix1 - ix0;
				const ih = iy1 - iy0;

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
		backgroundColor?: string,
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
			await this.bakeTile(
				req.tier,
				req.tx,
				req.ty,
				backgroundColor,
				signal,
				gen,
			);
			if (signal.aborted || gen !== this.currentGen) break;

			if (yielder.shouldYield()) {
				await yielder.yield();
			}
		}
	}

	async bakeMissing(
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
		yielder: Yielder,
		signal: AbortSignal,
		backgroundColor?: string,
	): Promise<BakeReport> {
		const gen = this.currentGen;
		const zoom = vpt[0];
		const tier = this.pickTierForZoom(zoom);
		const scale = this.ZOOM_TIERS[tier];

		const viewWorldX = -vpt[4] / zoom;
		const viewWorldY = -vpt[5] / zoom;
		const viewWorldW = viewportPx.w / (zoom * dpr);
		const viewWorldH = viewportPx.h / (zoom * dpr);

		const tileWorldSize = this.TILE_SIZE / scale;
		const padding = this.VP_PADDING * tileWorldSize;
		const paddedViewport: WorldRect = {
			x: viewWorldX - padding,
			y: viewWorldY - padding,
			w: viewWorldW + 2 * padding,
			h: viewWorldH + 2 * padding,
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
				const dx = tx - cx;
				const dy = ty - cy;
				todo.push({ tier, tx, ty, priority: dx * dx + dy * dy });
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
			const ok = await this.bakeTile(
				req.tier,
				req.tx,
				req.ty,
				backgroundColor,
				signal,
				gen,
			);
			if (signal.aborted || gen !== this.currentGen) {
				report.aborted = true;
				report.remaining = todo.length - i - (ok ? 1 : 0);
				break;
			}
			if (ok) report.baked++;

			if (yielder.shouldYield()) {
				await yielder.yield();
				if (signal.aborted || gen !== this.currentGen) {
					report.aborted = true;
					report.remaining = todo.length - i - 1;
					break;
				}
			}
		}
		return report;
	}

	async bakeNeighborTiers(
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
		yielder: Yielder,
		signal: AbortSignal,
		backgroundColor?: string,
	): Promise<void> {
		const gen = this.currentGen;
		const zoom = vpt[0];
		const currentTier = this.pickTierForZoom(zoom);

		const neighbors = [currentTier - 1, currentTier + 1].filter(
			(t) => t >= 0 && t < this.ZOOM_TIERS.length,
		);

		for (const tier of neighbors) {
			if (signal.aborted || gen !== this.currentGen) return;

			const scale = this.ZOOM_TIERS[tier];
			const viewWorldX = -vpt[4] / zoom;
			const viewWorldY = -vpt[5] / zoom;
			const viewWorldW = viewportPx.w / (zoom * dpr);
			const viewWorldH = viewportPx.h / (zoom * dpr);

			const paddedViewport: WorldRect = {
				x: viewWorldX,
				y: viewWorldY,
				w: viewWorldW,
				h: viewWorldH,
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
					const dx = tx - cx;
					const dy = ty - cy;
					todo.push({ tier, tx, ty, priority: dx * dx + dy * dy });
				}
			}
			todo.sort((a, b) => a.priority - b.priority);

			yielder.reset();
			for (const req of todo) {
				if (signal.aborted || gen !== this.currentGen) return;
				await this.bakeTile(
					req.tier,
					req.tx,
					req.ty,
					backgroundColor,
					signal,
					gen,
				);
				if (yielder.shouldYield()) {
					await yielder.yield();
					if (signal.aborted || gen !== this.currentGen) return;
				}
			}
		}
	}

	private async bakeTile(
		tier: number,
		tx: number,
		ty: number,
		backgroundColor: string | undefined,
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

		if (objects.length === 0 && !backgroundColor) {
			if (!this.emptyBitmap) {
				const off = new OffscreenCanvas(1, 1);
				this.emptyBitmap = await createImageBitmap(off);
			}
			bitmap = this.emptyBitmap;
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
			if (backgroundColor) {
				c2d.fillStyle = backgroundColor;
				c2d.fillRect(0, 0, this.BITMAP_SIZE, this.BITMAP_SIZE);
			}

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

			if (signal.aborted || gen !== this.currentGen) {
				c2d.restore();
				this.releaseCanvas(off);
				return false;
			}

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
			if (existing.bitmap !== this.emptyBitmap) {
				existing.bitmap.close();
			}
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
			if (tile.bitmap !== this.emptyBitmap) tile.bitmap.close();
			this.memoryBytes -= tile.bytes;
			this.tiles.delete(key);
			if (this.memoryBytes + needed <= this.MEMORY_HARD) return true;
		}
		return false;
	}

	invalidateObject(obj: T): void {
		const touched = this.objectToTiles.get(obj.id);
		if (touched) {
			for (const key of touched) {
				this.tileGen.set(key, (this.tileGen.get(key) ?? 0) + 1);
			}
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

	invalidateAll(): void {
		for (const tile of this.tiles.values()) {
			if (tile.bitmap !== this.emptyBitmap) tile.bitmap.close();
		}
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

	private acquireCanvas(): OffscreenCanvas {
		const c = this.canvasPool.pop();
		if (c) return c;
		return new OffscreenCanvas(this.BITMAP_SIZE, this.BITMAP_SIZE);
	}

	private releaseCanvas(c: OffscreenCanvas): void {
		if (this.canvasPool.length < this.POOL_MAX) this.canvasPool.push(c);
	}

	getVitals() {
		const tierCounts = new Array(this.ZOOM_TIERS.length).fill(0);
		for (const t of this.tiles.values()) tierCounts[t.tier]++;
		return {
			tileCount: this.tiles.size,
			memoryMB: (this.memoryBytes / 1024 / 1024).toFixed(2),
			memoryLimitMB: (this.MEMORY_HARD / 1024 / 1024).toFixed(2),
			memoryPressure: ((this.memoryBytes / this.MEMORY_HARD) * 100).toFixed(1),
			bitmapSize: this.BITMAP_SIZE,
			overscan: this.OVERSCAN,
			tilesPerTier: tierCounts.map((n, i) => ({
				tier: i,
				scale: this.ZOOM_TIERS[i],
				count: n,
			})),
		};
	}

	// =====================================================================
	// DEBUG HELPERS — tile inspection / rebake
	// =====================================================================

	/**
	 * Given a viewport-relative DEVICE-PIXEL position, return which tile
	 * (at the currently rendered tier) was drawn there.
	 *
	 *   canvas.addEventListener("click", (e) => {
	 *     if (!e.altKey) return;
	 *     const rect = canvas.getBoundingClientRect();
	 *     const dpr = window.devicePixelRatio || 1;
	 *     const px = (e.clientX - rect.left) * dpr;
	 *     const py = (e.clientY - rect.top)  * dpr;
	 *     const hit = tileCache.debugTileAtPixel(px, py, vpt, dpr);
	 *     if (hit) tileCache.debugDumpTile(hit.tier, hit.tx, hit.ty);
	 *   });
	 */
	debugTileAtPixel(
		px: number,
		py: number,
		vpt: number[],
		dpr: number,
	): { tier: number; tx: number; ty: number } | null {
		const tier = this.lastRenderedTier ?? this.pickTierForZoom(vpt[0]);
		const scale = this.ZOOM_TIERS[tier];
		const tileWorldSize = this.TILE_SIZE / scale;

		const a = vpt[0] * dpr;
		const d = vpt[3] * dpr;
		const e = vpt[4] * dpr;
		const f = vpt[5] * dpr;

		if (a === 0 || d === 0) return null;
		const wx = (px - e) / a;
		const wy = (py - f) / d;

		const tx = Math.floor(wx / tileWorldSize);
		const ty = Math.floor(wy / tileWorldSize);
		return { tier, tx, ty };
	}

	/**
	 * Log everything we know about a tile: world rect, what the index
	 * query returns, current bitmap state, freshness, and whether each
	 * returned object actually intersects the tile's query rect.
	 */
	debugDumpTile(tier: number, tx: number, ty: number): TileDebugInfo {
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
		const key = `${tier}:${tx}:${ty}`;
		const tile = this.tiles.get(key);
		const expectedGen = this.tileGen.get(key) ?? 0;

		const objectBounds = objects.map((obj) => {
			const b = obj.getBoundingRect(true, true);
			return {
				id: obj.id,
				bounds: b,
				visible: (obj as any).visible !== false,
				opacity: (obj as any).opacity ?? 1,
				intersectsQuery: this.rectsIntersect(b, queryRect),
				containedInQuery: this.rectContainsRect(queryRect, b),
			};
		});

		const info: TileDebugInfo = {
			tier,
			tx,
			ty,
			scale,
			worldRect: world,
			queryRect,
			objectCount: objects.length,
			objectIds: objects.map((o) => o.id),
			objectBounds,
			tileExists: !!tile,
			tileFresh: tile ? this.isFresh(key, tile) : false,
			tileGen: tile?.gen ?? -1,
			expectedGen,
			hasBitmap: !!tile?.bitmap,
			isDummy: tile?.bitmap === this.emptyBitmap,
		};

		console.groupCollapsed(
			`[TileCache] tile ${key} (×${scale})  objects=${info.objectCount}  fresh=${info.tileFresh}  exists=${info.tileExists}`,
		);
		console.log("worldRect (tile):", world);
		console.log("queryRect (with overscan+stroke pad):", queryRect);
		console.log("tile state:", {
			exists: info.tileExists,
			fresh: info.tileFresh,
			tileGen: info.tileGen,
			expectedGen: info.expectedGen,
			hasBitmap: info.hasBitmap,
			isDummy: info.isDummy,
		});
		console.log(`objects from index.query (${objects.length}):`);
		console.table(
			objectBounds.map((o) => ({
				id: o.id,
				visible: o.visible,
				opacity: o.opacity,
				left: Math.round(o.bounds.left),
				top: Math.round(o.bounds.top),
				w: Math.round(o.bounds.width),
				h: Math.round(o.bounds.height),
				intersects: o.intersectsQuery,
				contained: o.containedInQuery,
			})),
		);
		const notIntersecting = objectBounds.filter((o) => !o.intersectsQuery);
		if (notIntersecting.length > 0) {
			console.warn(
				`⚠️ ${notIntersecting.length} object(s) returned by index.query but don't intersect queryRect — quadtree may have stale bounds:`,
				notIntersecting.map((o) => o.id),
			);
		}
		console.groupEnd();

		return info;
	}

	private rectsIntersect(
		a: { left: number; top: number; width: number; height: number },
		b: WorldRect,
	): boolean {
		return (
			a.left < b.x + b.w &&
			a.left + a.width > b.x &&
			a.top < b.y + b.h &&
			a.top + a.height > b.y
		);
	}

	private rectContainsRect(
		outer: WorldRect,
		inner: { left: number; top: number; width: number; height: number },
	): boolean {
		return (
			inner.left >= outer.x &&
			inner.top >= outer.y &&
			inner.left + inner.width <= outer.x + outer.w &&
			inner.top + inner.height <= outer.y + outer.h
		);
	}

	/**
	 * Force a fresh bake of one specific tile. Discards the existing
	 * bitmap, clears its stale-gen flag, runs bakeTile with a fresh
	 * AbortController. Useful for answering:
	 *
	 *   "is this tile wrong because the BAKE produced wrong output,
	 *    or because of staleness / abort logic?"
	 *
	 * If the rebake fixes it → bake logic / abort timing is the bug.
	 * If the rebake produces the same wrong output → the renderer or
	 *   index.query is the bug (probably stale quadtree bounds).
	 */
	async debugRebakeTile(
		tier: number,
		tx: number,
		ty: number,
		backgroundColor?: string,
	): Promise<boolean> {
		const key = `${tier}:${tx}:${ty}`;
		console.log(`[TileCache] debugRebakeTile: rebaking ${key}`);

		console.log("--- BEFORE ---");
		const before = this.debugDumpTile(tier, tx, ty);

		// Drop existing bitmap so bakeTile is forced to recreate.
		const existing = this.tiles.get(key);
		if (existing) {
			if (existing.bitmap !== this.emptyBitmap) existing.bitmap.close();
			this.memoryBytes -= existing.bytes;
			this.tiles.delete(key);
		}

		// Clear stale-gen tracking so the new bake is considered fresh.
		this.tileGen.delete(key);

		const ctrl = new AbortController();
		const ok = await this.bakeTile(
			tier,
			tx,
			ty,
			backgroundColor,
			ctrl.signal,
			this.currentGen,
		);

		console.log(`[TileCache] debugRebakeTile: bakeTile -> ${ok}`);
		if (ok) {
			console.log("--- AFTER ---");
			const after = this.debugDumpTile(tier, tx, ty);
			const beforeIds = new Set(before.objectIds);
			const afterIds = new Set(after.objectIds);
			const added = [...afterIds].filter((id) => !beforeIds.has(id));
			const removed = [...beforeIds].filter((id) => !afterIds.has(id));
			if (added.length || removed.length) {
				console.warn(
					`⚠️ Object set differs between bakes — added: ${added.length}, removed: ${removed.length}`,
					{ added, removed },
				);
			} else {
				console.log(
					"✓ Same object set rendered. If tile is still wrong, the renderer is the bug.",
				);
			}
		}
		return ok;
	}

	/**
	 * Rebake a tile and open the resulting bitmap in a new tab so you
	 * can inspect pixel-by-pixel what the bake actually produced.
	 */
	async debugRebakeTileAndShow(
		tier: number,
		tx: number,
		ty: number,
		backgroundColor?: string,
	): Promise<void> {
		const ok = await this.debugRebakeTile(tier, tx, ty, backgroundColor);
		if (!ok) {
			console.warn("[TileCache] rebake failed");
			return;
		}
		const key = `${tier}:${tx}:${ty}`;
		const tile = this.tiles.get(key);
		if (!tile || !tile.bitmap) {
			console.warn("[TileCache] no bitmap after rebake");
			return;
		}

		const c = document.createElement("canvas");
		c.width = this.BITMAP_SIZE;
		c.height = this.BITMAP_SIZE;
		const cctx = c.getContext("2d");
		if (!cctx) return;
		cctx.drawImage(tile.bitmap, 0, 0);

		c.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			console.log(
				`[TileCache] tile ${key} bitmap (${this.BITMAP_SIZE}px):`,
				url,
			);
			window.open(url, "_blank");
		});
	}

	/**
	 * Enumerate visible tiles plus their current cache state. Useful as a
	 * console one-liner during debugging.
	 */
	debugListVisibleTiles(
		vpt: number[],
		viewportPx: { w: number; h: number },
		dpr: number,
	): Array<{
		tier: number;
		tx: number;
		ty: number;
		exists: boolean;
		fresh: boolean;
		isDummy: boolean;
	}> {
		const tier = this.lastRenderedTier ?? this.pickTierForZoom(vpt[0]);
		const zoom = vpt[0];
		const viewWorld: WorldRect = {
			x: -vpt[4] / zoom,
			y: -vpt[5] / zoom,
			w: viewportPx.w / (zoom * dpr),
			h: viewportPx.h / (zoom * dpr),
		};
		const range = this.tileRangeForWorld(viewWorld, tier);
		const out: Array<{
			tier: number;
			tx: number;
			ty: number;
			exists: boolean;
			fresh: boolean;
			isDummy: boolean;
		}> = [];
		for (let ty = range.ty0; ty <= range.ty1; ty++) {
			for (let tx = range.tx0; tx <= range.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				const t = this.tiles.get(key);
				out.push({
					tier,
					tx,
					ty,
					exists: !!t,
					fresh: t ? this.isFresh(key, t) : false,
					isDummy: t ? t.bitmap === this.emptyBitmap : false,
				});
			}
		}
		return out;
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
