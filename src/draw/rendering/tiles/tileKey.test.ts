import { describe, expect, it } from "vitest";
import { formatTileKey, keyTier, keyTx, keyTy, tileKey } from "./tileKey";

describe("tileKey packing", () => {
	it("round-trips every tier with positive, negative and zero coordinates", () => {
		for (let tier = 0; tier <= 8; tier++) {
			for (const tx of [-1_000_000, -1, 0, 1, 1_000_000]) {
				for (const ty of [-1_000_000, -1, 0, 1, 1_000_000]) {
					const key = tileKey(tier, tx, ty);
					expect(keyTier(key)).toBe(tier);
					expect(keyTx(key)).toBe(tx);
					expect(keyTy(key)).toBe(ty);
				}
			}
		}
	});

	it("stays an exact safe integer at the extremes", () => {
		// If a key ever exceeded MAX_SAFE_INTEGER, distinct tiles would collide
		// silently and the compositor would draw one tile's pixels in another's
		// place — the kind of bug that only shows up far from the origin.
		const key = tileKey(8, 1_048_575, 1_048_575);
		expect(Number.isSafeInteger(key)).toBe(true);
		expect(key).toBeLessThan(Number.MAX_SAFE_INTEGER);
	});

	it("never collides across neighbouring tiers or coordinates", () => {
		const seen = new Set<number>();
		for (let tier = 0; tier <= 8; tier++) {
			for (let tx = -3; tx <= 3; tx++) {
				for (let ty = -3; ty <= 3; ty++) {
					const key = tileKey(tier, tx, ty);
					expect(seen.has(key)).toBe(false);
					seen.add(key);
				}
			}
		}
	});

	it("formats for diagnostics in the original string form", () => {
		expect(formatTileKey(tileKey(4, -2, 7))).toBe("4:-2:7");
	});
});
