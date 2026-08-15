// @vitest-environment jsdom
import { ActiveSelection, InteractiveFabricObject, Rect } from "fabric";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	installSelectionBorderPolicy,
	SELECTION_MEMBER_BORDER_LIMIT,
} from "./fabricSetup";

beforeAll(() => {
	installSelectionBorderPolicy();
});

/**
 * Count `drawBorders` calls for one control render. Fabric draws one per
 * selection MEMBER plus one for the selection itself, so `members + 1` is the
 * unmodified behaviour and `1` is a single box.
 */
function borderCount(members: number): number {
	const objects = Array.from(
		{ length: members },
		(_, i) => new Rect({ left: i * 20, top: 0, width: 10, height: 10 }),
	);
	const selection = new ActiveSelection(objects);
	// The custom `_renderControls` reads the context off `this.canvas`; a stub is
	// enough, nothing here inspects pixels.
	const ctx = {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		globalAlpha: 1,
		lineWidth: 1,
	} as any;
	const canvas = {
		getTopContext: () => ctx,
		viewportTransform: [1, 0, 0, 1, 0, 0],
		getRetinaScaling: () => 1,
	};
	(selection as any).canvas = canvas;
	for (const o of objects) (o as any).canvas = canvas;

	let count = 0;
	const proto = InteractiveFabricObject.prototype as any;
	const originalBorders = proto.drawBorders;
	const originalControls = proto.drawControls;
	proto.drawBorders = () => {
		count++;
	};
	// Handles need a real canvas to compute retina scaling and are not what this
	// is measuring.
	proto.drawControls = () => {};
	try {
		(selection as any)._renderControls(ctx);
	} finally {
		proto.drawBorders = originalBorders;
		proto.drawControls = originalControls;
	}
	return count;
}

describe("large selections draw one box", () => {
	it("keeps per-member borders for a small selection", () => {
		// Two or three objects: the per-member boxes say exactly what is selected,
		// which is the useful information at that size.
		expect(borderCount(2)).toBe(3);
		expect(borderCount(5)).toBe(6);
	});

	it("still shows members exactly at the limit", () => {
		expect(borderCount(SELECTION_MEMBER_BORDER_LIMIT)).toBe(
			SELECTION_MEMBER_BORDER_LIMIT + 1,
		);
	});

	it("collapses to a single box one member past the limit", () => {
		expect(borderCount(SELECTION_MEMBER_BORDER_LIMIT + 1)).toBe(1);
	});

	it("stays at one box however large the selection gets", () => {
		// Also the point of skipping the member loop rather than only hiding the
		// borders: this runs on every composited frame while a selection exists.
		expect(borderCount(60)).toBe(1);
		expect(borderCount(500)).toBe(1);
	});
});
