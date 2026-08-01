// liveLayer.ts
//
// Small, bounded set of in-flight objects rendered DIRECTLY over committed
// tiles every frame. Now also used to COVER destructively-dropped regions with
// sharp vectors during the bake window (see RenderEngine.coverRegionLive).
//
// Hardening vs. the previous version:
//   • freeSlots() so callers can avoid overflowing the cap silently.
//   • viewport culling in composite() — off-screen live items cost nothing.
//   • gcExpired() — normal items have a TTL so a missed demotion can't leave
//     the layer permanently full (the "less responsive after zoom" leak).
//   • erase items have a short hard TTL (their tile rebakes fast).

import type { Bounded, WorldRect } from "./committedLayer";

export type LiveMode = "normal" | "erase";

interface LiveItem<T> {
	obj: T;
	mode: LiveMode;
	rect: WorldRect;
	addedAt: number;
}

export type LiveRenderer<T> = (
	ctx: CanvasRenderingContext2D,
	obj: T,
	mode: LiveMode,
) => void;

const NORMAL_TTL_MS = 5000; // safety expiry for an item that never demoted
const ERASE_TTL_MS = 1500; // erase overlays are transient

export class LiveLayer<T extends Bounded> {
	private items = new Map<string, LiveItem<T>>();
	private readonly MAX: number;

	constructor(opts: { max?: number } = {}) {
		this.MAX = opts.max ?? 64;
	}

	freeSlots(): number {
		return Math.max(0, this.MAX - this.items.size);
	}

	add(obj: T, rect: WorldRect, mode: LiveMode = "normal"): boolean {
		if (!obj.id) return false;
		if (!this.items.has(obj.id) && this.items.size >= this.MAX) return false;
		this.items.set(obj.id, { obj, mode, rect, addedAt: performance.now() });
		return true;
	}
	remove(id: string): void {
		this.items.delete(id);
	}
	has(id: string): boolean {
		return this.items.has(id);
	}
	get size(): number {
		return this.items.size;
	}
	isEmpty(): boolean {
		return this.items.size === 0;
	}
	clear(): void {
		this.items.clear();
	}

	/** Force-expire stale items so the layer can never stay full. Returns the
	 *  rects of expired NORMAL items so the caller can fold them into the
	 *  overview (their overview patch was deferred until demote; a TTL expiry
	 *  short-circuits that, so it must be done here or the stroke vanishes from
	 *  the far-zoom fallback). */
	gcExpired(): WorldRect[] {
		if (this.items.size === 0) return [];
		const now = performance.now();
		const expired: WorldRect[] = [];
		for (const [id, it] of this.items) {
			const ttl = it.mode === "erase" ? ERASE_TTL_MS : NORMAL_TTL_MS;
			if (now - it.addedAt > ttl) {
				if (it.mode === "normal") expired.push(it.rect);
				this.items.delete(id);
			}
		}
		return expired;
	}

	settledIds(isReady: (rect: WorldRect) => boolean): string[] {
		const out: string[] = [];
		for (const [id, it] of this.items) if (isReady(it.rect)) out.push(id);
		return out;
	}

	rectOf(id: string): WorldRect | undefined {
		return this.items.get(id)?.rect;
	}

	/** Render all live items in world space, viewport-culled. */
	composite(
		ctx: CanvasRenderingContext2D,
		vpt: number[],
		dpr: number,
		render: LiveRenderer<T>,
		viewWorld?: WorldRect,
	): void {
		if (this.items.size === 0) return;
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		for (const it of this.items.values()) {
			if (viewWorld && !this.intersects(it.rect, viewWorld)) continue;
			ctx.save();
			if (it.mode === "erase") ctx.globalCompositeOperation = "destination-out";
			try {
				render(ctx, it.obj, it.mode);
			} catch {
				/* ignore */
			}
			ctx.restore();
		}
		ctx.restore();
	}

	private intersects(a: WorldRect, b: WorldRect): boolean {
		return !(
			a.x + a.w < b.x ||
			a.x > b.x + b.w ||
			a.y + a.h < b.y ||
			a.y > b.y + b.h
		);
	}
}
