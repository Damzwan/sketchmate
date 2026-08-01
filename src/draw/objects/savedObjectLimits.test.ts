import { describe, expect, it } from "vitest";
import {
	MAX_ROOM_SAVED_DRAWING_JSON_BYTES,
	MAX_SAVED_DRAWING_JSON_BYTES,
	MAX_SAVED_OBJECTS,
	validateSavedDrawingBytes,
	validateSavedObjectCount,
} from "./savedObjectLimits";

describe("saved object limits", () => {
	it("allows a selection at the supported maximum", () => {
		expect(validateSavedObjectCount(MAX_SAVED_OBJECTS)).toBeNull();
		expect(validateSavedObjectCount(MAX_SAVED_OBJECTS + 1)).toBe(
			"object-count",
		);
	});

	it("uses a tighter payload ceiling in collaboration rooms", () => {
		expect(validateSavedDrawingBytes(MAX_SAVED_DRAWING_JSON_BYTES)).toBeNull();
		expect(validateSavedDrawingBytes(MAX_SAVED_DRAWING_JSON_BYTES + 1)).toBe(
			"json-bytes",
		);
		expect(
			validateSavedDrawingBytes(MAX_ROOM_SAVED_DRAWING_JSON_BYTES + 1, {
				inRoom: true,
			}),
		).toBe("json-bytes");
	});
});
