/**
 * Pure claim-permission rules, with no store, canvas or fabric involved.
 *
 * Split out because this is anti-griefing logic that has regressed twice by
 * being expressed as "is this area FOREIGN?" — a question whose answer depends
 * on who is asking, which is exactly how the area owner ended up exempt from
 * their own claim's protection. Stated once, here, and tested.
 */

export interface ClaimRect {
	userId: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
	return !(
		a.x + a.w <= b.x ||
		b.x + b.w <= a.x ||
		a.y + a.h <= b.y ||
		b.y + b.h <= a.y
	);
}

export function areaAtPoint(
	areas: readonly ClaimRect[],
	x: number,
	y: number,
): ClaimRect | null {
	for (const a of areas) {
		if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
	}
	return null;
}

/**
 * "May `me` edit something owned by `owner` at this point?"
 *
 * A claimed area is a PRIVATE workspace, which is two rules, not one:
 *   • someone else's area — hands off entirely, whoever drew the thing;
 *   • my own area — mine to edit, but only MY objects.
 *
 * An object with no recorded owner is treated as editable, matching how
 * ownerless legacy content behaves everywhere else.
 */
export function canEditAt(
	areas: readonly ClaimRect[],
	x: number,
	y: number,
	me: string | undefined,
	owner?: string,
): boolean {
	const area = areaAtPoint(areas, x, y);
	if (!area) return true;
	if (!me || String(area.userId) !== me) return false;
	return !owner || owner === me;
}

/**
 * "Does this object, where it is now, violate a claim?"
 *
 * Overlap-based and considers EVERY area, not only the ones that are foreign to
 * `me`:
 *   • an area that is not mine — nothing of mine may be parked in it;
 *   • MY area — nothing that isn't mine may be parked in it.
 *
 * The second case is the one that kept getting missed. Selection already refuses
 * to hand over an object sitting inside a claim, but an object starting OUTSIDE
 * one is fair game — and nothing checked where the grab ended. So the griefer's
 * move was: claim an empty region (claimability is only checked against foreign
 * objects at claim time), then drag other people's work into it. Once inside, the
 * owner rule made it un-editable by everyone, the victim included. Claiming an
 * area became a way to impound other people's drawings.
 */
export type ClaimViolation =
	/** Nothing wrong. */
	| "none"
	/** Landed in an area belonging to someone else. */
	| "foreign-area"
	/** Landed in MY area, but the object is not mine. */
	| "own-area-intrusion";

export function claimViolation(
	areas: readonly ClaimRect[],
	rect: Rect,
	me: string | undefined,
	owner?: string,
): ClaimViolation {
	// "foreign-area" outranks "own-area-intrusion": it is the stronger statement
	// about what the user may not do, and reporting the weaker one would tell them
	// to move the object somewhere it still would not be allowed.
	let intrusion = false;
	for (const area of areas) {
		if (!rectsOverlap(rect, area)) continue;
		if (!me || String(area.userId) !== me) return "foreign-area";
		if (owner && owner !== me) intrusion = true;
	}
	return intrusion ? "own-area-intrusion" : "none";
}

export function violatesClaim(
	areas: readonly ClaimRect[],
	rect: Rect,
	me: string | undefined,
	owner?: string,
): boolean {
	return claimViolation(areas, rect, me, owner) !== "none";
}
