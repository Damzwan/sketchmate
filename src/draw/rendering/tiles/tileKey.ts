// tileKey.ts
//
// Tiles are addressed by (tier, tx, ty) packed into ONE number.
//
// WHY (docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M6)
//
// The key used to be the template string `${tier}:${tx}:${ty}`, and it is built
// in more places per frame than is obvious:
//
//   • once per visible cell in `composite`, and
//   • once per cross-tier fallback probe — `FALLBACK_DEPTH` is 5 and each step
//     probes both a coarser and a finer tier, so up to 10 more per UNCOVERED
//     cell — and again in every stamp, bake, repair and invalidation.
//
// That is on the order of 100–200 string allocations per composited frame, plus
// string hashing on every Map lookup, on a device whose young generation is
// small enough that the resulting scavenge rate is itself a source of jank. A
// GC pause landing mid-gesture is indistinguishable from the engine being slow.
//
// It also removes the `key.split(":")` + three `parseInt` calls that
// `markDirty`, `markTierDirty`, `dropTiles` and `markDirtyWithSharpTransition`
// each performed per in-flight key.
//
// LAYOUT
//
//   bits 42+ : tier   (0…8 today; 4 bits reserved)
//   bits 21–41: tx + OFFSET
//   bits 0–20 : ty + OFFSET
//
// 21 bits per axis with a 2^20 bias covers ±1,048,576 tiles per axis. At the
// finest tier (32) that is ±1,048,576 × 512/32 world units ≈ ±16.7 million —
// far beyond any reachable position, since zoom itself is clamped. The widest
// key value is 8 × 2^42 ≈ 3.5e13, comfortably inside `Number.MAX_SAFE_INTEGER`
// (9.0e15), so every key is an exact integer and Map lookups stay on the fast
// integer path.
//
// Bitwise operators are NOT usable here: JS coerces them to 32-bit. The
// multiply/divide form below is the correct way to pack beyond 32 bits and V8
// keeps the results as small integers (Smis) or exact doubles either way.

const AXIS_BITS = 21;
const AXIS_SPAN = 2 ** AXIS_BITS; // 2_097_152
const AXIS_OFFSET = AXIS_SPAN / 2; // 1_048_576
const TIER_SPAN = AXIS_SPAN * AXIS_SPAN; // 2^42

export type TileKey = number;

export function tileKey(tier: number, tx: number, ty: number): TileKey {
	return tier * TIER_SPAN + (tx + AXIS_OFFSET) * AXIS_SPAN + (ty + AXIS_OFFSET);
}

export function keyTier(key: TileKey): number {
	return Math.floor(key / TIER_SPAN);
}

export function keyTx(key: TileKey): number {
	return (Math.floor(key / AXIS_SPAN) % AXIS_SPAN) - AXIS_OFFSET;
}

export function keyTy(key: TileKey): number {
	return (key % AXIS_SPAN) - AXIS_OFFSET;
}

/** Debug/diagnostic only — never use this as a map key. */
export function formatTileKey(key: TileKey): string {
	return `${keyTier(key)}:${keyTx(key)}:${keyTy(key)}`;
}
