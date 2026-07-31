import { WorldOverview } from "../worldOverview";
import {
	getTileRange,
	pickTileTier,
	tileToWorldRect,
	viewportToWorldRect,
	type WorldRect,
} from "./tileGeometry";
import { type Tile, TileStore } from "./tileStore";
import { DEFAULT_OVERVIEW_TIER, DEFAULT_ZOOM_TIERS } from "../zoomLevels";

export type { WorldRect } from "./tileGeometry";

/** Hybrid overlay is synchronous. Above these small bounds, the caller falls
 * back to the normal local bake, whose object loop yields to input. */
export const MAX_SYNC_OVERLAY_OBJECTS = 8;
export const MAX_SYNC_OVERLAY_CHILDREN = 32;

export interface Bounded {
	id: string;

	getBoundingRect(
		absolute?: boolean,
		calculate?: boolean,
	): { left: number; top: number; width: number; height: number };
}

export interface SpatialIndex<T extends Bounded> {
	query(rect: WorldRect): T[];

	/**
	 * Same z-ordered result as `query`, but paired with the bounds the index
	 * already holds for each object.
	 *
	 * Callers that only need to SIZE-FILTER a large result (the overview's
	 * "is this big enough to leave a mark" pass) would otherwise call
	 * `getBoundingRect(true, true)` per object, which RECOMPUTES coords the index
	 * has already tracked — an O(all objects) main-thread block on a big board.
	 * Optional: implementations without it fall back to the slow path. The rects
	 * may be the index's LIVE entry bounds — treat them as read-only.
	 */
	queryBounds?(rect: WorldRect): { obj: T; bounds: WorldRect }[];
}

export type TileRenderer<T extends Bounded> = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: T,
	tierScale: number,
	/** World rect being rasterized. Lets the renderer cull a GROUP's children:
	 *  a merged Group is ONE index entry with the union bbox, so without this
	 *  every tile it overlaps re-renders all of its children. */
	clipRect?: WorldRect,
) => void;

export interface Yieldable {
	reset(): void;

	shouldYield(): boolean;

	yield(): Promise<void>;
}

/**
 * Result of a hybrid worker bake. `bitmap` holds every object the worker could
 * render; `skipped` holds objects it could NOT (an image, a group, text with an
 * unloaded face) that the caller must overlay on top on the main thread.
 *
 * INVARIANT the baker guarantees: every object in `skipped` sits z-ABOVE every
 * object baked into `bitmap`. That is what makes "draw bitmap, then draw skipped
 * over it" pixel-correct. If the real z-order interleaves them, the baker
 * returns null instead (→ full local bake), never a wrong `skipped`.
 */
export interface RemoteBakeResult<T> {
	bitmap: ImageBitmap;
	skipped: T[];
}

export type RemoteBakeFailureReason =
	| "worker-unavailable"
	| "backpressure"
	| "timeout"
	| "missing"
	| "refusal"
	| "z-order"
	| "hard-error";

export interface RemoteBakeFailure {
	fallbackReason: RemoteBakeFailureReason;
	kind: "deferred" | "unsupported" | "failed";
}

export function isRemoteBakeFailure<T extends Bounded>(
	result: RemoteBakeFailure | RemoteBakeResult<T>,
): result is RemoteBakeFailure {
	return "fallbackReason" in result;
}

/**
 * Off-main-thread tile renderer (tileBakery worker). Receives the z-sorted
 * objects covering one tile plus the exact tile geometry; resolves with the
 * rendered bitmap (+ any objects to overlay locally), or a named failure so
 * diagnostics retain the reason for a main-thread fallback.
 */
export type RemoteBaker<T> = (
	objects: T[],
	world: WorldRect,
	scale: number,
	overscan: number,
	size: number,
) => Promise<RemoteBakeResult<T> | RemoteBakeFailure>;

/**
 * Off-main-thread whole-board overview render. Gets the z-ordered objects
 * covering `bounds`; resolves with the rendered bitmap plus the objects it
 * could NOT render (text / images) for the caller to overlay locally. Null →
 * caller renders the overview locally.
 */
