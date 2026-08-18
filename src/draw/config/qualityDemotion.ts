/**
 * A device's SELF-REPORTED quality tier, learned from how it actually behaves.
 *
 * WHY THIS IS PERSISTED RATHER THAN APPLIED LIVE
 *
 * The obvious design is adaptive resolution: notice the frames are late, drop
 * the render scale, carry on. The engine cannot do that. `getRenderDpr()` is
 * cached for the whole session on purpose — fabric's backing store, the tile
 * bake scale, hit-testing, bucket-fill pixel reads and the eraser's screen-space
 * clip rect are all sized from it once, and they must agree
 * (see renderQuality.config.ts → INVARIANT). Changing it mid-session means
 * resizing every canvas and invalidating every tile at the exact moment the
 * device is already struggling, which is the worst possible time to do the most
 * expensive thing available.
 *
 * So the loop is closed across launches instead: a session that shows sustained
 * main-thread stalls raises the demotion level, and the NEXT launch starts at a
 * lower tier. Slow, but it is the honest version — and unlike a fixed device
 * class it converges on hardware nobody has a device-detection rule for.
 *
 * The within-session response is limited to things that are genuinely cheap to
 * change (see renderPressureGovernor.ts).
 *
 * LEVELS
 *
 *   0 — no demotion; the device class stands as detected.
 *   1 — treat as low-end regardless of what the hardware claims.
 *   2 — treat as severely constrained: render DPR 1.0, smallest tile budget,
 *       CPU rasterization.
 *
 * Demotion EXPIRES. A device is not permanently slow: an OS update, a lighter
 * drawing, or simply less background pressure can change the answer, and a
 * permanent record would mean one bad session costs a user resolution forever.
 */
export const DRAW_QUALITY_DEMOTION_STORAGE_KEY = "draw_quality_demotion";

export type QualityDemotionLevel = 0 | 1 | 2;

export const MAX_QUALITY_DEMOTION: QualityDemotionLevel = 2;

/** How long a demotion stands before the device gets to prove itself again. */
export const QUALITY_DEMOTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface QualityDemotionRecord {
	level: QualityDemotionLevel;
	/** `Date.now()` when the level was last raised. */
	at: number;
}

/** Pure resolver, so expiry and malformed input are testable without storage. */
export function resolveQualityDemotion(
	stored: string | null | undefined,
	now: number,
	ttlMs = QUALITY_DEMOTION_TTL_MS,
): QualityDemotionLevel {
	if (!stored) return 0;
	let record: QualityDemotionRecord;
	try {
		record = JSON.parse(stored) as QualityDemotionRecord;
	} catch {
		return 0;
	}
	if (!record || typeof record !== "object") return 0;
	const { level, at } = record;
	if (level !== 1 && level !== 2) return 0;
	if (typeof at !== "number" || !Number.isFinite(at)) return 0;
	// A clock that moved backwards (timezone change, NTP correction) must not
	// read as "expired 40 years ago" or as "valid forever".
	const age = now - at;
	if (age < 0 || age > ttlMs) return 0;
	return level;
}

function read(): string | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(DRAW_QUALITY_DEMOTION_STORAGE_KEY);
	} catch {
		return null;
	}
}

/**
 * The demotion in force for THIS session.
 *
 * Read once at module evaluation, like every other render constant, so a
 * demotion written mid-session cannot desync the canvas from the composite.
 */
export const DRAW_QUALITY_DEMOTION: QualityDemotionLevel =
	resolveQualityDemotion(read(), Date.now());

/**
 * Raise the demotion level, for the next launch. Never lowers it: recovery is
 * by expiry, not by one good minute in an otherwise bad session.
 *
 * Returns the level now stored, so the caller can report whether anything
 * changed without re-reading storage.
 */
export function raiseQualityDemotion(
	level: QualityDemotionLevel,
): QualityDemotionLevel {
	const current = resolveQualityDemotion(read(), Date.now());
	if (level <= current) return current;
	if (typeof localStorage === "undefined") return current;
	const record: QualityDemotionRecord = { level, at: Date.now() };
	try {
		localStorage.setItem(
			DRAW_QUALITY_DEMOTION_STORAGE_KEY,
			JSON.stringify(record),
		);
		return level;
	} catch {
		return current;
	}
}

/** Support/debug seam — clears a demotion without waiting for the TTL. */
export function clearQualityDemotion(): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.removeItem(DRAW_QUALITY_DEMOTION_STORAGE_KEY);
	} catch {
		/* nothing to clear */
	}
}
