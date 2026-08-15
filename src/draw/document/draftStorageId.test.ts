import { describe, expect, it } from "vitest";
import { isValidDraftStorageId } from "./draftStorageId";

describe("draft storage ids", () => {
	it("accepts non-empty string ids", () => {
		expect(isValidDraftStorageId("draft-1")).toBe(true);
	});

	it.each([
		undefined,
		null,
		"",
		"   ",
		Number.NaN,
	])("rejects values that cannot be draft key-path ids: %s", (id) => {
		expect(isValidDraftStorageId(id)).toBe(false);
	});
});
