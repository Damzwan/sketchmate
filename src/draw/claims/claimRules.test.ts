import { describe, expect, it } from "vitest";
import {
	type ClaimRect,
	canEditAt,
	claimViolation,
	violatesClaim,
} from "./claimRules";

const ME = "me";
const OTHER = "other";

const myArea: ClaimRect = { userId: ME, x: 0, y: 0, w: 100, h: 100 };
const theirArea: ClaimRect = { userId: OTHER, x: 200, y: 0, w: 100, h: 100 };
const areas = [myArea, theirArea];

/** A 10x10 object with its top-left at (x, y). */
const at = (x: number, y: number) => ({ x, y, w: 10, h: 10 });

describe("canEditAt", () => {
	it("lets anyone edit outside every claim", () => {
		expect(canEditAt(areas, 500, 500, ME, OTHER)).toBe(true);
		expect(canEditAt(areas, 500, 500, ME, ME)).toBe(true);
		expect(canEditAt([], 10, 10, ME, OTHER)).toBe(true);
	});

	it("refuses someone else's area whoever drew the object", () => {
		expect(canEditAt(areas, 250, 50, ME, ME)).toBe(false);
		expect(canEditAt(areas, 250, 50, ME, OTHER)).toBe(false);
		expect(canEditAt(areas, 250, 50, ME, undefined)).toBe(false);
	});

	it("lets me edit my own objects in my own area", () => {
		expect(canEditAt(areas, 50, 50, ME, ME)).toBe(true);
	});

	it("refuses someone else's object inside MY area", () => {
		// The rule that keeps getting lost: owning the area does not make its
		// contents yours.
		expect(canEditAt(areas, 50, 50, ME, OTHER)).toBe(false);
	});

	it("treats ownerless legacy content as editable by the area owner", () => {
		expect(canEditAt(areas, 50, 50, ME, undefined)).toBe(true);
	});

	it("refuses everything when we do not know who we are", () => {
		expect(canEditAt(areas, 50, 50, undefined, ME)).toBe(false);
	});
});

describe("violatesClaim", () => {
	it("allows anything clear of every claim", () => {
		expect(violatesClaim(areas, at(500, 500), ME, OTHER)).toBe(false);
		expect(violatesClaim([], at(10, 10), ME, OTHER)).toBe(false);
	});

	it("blocks parking somebody else's object in MY claim", () => {
		// THE griefing case: claim an empty region, then drag other people's work
		// into it. Nothing checked where the drag ENDED, only whether the area was
		// foreign — and your own area never is.
		expect(violatesClaim(areas, at(50, 50), ME, OTHER)).toBe(true);
	});

	it("blocks parking my own object in someone else's claim", () => {
		expect(violatesClaim(areas, at(250, 50), ME, ME)).toBe(true);
	});

	it("allows my own object in my own claim", () => {
		expect(violatesClaim(areas, at(50, 50), ME, ME)).toBe(false);
	});

	it("catches a mere overlap, not just a contained object", () => {
		// Dragged so only its corner enters the claim.
		expect(violatesClaim(areas, at(95, 95), ME, OTHER)).toBe(true);
		// Flush against the outside edge is not an overlap.
		expect(violatesClaim(areas, at(100, 100), ME, OTHER)).toBe(false);
	});

	it("is symmetric: neither user can impound the other", () => {
		// Same board, evaluated as the OTHER user.
		expect(violatesClaim(areas, at(250, 50), OTHER, ME)).toBe(true);
		expect(violatesClaim(areas, at(250, 50), OTHER, OTHER)).toBe(false);
		expect(violatesClaim(areas, at(50, 50), OTHER, OTHER)).toBe(true);
	});
});

describe("claimViolation reasons", () => {
	// The reason drives which toast the user sees, and "that's a claimed area"
	// reads as a bug when the area is visibly your own.
	it("names an intrusion into MY area as such", () => {
		expect(claimViolation(areas, at(50, 50), ME, OTHER)).toBe(
			"own-area-intrusion",
		);
	});

	it("names someone else's area as a foreign area", () => {
		expect(claimViolation(areas, at(250, 50), ME, ME)).toBe("foreign-area");
		expect(claimViolation(areas, at(250, 50), ME, OTHER)).toBe("foreign-area");
	});

	it("reports nothing when the move is fine", () => {
		expect(claimViolation(areas, at(500, 500), ME, OTHER)).toBe("none");
		expect(claimViolation(areas, at(50, 50), ME, ME)).toBe("none");
	});

	it("prefers the foreign-area reason when both apply", () => {
		// Straddling my area and someone else's: telling the user to keep other
		// people's work out of their own area would send them somewhere still
		// forbidden.
		const straddling = { x: 90, y: 0, w: 130, h: 10 };
		expect(claimViolation(areas, straddling, ME, OTHER)).toBe("foreign-area");
	});
});
