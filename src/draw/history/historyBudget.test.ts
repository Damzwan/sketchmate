import { describe, expect, it } from "vitest";
import {
	eraseHistoryWeight,
	referenceHistoryWeight,
} from "@/draw/history/historyBudget";

describe("history budget", () => {
	it("keeps wide erase references lightweight", () => {
		expect(eraseHistoryWeight(1_000, 0)).toBe(17);
	});

	it("still charges fully serialized deleted objects", () => {
		expect(eraseHistoryWeight(1_000, 12)).toBe(29);
	});

	it("does not evict a short burst of wide erases", () => {
		const burstWeight = 8 * eraseHistoryWeight(200, 0);
		expect(burstWeight).toBeLessThan(400);
	});

	it("charges an id-only bulk import as references, not retained snapshots", () => {
		expect(referenceHistoryWeight(200)).toBe(5);
	});

	it("keeps a long run of large transforms inside the mobile budget", () => {
		// The reported bug: a handful of moves of a large selection filled the
		// 400-unit mobile budget on their own (they were charged one unit per
		// member) and evicted the undo stack down to MIN_ACTIONS, so undo could not
		// walk back to where the drawing started. A transform retains five numbers
		// per object, not the object.
		const moveWeight = referenceHistoryWeight(500);
		expect(20 * moveWeight).toBeLessThan(400);
		// Six was all it took before, because a move was charged per member.
		expect(6 * (1 + 500)).toBeGreaterThan(400);
	});
});
