import { beforeEach, describe, expect, it } from "vitest";
import {
	isSelectingAcrossLayers,
	resetSelectionScope,
	selectionScope,
	setSelectionScope,
} from "./selectionScope";

beforeEach(() => resetSelectionScope());

describe("selection scope", () => {
	it("defaults to the active layer", () => {
		expect(selectionScope()).toBe("activeLayer");
		expect(isSelectingAcrossLayers()).toBe(false);
	});

	it("widens and narrows on demand", () => {
		setSelectionScope("allLayers");
		expect(isSelectingAcrossLayers()).toBe(true);
		setSelectionScope("activeLayer");
		expect(isSelectingAcrossLayers()).toBe(false);
	});

	it("resets to the safe default when the user leaves the selection tools", () => {
		setSelectionScope("allLayers");
		resetSelectionScope();
		expect(selectionScope()).toBe("activeLayer");
	});
});