export type RemoteOverview<T> = (
	objects: T[],
	bounds: WorldRect,
	width: number,
	height: number,
	scale: number,
) => Promise<{ bitmap: ImageBitmap; skipped: T[] } | null>;

export interface CommittedOptions {
	poolMax?: number;
	tileSize?: number;
	overscanPx?: number;
	zoomTiers?: number[];
	memoryBudgetMB?: number;
	maxRenderScale?: number;
	overviewTier?: number;
	overviewPx?: number;
	renderChunk?: number;
	fallbackDepth?: number;
	debug?: boolean;
	/** Optional worker-side tile renderer; async bakes try it first. */
	remoteBaker?: RemoteBaker<any>;
	/** Optional worker-side overview renderer; full rebuilds try it first. */
	remoteOverview?: RemoteOverview<any>;
}

export interface Draw {
	bmp: ImageBitmap;
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
	/** Device-px sub-rect of the destination this source is NOT trusted for (the
	 *  region an edit changed after it was baked). Zero-size = trust it all. */
	hx: number;
	hy: number;
	hw: number;
	hh: number;
	/**
	 * Device-px sub-rect this source may paint INSIDE, if set (zero-size = the
	 * whole destination). Used to fill another source's hole without overlapping
	 * it: the stale tile paints `dest minus hole`, the filler paints `keep minus
	 * its own hole`. Keeping them disjoint is what stops semi-transparent
	 * strokes being composited twice.
	 */
	kx?: number;
	ky?: number;
	kw?: number;
	kh?: number;
}

export interface CompositeCell {
	tx: number;
	ty: number;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
}

/**
 * A stale tile drawn on top of its own fallback cover, clipped to
 * (cell MINUS the sub-rect that actually changed). `h*` is that hole, in device
 * px, already intersected with the cell and snapped outward.
 */
export interface PartialDraw {
	bmp: ImageBitmap;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
	hx: number;
	hy: number;
	hw: number;
	hh: number;
}

/** "Trust this source completely" — distinct from a null/absent dirty rect,
 *  which means "no idea what changed, do not trust it at all". */
export const NO_HOLE = Symbol("no-hole");

/** Cap on stale overlays per composite. Each is a clip + drawImage; the point is
 *  to keep the untouched 95% of an edited tile sharp, not to rebuild the frame
 *  out of fragments. Beyond this the plain fallback ladder is fine. */
export const MAX_PARTIAL_OVERLAYS = 24;

/** Distinct invalidated regions tracked per tile before they collapse into one
 *  union. Small on purpose — this is walked per source per cell per frame. */
export const MAX_DIRTY_RECTS = 6;

/**
 * Is this CSS colour fully opaque, i.e. does filling with it overwrite every
 * pixel? Deliberately CONSERVATIVE — anything unrecognised is treated as
 * possibly-transparent, so the worst case is the old clear+fill behaviour and
 * never a stale-pixel bug. Board backgrounds are a solid hex in practice.
 */
export function isOpaqueColor(c: string): boolean {
	const s = c.trim().toLowerCase();
	if (s === "transparent" || s === "none") return false;
	// #rgb / #rrggbb are opaque; #rgba / #rrggbbaa carry alpha.
	if (s.startsWith("#")) return s.length === 4 || s.length === 7;
	if (s.startsWith("rgb(") || s.startsWith("hsl(")) return true;
	// rgba()/hsla() are opaque only at alpha exactly 1.
	if (s.startsWith("rgba(") || s.startsWith("hsla(")) {
		const parts = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")")).split(/[,/]/);
		if (parts.length < 4) return true; // no alpha component given
		return parseFloat(parts[3]) >= 1;
	}
	return false; // named colours, gradients, anything else: keep the clear
}

export class TileLayerBase<T extends Bounded> {
	protected readonly TILE: number;
	protected readonly OS: number;
	protected readonly BMP: number;
	public readonly ZOOM_TIERS: number[];
	protected readonly MEM_HARD: number;
	protected readonly OVERVIEW_TIER: number;
	protected readonly CHUNK: number;
	protected readonly FALLBACK_DEPTH: number;
	protected readonly debug: boolean;
	protected readonly renderScale: number;

