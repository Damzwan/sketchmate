import type { WorldRect } from "./tileGeometry";
import type { TileKey } from "./tileKey";

/**
 * What a tile's pixels live in.
 *
 * An `ImageBitmap` is the cheap, immutable resting state: one GPU texture, drawn
 * with `drawImage` and nothing else. But it cannot be drawn INTO, so every
 * stamp (a committed stroke, an erase, a drag commit) had to blit it into a
 * scratch canvas, render on top, `transferToImageBitmap()` a NEW texture and
 * close the old one — per covered tile, per stroke, for the whole session. At
 * 388² × 4 bytes that is ~588 KB allocated and ~588 KB destroyed per tile per
 * stroke, which is the best available explanation for the `libgsl.so` /
 * `libGLESv2_adreno.so` SIGSEGV + "Unresponsive GPU" cluster: it is unbounded
 * in time and it correlates with drawing, which is what the crashing users are
 * doing. (docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M2.)
 *
 * An `OffscreenCanvas` can be drawn into in place, so a stamp on a HOT tile is
 * one `drawImage` of the new object: no allocation, no destruction, no
 * full-tile copy. The cost is that compositing from a canvas can be slower than
 * from a bitmap on some drivers, so only a small hot set is kept this way and
 * `demoteHotTiles` converts them back once the region settles.
 */
export type TileSurface = ImageBitmap | OffscreenCanvas;

/** Is this surface drawable-into (a canvas) rather than immutable (a bitmap)? */
export function isCanvasSurface(
	surface: TileSurface | null,
): surface is OffscreenCanvas {
	return (
		!!surface && typeof (surface as OffscreenCanvas).getContext === "function"
	);
}

/**
 * Free a tile surface's backing store NOW.
 *
 * Both branches matter. `close()` releases a bitmap's texture; setting a
 * canvas's dimensions to zero releases its raster allocation immediately rather
 * than leaving it to a GC that runs far too late under Android WebView memory
 * pressure.
 */
export function releaseTileSurface(surface: TileSurface | null): void {
	if (!surface) return;
	if (isCanvasSurface(surface)) {
		surface.width = 0;
		surface.height = 0;
		return;
	}
	surface.close();
}

/**
 * How much recency a cross-tier fallback SAMPLE is worth, relative to a tile
 * composited as itself. Long enough that a directly-drawn tile always outranks
 * a merely-sampled one within a session of panning, short enough that a sampled
 * tile still beats one nothing has looked at in a minute.
 */
const FALLBACK_TOUCH_PENALTY_MS = 10_000;

/** Tiers within this distance of the active one are protected from the early
 *  eviction passes — they are what a small zoom step will land on next. */
const NEAR_TIER_DISTANCE = 1;

export interface Tile {
	/**
	 * The tile's pixels. Named `bitmap` for continuity with every call site;
	 * a hot tile holds an `OffscreenCanvas` here instead — see `TileSurface`.
	 * `drawImage` accepts both, so compositing is unchanged.
	 */
	bitmap: TileSurface | null;
	tier: number;
	tx: number;
	ty: number;
	bytes: number;
	builtGen: number;
	lastUsed: number;
	usable: boolean;
	/**
	 * A settled discrete edit is replacing this tile, but the previous
	 * full-resolution bitmap is being used as a short transition until the new
	 * generation lands. Unlike an additive/stamped `usable` tile, these pixels
	 * are not valid after a viewport change and must then be revoked.
	 */
	transition: boolean;
}

export class TileStore {
	readonly tiles = new Map<TileKey, Tile>();
	readonly generations = new Map<TileKey, number>();
	readonly inFlight = new Set<TileKey>();
	/**
	 * Which parts of a tile an edit invalidated, in world coords.
	 *
	 * A LIST, not one union rect. One union looks equivalent and is not: a
	 * coarse tile covers a huge world area, so two edits at opposite corners
	 * union into a rect spanning the whole tile, and the compositor then treats
	 * the tile as useless for every cell — the fallback ladder collapses to the
	 * whole-board overview and the picture goes blurry. It degrades as a session
	 * goes on, which is exactly how it presents.
	 *
	 * `null` means the whole tile (provenance unknown — always safe). Entries
	 * are merged when they overlap and collapsed to one union past
	 * `MAX_DIRTY_RECTS`, so the list stays small.
	 */
	readonly dirtyRects = new Map<TileKey, WorldRect[] | null>();
	memoryBytes = 0;
	/** -1 until the first composite reports one. */
	private activeTier = -1;

