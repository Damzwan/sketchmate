// src/draw/utils/QuadTree.ts
import { Canvas, FabricObject } from "fabric";

// ─── 1. Changed to a plain interface for high performance ──────────────
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

// ─── 2. Standalone math helpers instead of class methods ───────────────
export function rectIntersects(a: Rect, b: Rect): boolean {
	return !(
		b.x > a.x + a.w ||
		b.x + b.w < a.x ||
		b.y > a.y + a.h ||
		b.y + b.h < a.y
	);
}

export function rectContains(a: Rect, b: Rect): boolean {
	return (
		b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
	);
}

export interface QuadtreeEntry<T> {
	id: string;
	bounds: Rect;
	__nodes?: Quadtree<T>[]; // Must be an array
}

export class Quadtree<T> {
	private objects: QuadtreeEntry<T>[] = [];
	private divided = false;

	private nw?: Quadtree<T>;
	private ne?: Quadtree<T>;
	private sw?: Quadtree<T>;
	private se?: Quadtree<T>;

	constructor(
		public readonly boundary: Rect,
		private readonly capacity = 8,
		private readonly depth = 0,
		private readonly maxDepth = 8,
	) {}

	private subdivide(): void {
		const { x, y, w, h } = this.boundary;
		const hw = w / 2;
		const hh = h / 2;

		// Passing plain objects instead of new Rect()
		this.nw = new Quadtree(
			{ x, y, w: hw, h: hh },
			this.capacity,
			this.depth + 1,
			this.maxDepth,
		);
		this.ne = new Quadtree(
			{ x: x + hw, y, w: hw, h: hh },
			this.capacity,
			this.depth + 1,
			this.maxDepth,
		);
		this.sw = new Quadtree(
			{ x, y: y + hh, w: hw, h: hh },
			this.capacity,
			this.depth + 1,
			this.maxDepth,
		);
		this.se = new Quadtree(
			{ x: x + hw, y: y + hh, w: hw, h: hh },
			this.capacity,
			this.depth + 1,
			this.maxDepth,
		);

		this.divided = true;
	}

	insert(entry: QuadtreeEntry<T>): boolean {
		if (!rectIntersects(this.boundary, entry.bounds)) return false;

		if (this.objects.length < this.capacity || this.depth >= this.maxDepth) {
			this.objects.push(entry);
			if (!entry.__nodes) entry.__nodes = [];
			entry.__nodes.push(this);
			return true;
		}

		if (!this.divided) this.subdivide();

		const pushedToChild =
			(rectContains(this.nw!.boundary, entry.bounds) &&
				this.nw!.insert(entry)) ||
			(rectContains(this.ne!.boundary, entry.bounds) &&
				this.ne!.insert(entry)) ||
			(rectContains(this.sw!.boundary, entry.bounds) &&
				this.sw!.insert(entry)) ||
			(rectContains(this.se!.boundary, entry.bounds) && this.se!.insert(entry));

		if (!pushedToChild) {
			this.objects.push(entry);
			if (!entry.__nodes) entry.__nodes = [];
			entry.__nodes.push(this);
		}

		return true;
	}

	remove(entry: QuadtreeEntry<T>): boolean {
		if (!entry.__nodes) return false;

		const nodeIdx = entry.__nodes.indexOf(this);
		if (nodeIdx !== -1) {
			entry.__nodes.splice(nodeIdx, 1);

			const objIdx = this.objects.findIndex((o) => o.id === entry.id);
			if (objIdx !== -1) {
				this.objects.splice(objIdx, 1);
				return true;
			}
		}

		return false;
	}

	update(entry: QuadtreeEntry<T>): void {
		this.remove(entry);
		this.insert(entry);
	}

	query(range: Rect, found: QuadtreeEntry<T>[] = []): QuadtreeEntry<T>[] {
		if (!rectIntersects(this.boundary, range)) {
			return found;
		}
		for (const obj of this.objects) {
			if (rectIntersects(range, obj.bounds)) {
				found.push(obj);
			}
		}
		if (this.divided) {
			this.nw!.query(range, found);
			this.ne!.query(range, found);
			this.sw!.query(range, found);
			this.se!.query(range, found);
		}
		return found;
	}

	clear(): void {
		this.objects.length = 0;

		if (this.divided) {
			this.nw!.clear();
			this.ne!.clear();
			this.sw!.clear();
			this.se!.clear();
		}

		this.divided = false;
	}
}

export class InfiniteQuadtreeManager<T> {
	private chunks = new Map<string, Quadtree<T>>();

	constructor(
		private readonly chunkSize = 4096,
		private readonly capacity = 8,
		private readonly maxDepth = 8,
	) {}

	private getOverlappingChunkKeys(bounds: Rect): string[] {
		const startX = Math.floor(bounds.x / this.chunkSize);
		const startY = Math.floor(bounds.y / this.chunkSize);
		const endX = Math.floor((bounds.x + bounds.w) / this.chunkSize);
		const endY = Math.floor((bounds.y + bounds.h) / this.chunkSize);

		const keys = [];
		for (let x = startX; x <= endX; x++) {
			for (let y = startY; y <= endY; y++) {
				keys.push(`${x},${y}`);
			}
		}
		return keys;
	}

	insert(entry: QuadtreeEntry<T>) {
		const keys = this.getOverlappingChunkKeys(entry.bounds);

		for (const key of keys) {
			if (!this.chunks.has(key)) {
				const [cx, cy] = key.split(",").map(Number);
				// Plain object instead of new Rect()
				const chunkBounds = {
					x: cx * this.chunkSize,
					y: cy * this.chunkSize,
					w: this.chunkSize,
					h: this.chunkSize,
				};
				this.chunks.set(
					key,
					new Quadtree(chunkBounds, this.capacity, 0, this.maxDepth),
				);
			}

			this.chunks.get(key)!.insert(entry);
		}
	}

	update(entry: QuadtreeEntry<T>) {
		this.remove(entry);
		this.insert(entry);
	}

	remove(entry: QuadtreeEntry<T>) {
		if (entry.__nodes) {
			const nodesToClear = [...entry.__nodes];
			for (const node of nodesToClear) {
				node.remove(entry);
			}
		}
	}

	query(range: Rect): QuadtreeEntry<T>[] {
		const keys = this.getOverlappingChunkKeys(range);
		const foundMap = new Map<string, QuadtreeEntry<T>>();

		for (const key of keys) {
			const chunk = this.chunks.get(key);
			if (chunk) {
				const items = chunk.query(range);
				for (const item of items) {
					foundMap.set(item.id, item);
				}
			}
		}

		return Array.from(foundMap.values());
	}

	clear(): void {
		for (const chunk of this.chunks.values()) {
			chunk.clear();
		}
		this.chunks.clear();
	}
}

export function fabricObjectToEntry(
	obj: FabricObject,
): QuadtreeEntry<FabricObject> {
	// @ts-ignore
	const b = obj.getBoundingRect(true, true);

	return {
		id: obj.id,
		bounds: { x: b.left, y: b.top, w: b.width, h: b.height },
	};
}

export function getViewportRect(canvas: Canvas): Rect {
	const vpt = canvas.viewportTransform!;
	const zoom = canvas.getZoom();

	return {
		x: -vpt[4] / zoom,
		y: -vpt[5] / zoom,
		w: canvas.getWidth() / zoom,
		h: canvas.getHeight() / zoom,
	};
}
