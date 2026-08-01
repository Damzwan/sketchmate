import { describe, expect, it } from "vitest";
import {
	allowedCompactionPixels,
	canRetainCompactedStrokes,
} from "./eraserCompactionBudget";

describe("eraser compaction session budget", () => {
	it("shrinks a new mask to the pixels remaining in the session", () => {
		expect(allowedCompactionPixels(7_000, 5_000, 10_000)).toBe(3_000);
		expect(allowedCompactionPixels(10_000, 5_000, 10_000)).toBe(0);
	});

	it("refuses compaction that would exceed retained stroke budget", () => {
		expect(canRetainCompactedStrokes(80, 20, 100)).toBe(true);
		expect(canRetainCompactedStrokes(81, 20, 100)).toBe(false);
	});
});