	private readonly pool: OffscreenCanvas[] = [];

	constructor(
		private readonly bitmapSize: number,
		private readonly memoryLimit: number,
		private readonly poolLimit: number,
	) {}

	isFresh(key: TileKey, tile: Tile): boolean {
		return tile.builtGen === (this.generations.get(key) ?? 0);
	}

	store(
		key: TileKey,
		tier: number,
		tx: number,
		ty: number,
		bitmap: TileSurface | null,
		bytes: number,
		builtGen: number,
		usable: boolean,
	): void {
		if (usable) this.dirtyRects.delete(key);
		const previous = this.tiles.get(key);
		if (previous) {
			// Never release a surface we are about to store again. `stampInPlace`
			// re-stores the SAME canvas under a bumped generation; zeroing it here
			// would blank the tile it just drew into.
			if (previous.bitmap !== bitmap) this.discardSurface(previous.bitmap);
			this.memoryBytes -= previous.bytes;
			this.tiles.delete(key);
		}
		this.tiles.set(key, {
			bitmap,
			tier,
			tx,
			ty,
			bytes,
			builtGen,
			usable,
			transition: false,
			lastUsed: performance.now(),
		});
		this.memoryBytes += bytes;
	}

	/**
	 * @param weak the tile was only SAMPLED as a cross-tier fallback source, not
	 *   composited as itself.
	 *
	 * Both cases used to bump the LRU identically, and that is what made zoom
	 * oscillation thrash. `FALLBACK_DEPTH` is 5, so a single composite touches
	 * tiles from up to five tiers purely as fallback sources; giving them the
	 * same recency as the tier the user is actually looking at let them evict it,
	 * which forced a re-bake, a new texture, and another eviction on the way back
	 * — under a hard budget that is ~34 tiles shared across 9 tiers. The penalty
	 * keeps a sampled tile alive (it is genuinely useful) while ranking it below
	 * anything drawn as itself.
	 */
	touch(key: TileKey, tile: Tile, weak = false): void {
		tile.lastUsed = performance.now() - (weak ? FALLBACK_TOUCH_PENALTY_MS : 0);
		if (this.tiles.delete(key)) this.tiles.set(key, tile);
	}

	/**
	 * Which tier the viewport is currently drawing from. Eviction protects it and
	 * its immediate neighbours; see `reserve`.
	 */
	setActiveTier(tier: number): void {
		this.activeTier = tier;
	}

	/**
	 * Make room for `bytes`.
	 *
	 * Nine zoom tiers share ONE budget — about 34 tiles on a severely constrained
	 * device. Plain LRU across all of them means a tier nobody is looking at can
	 * evict the tier they are, so a pinch in and back out produces a
	 * destroy/rebake/destroy storm. Under a hard budget that storm is exactly the
	 * texture-allocation churn behind the `libgsl` / Adreno faults.
	 *
	 * So eviction runs in CLASSES, cheapest-to-lose first, LRU within each class
	 * (Map insertion order is maintained by `touch`). There is deliberately no
	 * hard per-tier accounting: the ordering achieves the same protection without
	 * a second bookkeeping structure that could drift from the map.
	 */
	reserve(bytes: number): boolean {
		if (this.memoryBytes + bytes <= this.memoryLimit) return true;
		const target = this.memoryLimit * 0.85 - bytes;

		const far = (tile: Tile) =>
			this.activeTier < 0
				? false
				: Math.abs(tile.tier - this.activeTier) > NEAR_TIER_DISTANCE;

		// A canvas-backed tile is the interactive working set — the tiles under
		// the stroke being drawn. Evicting one throws away pixels the user is
		// looking at AND wastes the promotion that made it hot.
		const hot = (tile: Tile) => isCanvasSurface(tile.bitmap);

		const sweep = (accept: (key: TileKey, tile: Tile) => boolean): void => {
			for (const [key, tile] of this.tiles) {
				if (this.memoryBytes <= target) return;
				if (accept(key, tile)) this.evict(key, tile);
			}
		};

		// 1. Stale AND far from the active tier — pure dead weight.
		sweep((key, tile) => !this.isFresh(key, tile) && far(tile) && !hot(tile));
		// 2. Far from the active tier, fresh or not. Rebuilding these costs
		//    nothing until the user zooms back, and the fallback ladder covers it.
		sweep((_key, tile) => far(tile) && !hot(tile));
		// 3. Stale anywhere. Their pixels are already untrusted.
		sweep((key, tile) => !this.isFresh(key, tile) && !hot(tile));
		// 4. Anything cold. Now we are giving up tiles that are on screen.
		sweep((_key, tile) => !hot(tile));
		// 5. Last resort: even the hot set, rather than fail the allocation.
		sweep(() => true);

		return this.memoryBytes + bytes <= this.memoryLimit;
	}

