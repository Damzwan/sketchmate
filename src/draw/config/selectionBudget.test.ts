import { describe, expect, it } from "vitest";
import {
	capOrderedSelection,
	resolveSelectionObjectLimit,
} from "./selectionBudget";

describe("selection object budget", () => {
	it("keeps the synchronous ActiveSelection atom smallest on the ANR cohort", () => {
		const severe = resolveSelectionObjectLimit({
			mobile: true,
			lowEnd: true,
			severe: true,
		});
		const ordinaryMobile = resolveSelectionObjectLimit({
			mobile: true,
			lowEnd: false,
			severe: false,
		});
		const desktop = resolveSelectionObjectLimit({
			mobile: false,
			lowEnd: false,
			severe: false,
		});

		expect(severe).toBe(256);
		expect(severe).toBeLessThan(ordinaryMobile);
		expect(ordinaryMobile).toBeLessThan(desktop);
	});

	it("keeps topmost objects when a selection is capped", () => {
		const capped = capOrderedSelection(["bottom", "middle", "top"], 2);
		expect(capped).toEqual({
			objects: ["middle", "top"],
			omitted: 1,
		});
	});
});