	protected readonly index: SpatialIndex<T>;
	protected readonly renderer: TileRenderer<T>;
	protected readonly remoteBaker?: RemoteBaker<T>;
	public readonly overview: WorldOverview<T>;

	protected readonly tileStore: TileStore;
	protected get tiles() {
		return this.tileStore.tiles;
	}
	protected get gen() {
		return this.tileStore.generations;
	}
	protected get inFlight() {
		return this.tileStore.inFlight;
	}
	protected get dirtyRects() {
		return this.tileStore.dirtyRects;
	}
	protected get memoryBytes() {
		return this.tileStore.memoryBytes;
	}
	protected set memoryBytes(value: number) {
		this.tileStore.memoryBytes = value;
	}

	// Reusable per-frame composite scratch. Filled count-tracked (slots
	// overwritten in place, not re-allocated) so a steady-state composite frame
	// allocates no tile draw descriptors — was O(visible tiles) object literals
	// + 4 arrays every frame. Never retained past the synchronous composite call.
	protected readonly _present: Draw[] = [];
	protected readonly _uncovered: CompositeCell[] = [];
	protected readonly _needsOverview: CompositeCell[] = [];
	protected readonly _fallback: Draw[] = [];
	protected readonly _partial: PartialDraw[] = [];

	private POOL_MAX = 16;

	constructor(
		index: SpatialIndex<T>,
		renderer: TileRenderer<T>,
		opts: CommittedOptions = {},
	) {
		this.index = index;
		this.renderer = renderer;
		this.TILE = opts.tileSize ?? 512;
		this.OS = Math.max(0, opts.overscanPx ?? 2);
		this.BMP = this.TILE + 2 * this.OS;
		// Tier ladder. Shifted one step UP from [0.0625 … 16]:
		//   • the old 0.0625 tier covered a zoom nobody usefully draws at and
		//     produced the blurriest overview fallback in the app.
		//   • the added 32 tier lifts the ceiling from 8x to 16x. It BAKES at that
		//     tier, so it is real detail, not an upscale.
		// Count is unchanged (9), so tile memory and the fallback search depth are
		// unchanged. NB `overviewTier` is an INDEX into this array — moving the
		// ladder without moving that index silently doubles the pure-overview zone.
		this.ZOOM_TIERS = opts.zoomTiers ?? [...DEFAULT_ZOOM_TIERS];

		this.POOL_MAX = opts.poolMax ?? 16;
		this.remoteBaker = opts.remoteBaker;
		// Index into ZOOM_TIERS, so it moved with the ladder (was 2 against
		// [0.0625 … 16]). 1 keeps the same zoom threshold, 0.25.
		this.OVERVIEW_TIER = opts.overviewTier ?? DEFAULT_OVERVIEW_TIER;
		this.CHUNK = opts.renderChunk ?? 64;
		// How many tiers the fallback search may walk away from the active one.
		// 3 was too shallow for the case that hurts most: zoom from 1x to 16x and
		// the nearest tier holding any data is FOUR steps back, so every uncovered
		// cell skipped straight to the whole-board overview — a ~60x upscale. The
		// search is map lookups only (see `searchMsMax`), and a gesture still caps
		// it at 1.
		this.FALLBACK_DEPTH = opts.fallbackDepth ?? 5;
		this.debug = opts.debug ?? false;

		const maxRS = opts.maxRenderScale ?? 2;
		this.renderScale = Math.min(
			typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
			maxRS,
		);

		// Reserve the overview + pool ceiling out of the tile budget so
		// the TOTAL stays under the device limit, not just the tile portion.
		const overviewBytes = (opts.overviewPx ?? 2048) ** 2 * 4;
		const poolCeiling = this.POOL_MAX * this.BMP * this.BMP * 4;
		this.MEM_HARD = Math.max(
			16 * 1024 * 1024,
			(opts.memoryBudgetMB ?? 256) * 1024 * 1024 - overviewBytes - poolCeiling,
		);
		this.tileStore = new TileStore(this.BMP, this.MEM_HARD, this.POOL_MAX);

		this.overview = new WorldOverview<T>(index, renderer, {
			px: opts.overviewPx ?? 2048,
			targetDensity:
				this.ZOOM_TIERS[this.OVERVIEW_TIER + 1] ??
				this.ZOOM_TIERS[this.ZOOM_TIERS.length - 1],
			remoteOverview: opts.remoteOverview,
		});
	}

