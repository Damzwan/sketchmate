import { describe, expect, it } from "vitest";
import {
	FLATTEN_ERASE_CLIP_AFTER,
	LIVE_ERASE_STROKES,
	MAX_HISTORY_ACTIONS,
} from "@/draw/history/eraseUndoPolicy";

describe("erase undo policy", () => {
	it("never bakes a stroke while its history action can still be undone", () => {
		expect(LIVE_ERASE_STROKES).toBeGreaterThan(MAX_HISTORY_ACTIONS);
		expect(FLATTEN_ERASE_CLIP_AFTER).toBeGreaterThan(LIVE_ERASE_STROKES);
	});
});
