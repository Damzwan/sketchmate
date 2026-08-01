import { describe, expect, it } from "vitest";
import {
	restoreStrokeDefaults,
	STROKE_DEFAULTS,
	stripStrokeDefaults,
} from "@/draw/objects/strokeDefaults";

/** A stroke as fabric's `toObject` emits it: exhaustive, mostly defaults. */
function serializedStroke() {
	return {
		id: "s1",
		type: "WaterColorStroke",
		left: 560.374,
		top: 515.642,
		stroke: "#000000FF",
		strokeWidth: 2.24,
		opacity: 0.45,
		...STROKE_DEFAULTS,
	} as Record<string, any>;
}

describe("stroke default stripping", () => {
	it("round-trips to exactly what fabric would have been handed", () => {
		const original = serializedStroke();
		const stripped = stripStrokeDefaults({ ...original });
		const restored = restoreStrokeDefaults(stripped);

		// Symmetric: this is the whole safety argument for stripping at all.
		expect(restored).toEqual(original);
	});

	it("actually removes the bulk", () => {
		const original = serializedStroke();
		const strippedBytes = JSON.stringify(
			stripStrokeDefaults({ ...original }),
		).length;
		const fullBytes = JSON.stringify(original).length;

		expect(strippedBytes).toBeLessThan(fullBytes / 2);
	});

	it("never touches a property that differs from the default", () => {
		const modified: Record<string, any> = {
			...serializedStroke(),
			visible: false,
			skewX: 12,
			angle: 90,
			flipX: true,
			globalCompositeOperation: "destination-out",
			strokeDashArray: [4, 2],
			shadow: { color: "#000", blur: 3 },
		};
		const stripped = stripStrokeDefaults({ ...modified });

		for (const key of [
			"visible",
			"skewX",
			"angle",
			"flipX",
			"globalCompositeOperation",
			"strokeDashArray",
			"shadow",
		]) {
			expect(stripped[key]).toEqual(modified[key]);
		}
	});

	it("leaves the origin alone", () => {
		// Fabric ships "left"/"top"; this app overrides to "center" through
		// ownDefaults. Stripping the origin would make every saved stroke depend
		// on that override still being installed — and a mismatch shifts geometry
		// silently instead of failing.
		const stripped = stripStrokeDefaults({
			originX: "center",
			originY: "center",
			skewX: 0,
		});
		expect(stripped.originX).toBe("center");
		expect(stripped.originY).toBe("center");
		expect("skewX" in stripped).toBe(false);
	});

	it("restores an already-complete object unchanged", () => {
		const complete = serializedStroke();
		expect(restoreStrokeDefaults({ ...complete })).toEqual(complete);
	});
});
