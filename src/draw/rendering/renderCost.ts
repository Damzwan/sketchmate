// renderCost.ts
//
// A cheap, allocation-free estimate of what rasterizing an object will cost,
// used to decide whether a block of work is safe to run SYNCHRONOUSLY.
//
// WHY (docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M1)
//
// The engine's async bake yields correctly and often. But the smallest thing it
// can yield BETWEEN is one `obj.render()`, and that atom is unbounded: a single
// object carrying an eraser ClippingGroup was measured at ~13 ms typical and
// 268 ms worst case. Three paths run that atom with no yielding at all —
// `rebuildTileSync`, `repairTileRegionSync` and `WorldOverview.patchRect` — and
// all three sit on user-interaction frames (undo, redo, delete, style change,
// an erase that could not stamp).
//
// Those paths were bounded by OBJECT COUNT, which does not bound cost: 32
// pencil lines and 32 watercolour strokes differ by two orders of magnitude,
// and one erased object can exceed both. `rebuildRectSync` additionally
// exempted its first tile from the wall-clock check, so the most expensive
// possible tile always ran to completion.
//
// This module replaces "how many objects" with "how much work", measured before
// anything is cleared or drawn. Over budget means DECLINE — never truncate.
// Declining is already a supported outcome on every one of these paths: the
// tile stays stale, the fallback ladder covers it, and the yielded async bake
// owns the work. The user sees a moment of softness instead of a dropped frame,
// and on a bad enough device, instead of an ANR.
//
// UNITS are arbitrary and relative: roughly "one path segment stroked once".
// The budgets in drawMemoryProfile are calibrated from that, and
// `syncRepairDeclines` / `syncRepairCostMax` in the metrics snapshot are what
// tune them against real devices — do not adjust them by feel.

/**
 * A clip child is far more expensive than a plain path segment of the same
 * length: fabric force-caches any object with a clipPath (`needsItsOwnCache()`
 * is true whenever one exists), so the mask is rasterized to its own canvas at
 * tile resolution and then composited. This multiplier is what makes a heavily
 * erased object read as expensive — which is the case that actually hurts.
 */
const CLIP_CHILD_COST = 40;

/** A group child still costs a full render; the group itself is bookkeeping. */
const GROUP_CHILD_COST = 4;

/** Baseline for an object we cannot measure at all. Deliberately not zero. */
const UNKNOWN_COST = 64;

/**
 * Decoded source pixels, discounted heavily: a `drawImage` of an already-decoded
 * bitmap is fast per pixel compared with stroking geometry. It is included at
 * all because a large image still costs real fill rate, and because a
 * flattened erase mask arrives as exactly this.
 */
const PIXELS_PER_COST_UNIT = 4096;

/**
 * An image-backed clip (a compacted erase mask) is the worst object in the
 * engine: it decodes and composites a full-size mask per render and cannot be
 * culled. Priced so that a single one exceeds any sync budget on mobile.
 */
const IMAGE_CLIP_COST = 20_000;

/**
 * Estimate the cost of rasterizing one object once.
 *
 * Property reads only — no measuring, no coord recomputation, no allocation.
 * Safe to call inside a loop over a whole tile's query result.
 */
export function estimateObjectRenderCost(object: any): number {
	if (!object) return 0;
	// Fabric skips these before any path work, so they are genuinely free.
	if (object.visible === false || object.opacity === 0) return 0;

	if (object.__hasImageClip) return IMAGE_CLIP_COST;

	let cost = 0;

	// Compact (typed-array) geometry reports its own segment count without
	// materializing the array-of-arrays representation. Prefer it.
	if (
		typeof object._hasCompactPathGeometry === "function" &&
		object._hasCompactPathGeometry()
	) {
		cost += object.complexity?.() ?? UNKNOWN_COST;
	} else if (Array.isArray(object.path)) {
		cost += object.path.length;
	} else {
		cost += UNKNOWN_COST;
	}

	const clipChildren = object.clipPath?._objects;
	if (Array.isArray(clipChildren)) {
		cost += clipChildren.length * CLIP_CHILD_COST;
	} else if (object.clipPath) {
		// A clip with no child list still forces the cache path.
		cost += CLIP_CHILD_COST;
	}

	if (Array.isArray(object._objects)) {
		cost += object._objects.length * GROUP_CHILD_COST;
	}

	const source = object.getElement?.() ?? object.stampCanvas;
	if (source) {
		cost += ((source.width ?? 0) * (source.height ?? 0)) / PIXELS_PER_COST_UNIT;
	}

	return cost;
}

/**
 * Total cost of a set, stopping as soon as `limit` is exceeded.
 *
 * The early exit matters: the pathological case is a dense tile, and that is
 * exactly the case where we do not want to pay for a full estimate before
 * declining. Returns a value `> limit` to signal "over" without promising the
 * true total.
 */
export function estimateRenderCost(
	objects: ArrayLike<any>,
	limit = Infinity,
): number {
	let total = 0;
	for (let i = 0; i < objects.length; i++) {
		total += estimateObjectRenderCost(objects[i]);
		if (total > limit) return total;
	}
	return total;
}

/**
 * "Is this set safe to render in one uninterruptible block?"
 *
 * @param budget cost units, from the device memory profile.
 */
export function isSyncRenderAffordable(
	objects: ArrayLike<any>,
	budget: number,
): boolean {
	return estimateRenderCost(objects, budget) <= budget;
}