	acquireCanvas(): OffscreenCanvas {
		return (
			this.pool.pop() ?? new OffscreenCanvas(this.bitmapSize, this.bitmapSize)
		);
	}

	releaseCanvas(canvas: OffscreenCanvas): void {
		if (this.pool.length < this.poolLimit) {
			this.pool.push(canvas);
			return;
		}
		canvas.width = 0;
		canvas.height = 0;
	}

	trimPool(keep = 2): void {
		while (this.pool.length > keep) {
			const canvas = this.pool.pop()!;
			canvas.width = 0;
			canvas.height = 0;
		}
	}

	pruneEmpty(maxAgeMs = 30_000): void {
		const now = performance.now();
		for (const [key, tile] of this.tiles) {
			if (tile.bitmap || now - tile.lastUsed <= maxAgeMs) continue;
			this.tiles.delete(key);
			this.generations.delete(key);
			this.dirtyRects.delete(key);
			this.memoryBytes -= tile.bytes;
		}
	}

	/**
	 * Finish ownership of one async tile request. If it produced no resident
	 * tile, none of its generation/dirty bookkeeping can affect future pixels;
	 * retaining those keys made the side maps grow without bound while
	 * panning around an infinite canvas.
	 */
	finishFlight(key: TileKey): void {
		this.inFlight.delete(key);
		if (this.tiles.has(key)) return;
		this.generations.delete(key);
		this.dirtyRects.delete(key);
	}

	reset(): void {
		for (const tile of this.tiles.values()) this.discardSurface(tile.bitmap);
		this.tiles.clear();
		this.generations.clear();
		this.inFlight.clear();
		this.dirtyRects.clear();
		this.memoryBytes = 0;
		this.trimPool(0);
	}

	/**
	 * Let go of a tile's pixels.
	 *
	 * A canvas surface goes back to the POOL rather than being zeroed: it came
	 * from there when the tile was promoted (see TileStamps.hotSurfaceFor), and
	 * zeroing it would shrink the pool by one every time a hot tile is evicted or
	 * replaced — so the pool would keep reallocating 588 KB canvases, which is
	 * precisely the churn the hot path exists to remove. `releaseCanvas` blanks
	 * it if the pool is already full.
	 */
	private discardSurface(surface: TileSurface | null): void {
		if (!surface) return;
		if (isCanvasSurface(surface)) {
			this.releaseCanvas(surface);
			return;
		}
		releaseTileSurface(surface);
	}

	private evict(key: TileKey, tile: Tile): void {
		this.discardSurface(tile.bitmap);
		this.memoryBytes -= tile.bytes;
		this.tiles.delete(key);
		this.dirtyRects.delete(key);
		// An in-flight result still needs the generation to reject an obsolete
		// bitmap. Once no request owns the key, the next visit can safely start at
		// generation zero against the then-current scene.
		if (!this.inFlight.has(key)) this.generations.delete(key);
	}
}
