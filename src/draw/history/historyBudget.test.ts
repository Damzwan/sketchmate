import { describe, expect, it } from "vitest";
import { eraseHistoryWeight } from "@/draw/history/historyBudget";

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
});