	get overviewTier(): number {
		return this.OVERVIEW_TIER;
	}

	queryIndex(rect: WorldRect): T[] {
		return this.index.query(rect);
	}

	// ── geometry ───────────────────────────────────────────────────────────
	pickActiveTier(zoom: number): number {
		return pickTileTier(zoom, this.renderScale, this.ZOOM_TIERS);
	}

	protected tileRange(r: WorldRect, tier: number) {
		return getTileRange(r, tier, this.TILE, this.ZOOM_TIERS);
	}

	protected tileToWorld(tier: number, tx: number, ty: number): WorldRect {
		return tileToWorldRect(tier, tx, ty, this.TILE, this.ZOOM_TIERS);
	}

	protected isFresh(key: string, t: Tile): boolean {
		return this.tileStore.isFresh(key, t);
	}

	protected touchTile(key: string, tile: Tile): void {
		this.tileStore.touch(key, tile);
	}

	viewWorld(
		vpt: number[],
		px: { w: number; h: number },
		dpr: number,
	): WorldRect {
		return viewportToWorldRect(vpt, px, dpr);
	}

	// ── invalidation ─────────────────────────────────────────────────────────
	/**
	 * The ONE way to invalidate a tile key. Bumps the generation (→ re-bake),
	 * marks the pixels unusable (→ the compositor stops trusting them), and
	 * records WHICH sub-region changed so the compositor can still show the rest.
	 *
	 * `rect === null` means "the whole tile" and is always safe. Anything that
	 * bumps a gen without going through here loses the sub-rect and silently
	 * degrades to a full-tile blur.
	 */
	/**
	 * @param keepUsable the pixels on screen are still CORRECT, they are merely
	 *   incomplete (an additive add covered by the live layer). The re-bake and
	 *   the recorded region are unchanged — only trust is.
	 */
	/**
	 * Every recorded region of a tile, as ONE rect. For callers whose target IS
	 * the whole tile (the active-tier overlay, and the repair, which must cover
	 * everything owed). `null` when the record is missing or whole-tile.
	 */
	protected unionDirtyRects(key: string): WorldRect | null {
		const rects = this.dirtyRects.get(key);
		if (!rects || rects.length === 0) return null;
		let x = rects[0].x;
		let y = rects[0].y;
		let x2 = rects[0].x + rects[0].w;
		let y2 = rects[0].y + rects[0].h;
		for (let i = 1; i < rects.length; i++) {
			const r = rects[i];
			x = Math.min(x, r.x);
			y = Math.min(y, r.y);
			x2 = Math.max(x2, r.x + r.w);
			y2 = Math.max(y2, r.y + r.h);
		}
		return { x, y, w: x2 - x, h: y2 - y };
	}

	protected invalidateKey(
		key: string,
		rect: WorldRect | null,
		keepUsable = false,
	): void {
		this.gen.set(key, (this.gen.get(key) ?? 0) + 1);
		const t = this.tiles.get(key);
		if (t && !keepUsable) t.usable = false;
		if (rect === null) {
			this.dirtyRects.set(key, null);
			return;
		}
		const prev = this.dirtyRects.get(key);
		if (prev === null) return; // already whole-tile dirty; can't get dirtier
		if (prev === undefined) {
			this.dirtyRects.set(key, [
				{ x: rect.x, y: rect.y, w: rect.w, h: rect.h },
			]);
			return;
		}
		// Merge into an entry it already touches; otherwise keep it SEPARATE.
		// Unioning unrelated edits is what makes a coarse tile look entirely
		// unusable after a few edits in different places.
		for (const r of prev) {
			if (
				r.x <= rect.x + rect.w &&
				rect.x <= r.x + r.w &&
				r.y <= rect.y + rect.h &&
				rect.y <= r.y + r.h
			) {
				const x = Math.min(r.x, rect.x);
				const y = Math.min(r.y, rect.y);
				const x2 = Math.max(r.x + r.w, rect.x + rect.w);
				const y2 = Math.max(r.y + r.h, rect.y + rect.h);
				r.x = x;
				r.y = y;
				r.w = x2 - x;
				r.h = y2 - y;
				return;
			}
		}
		prev.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
		if (prev.length <= MAX_DIRTY_RECTS) return;
		// Too many to track — collapse to one union. Coarser, but still bounded
		// and still correct.
		let u = prev[0];
		for (let i = 1; i < prev.length; i++) {
			const r = prev[i];
			const x = Math.min(u.x, r.x);
			const y = Math.min(u.y, r.y);
			const x2 = Math.max(u.x + u.w, r.x + r.w);
			const y2 = Math.max(u.y + u.h, r.y + r.h);
			u = { x, y, w: x2 - x, h: y2 - y };
		}
		this.dirtyRects.set(key, [u]);
	}

