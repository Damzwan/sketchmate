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

export type LiveMode = "normal" | "additive" | "erase";

export interface LiveItem<T> {
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
		// MAX is a performance cap, not permission to break the cross-tier
		// correctness handoff. Additive entries are short-lived and already exist
		// in the scene; retaining the reference until its overview job commits is
		// safer than dropping the only pixels a zoomed-out frame can render.
		if (
			mode !== "additive" &&
			!this.items.has(obj.id) &&
			this.items.size >= this.MAX
		)
			return false;
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
			// Additive items are a correctness bridge between zoom tiers. They leave
			// only after the overview handoff has actually committed; expiring one on
			// a timer can make a newly-drawn stroke disappear during a long gesture.
			if (it.mode === "additive") continue;
			const ttl = it.mode === "erase" ? ERASE_TTL_MS : NORMAL_TTL_MS;
			if (now - it.addedAt > ttl) {
				if (it.mode === "normal") expired.push(it.rect);
				this.items.delete(id);
			}
		}
		return expired;
	}

	settledItems(isReady: (rect: WorldRect) => boolean): [string, LiveItem<T>][] {
		const out: [string, LiveItem<T>][] = [];
		for (const entry of this.items) if (isReady(entry[1].rect)) out.push(entry);
		return out;
	}

	/**
	 * Render all live items in world space, viewport-culled.
	 *
	 * `alreadyPainted` hides an item whose pixels the caller has ALREADY drawn
	 * this frame (its tile baked and was composited underneath). Drawing it again
	 * on top is invisible at full alpha but doubles a semi-transparent stroke
	 * (0.45 + 0.45 ≈ 0.70) for every frame between the bake landing and the item
	 * being demoted — the low-opacity brush flicker. Demotion still does the
	 * bookkeeping; this just stops the overlap being visible in the meantime.
	 */
	composite(
		ctx: CanvasRenderingContext2D,
		vpt: number[],
		dpr: number,
		render: LiveRenderer<T>,
		viewWorld?: WorldRect,
		alreadyPainted?: (
			rect: WorldRect,
			item: LiveItem<T>,
			id: string,
		) => boolean,
	): void {
		if (this.items.size === 0) return;
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		for (const [id, it] of this.items) {
			if (viewWorld && !this.intersects(it.rect, viewWorld)) continue;
			if (alreadyPainted?.(it.rect, it, id)) continue;
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
