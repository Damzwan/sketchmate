import { describe, expect, it } from "vitest";
import {
	createStrokeConstraint,
	type InstrumentGeometry,
} from "@/draw/tools/instruments/instrumentGeometry";

describe("instrument stroke constraints", () => {
	it("locks a ruler stroke to the edge chosen on pointer down", () => {
		const ruler: InstrumentGeometry = {
			type: "ruler",
			center: { x: 0, y: 0 },
			length: 200,
			width: 40,
			angle: 0,
		};
		const constrain = createStrokeConstraint(ruler, { x: -50, y: 17 }, 8);

		expect(constrain).not.toBeNull();
		expect(constrain?.({ x: 60, y: -18 })).toEqual({ x: 60, y: 20 });
	});

	it("clamps ruler strokes to the physical ends", () => {
		const ruler: InstrumentGeometry = {
			type: "ruler",
			center: { x: 10, y: 20 },
			length: 100,
			width: 20,
			angle: 0,
		};
		const constrain = createStrokeConstraint(ruler, { x: 10, y: 31 }, 4);

		expect(constrain?.({ x: 500, y: 35 })).toEqual({ x: 60, y: 30 });
	});

	it("leaves strokes away from a ruler unconstrained", () => {
		const ruler: InstrumentGeometry = {
			type: "ruler",
			center: { x: 0, y: 0 },
			length: 200,
			width: 40,
			angle: 0,
		};

		expect(createStrokeConstraint(ruler, { x: 0, y: 70 }, 10)).toBeNull();
	});

	it("projects compass strokes onto one stable radius", () => {
		const compass: InstrumentGeometry = {
			type: "compass",
			center: { x: 25, y: 30 },
			radius: 50,
		};
		const constrain = createStrokeConstraint(compass, { x: 76, y: 30 }, 3);

		expect(constrain).not.toBeNull();
		expect(constrain?.({ x: 25, y: 100 })).toEqual({ x: 25, y: 80 });
	});

	it("does not capture a compass stroke that begins away from its outline", () => {
		const compass: InstrumentGeometry = {
			type: "compass",
			center: { x: 0, y: 0 },
			radius: 50,
		};

		expect(createStrokeConstraint(compass, { x: 10, y: 0 }, 5)).toBeNull();
	});
});
