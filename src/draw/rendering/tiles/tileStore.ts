import type { WorldRect } from "./tileGeometry";

export interface Tile {
	bitmap: ImageBitmap | null;
	tier: number;
	tx: number;
	ty: number;
	bytes: number;
	builtGen: number;
	lastUsed: number;
	usable: boolean;
}

export class TileStore {
	readonly tiles = new Map<string, Tile>();
	readonly generations = new Map<string, number>();
	readonly inFlight = new Set<string>();
	readonly dirtyRects = new Map<string, WorldRect | null>();
	memoryBytes = 0;

	private readonly pool: OffscreenCanvas[] = [];

	constructor(
		private readonly bitmapSize: number,
		private readonly memoryLimit: number,
		private readonly poolLimit: number,
	) {}

	isFresh(key: string, tile: Tile): boolean {
		return tile.builtGen === (this.generations.get(key) ?? 0);
	}

	store(
		key: string,
		tier: number,
		tx: number,
		ty: number,
		bitmap: ImageBitmap | null,
		bytes: number,
		builtGen: number,
		usable: boolean,
	): void {
		if (usable) this.dirtyRects.delete(key);
		const previous = this.tiles.get(key);
		if (previous) {
			previous.bitmap?.close();
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
			lastUsed: performance.now(),
		});
		this.memoryBytes += bytes;
	}

	touch(key: string, tile: Tile): void {
		tile.lastUsed = performance.now();
		if (this.tiles.delete(key)) this.tiles.set(key, tile);
	}

	reserve(bytes: number): boolean {
		if (this.memoryBytes + bytes <= this.memoryLimit) return true;
		const target = this.memoryLimit * 0.85 - bytes;

		for (const [key, tile] of this.tiles) {
			if (this.memoryBytes <= target) break;
			if (this.isFresh(key, tile)) continue;
			this.evict(key, tile);
		}
		for (const [key, tile] of this.tiles) {
			if (this.memoryBytes <= target) break;
			this.evict(key, tile);
		}
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

	reset(): void {
		for (const tile of this.tiles.values()) tile.bitmap?.close();
		this.tiles.clear();
		this.generations.clear();
		this.inFlight.clear();
		this.dirtyRects.clear();
		this.memoryBytes = 0;
		this.trimPool(0);
	}

	private evict(key: string, tile: Tile): void {
		tile.bitmap?.close();
		this.memoryBytes -= tile.bytes;
		this.tiles.delete(key);
		this.dirtyRects.delete(key);
	}
}