	markDirty(rect: WorldRect): void {
		// Walking tile-coordinate ranges is O(rect area / tile²) — a large rect at
		// a fine tier explodes into 100k+ iterations. The tile map itself is
		// memory-budget-bounded, so when the range is bigger than the map, walk
		// the map instead: O(tiles) worst case, no per-cell key allocs.
		const ranges: { tx0: number; ty0: number; tx1: number; ty1: number }[] = [];
		let cells = 0;
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			const r = this.tileRange(rect, tier);
			ranges.push(r);
			cells += (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1);
		}
		if (cells > this.tiles.size) {
			for (const [k, t] of this.tiles) {
				const r = ranges[t.tier];
				if (t.tx >= r.tx0 && t.tx <= r.tx1 && t.ty >= r.ty0 && t.ty <= r.ty1)
					this.invalidateKey(k, rect);
			}
			for (const k of this.inFlight) {
				const parts = k.split(":");
				const tier = parseInt(parts[0], 10);
				const tx = parseInt(parts[1], 10);
				const ty = parseInt(parts[2], 10);
				const r = ranges[tier];
				if (tx >= r.tx0 && tx <= r.tx1 && ty >= r.ty0 && ty <= r.ty1)
					this.invalidateKey(k, rect);
			}
			return;
		}
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			const r = ranges[tier];
			for (let ty = r.ty0; ty <= r.ty1; ty++)
				for (let tx = r.tx0; tx <= r.tx1; tx++) {
					const k = `${tier}:${tx}:${ty}`;
					if (this.tiles.has(k) || this.inFlight.has(k))
						this.invalidateKey(k, rect);
				}
		}
	}

	/**
	 * ADDITIVE invalidation: this region needs a re-bake, but the pixels already
	 * on screen are not WRONG — they are merely incomplete, and the caller is
	 * covering the difference (a live overlay of the new object).
	 *
	 * For a topmost add, a live overlay supplies the missing object and the result
	 * is pixel-identical. For a lower-z add there is no correct flattened overlay;
	 * retaining the previous sharp tile gives us an atomic old→new tile swap once
	 * the z-correct bake lands, instead of a sharp→overview→sharp transition.
	 *
	 * Deliberately leaves `usable` and the dirty sub-rect alone: nothing about
	 * the existing pixels became untrustworthy.
	 */
	markStale(rect: WorldRect): void {
		// The RECT is recorded exactly like a destructive invalidation — only
		// `usable` is preserved. Without the record, a tile stale purely from an
		// additive add has no dirty region, and the sub-rect repair path would
		// then repaint some other edit's trail and mark the tile fresh WITHOUT
		// ever drawing the added object: the stroke would vanish when its live
		// overlay demoted. What differs between stale and dirty is trust, not
		// what needs repainting.
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			const r = this.tileRange(rect, tier);
			const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1);
			if (cells > this.tiles.size) {
				for (const [k, t] of this.tiles) {
					if (t.tier !== tier) continue;
					if (t.tx >= r.tx0 && t.tx <= r.tx1 && t.ty >= r.ty0 && t.ty <= r.ty1)
						this.invalidateKey(k, rect, true);
				}
				continue;
			}
			for (let ty = r.ty0; ty <= r.ty1; ty++)
				for (let tx = r.tx0; tx <= r.tx1; tx++) {
					const k = `${tier}:${tx}:${ty}`;
					if (this.tiles.has(k) || this.inFlight.has(k))
						this.invalidateKey(k, rect, true);
				}
		}
	}

	markAllDirty(): void {
		for (const [k] of this.tiles) this.invalidateKey(k, null);
		this.overview.markDirty();
	}

	dropTiles(rect: WorldRect, tier: number): void {
		const r = this.tileRange(rect, tier);
		// Same area-bound as markDirty: never iterate more cells than tiles exist.
		const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1);
		if (cells > this.tiles.size) {
			for (const [k, t] of this.tiles) {
				if (t.tier !== tier) continue;
				if (t.tx < r.tx0 || t.tx > r.tx1 || t.ty < r.ty0 || t.ty > r.ty1)
					continue;
				if (t.bitmap) t.bitmap.close();
				this.memoryBytes -= t.bytes;
				this.tiles.delete(k);
				this.dirtyRects.delete(k);
			}
			for (const k of this.inFlight) {
				const parts = k.split(":");
				const t_tier = parseInt(parts[0], 10);
				const t_tx = parseInt(parts[1], 10);
				const t_ty = parseInt(parts[2], 10);
				if (t_tier !== tier) continue;
				if (t_tx >= r.tx0 && t_tx <= r.tx1 && t_ty >= r.ty0 && t_ty <= r.ty1)
					this.invalidateKey(k, rect);
			}
			return;
		}
		for (let ty = r.ty0; ty <= r.ty1; ty++)
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const k = `${tier}:${tx}:${ty}`;
				if (this.inFlight.has(k)) this.invalidateKey(k, rect);
				const t = this.tiles.get(k);
				if (t) {
					if (t.bitmap) t.bitmap.close();
					this.memoryBytes -= t.bytes;
					this.tiles.delete(k);
					this.dirtyRects.delete(k);
				}
			}
	}

	dropAllTiers(rect: WorldRect): void {
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++)
			this.dropTiles(rect, tier);
	}

	/** Invalidate one tier without destroying its ImageBitmaps.
	 *
	 * Cross-tier edits used to close every affected texture immediately, even
	 * though most of those tiers would never be visited again. That created a GPU
	 * destroy/recreate storm. A stale tile is already excluded by isFresh() from
	 * both normal compositing and fallback search, so retaining it is visually
	 * safe; the existing memory budget/LRU reclaims it under pressure. */
	private markTierDirty(rect: WorldRect, tier: number): void {
		const r = this.tileRange(rect, tier);
		const cells = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1);
		if (cells > this.tiles.size) {
			for (const [key, tile] of this.tiles) {
				if (tile.tier !== tier) continue;
				if (
					tile.tx >= r.tx0 &&
					tile.tx <= r.tx1 &&
					tile.ty >= r.ty0 &&
					tile.ty <= r.ty1
				) {
					this.invalidateKey(key, rect);
				}
			}
			for (const key of this.inFlight) {
				const [rawTier, rawTx, rawTy] = key.split(":");
				const inFlightTier = parseInt(rawTier, 10);
				const tx = parseInt(rawTx, 10);
				const ty = parseInt(rawTy, 10);
				if (
					inFlightTier === tier &&
					tx >= r.tx0 &&
					tx <= r.tx1 &&
					ty >= r.ty0 &&
					ty <= r.ty1
				) {
					this.invalidateKey(key, rect);
				}
			}
			return;
		}
		for (let ty = r.ty0; ty <= r.ty1; ty++) {
			for (let tx = r.tx0; tx <= r.tx1; tx++) {
				const key = `${tier}:${tx}:${ty}`;
				if (this.tiles.has(key) || this.inFlight.has(key)) {
					this.invalidateKey(key, rect);
				}
			}
		}
	}

	dropOtherTiers(rect: WorldRect, keepTier: number): void {
		for (let tier = 0; tier < this.ZOOM_TIERS.length; tier++) {
			if (tier === keepTier) continue;
			this.markTierDirty(rect, tier);
		}
	}
}
