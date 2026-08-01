import type { FabricObject } from "fabric";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_LAYER_ID, createLayer } from "@/draw/layers/layer.types";
import {
	resetLayerRegistry,
	setActiveLayerId,
	setLayerSet,
} from "@/draw/layers/layerRegistry";
import { isEraseProtected, isEraseTarget } from "@/draw/tools/erasePolicy";

function object(layerId?: string, erasable = true): FabricObject {
	return { layerId, erasable } as unknown as FabricObject;
}

describe("erase policy", () => {
	beforeEach(() => resetLayerRegistry());

	it("erases only erasable objects on the active layer", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base"), createLayer("l1", "Top")],
			"mutable",
		);
		setActiveLayerId("l1");

		expect(isEraseTarget(object("l1"))).toBe(true);
		expect(isEraseTarget(object(BASE_LAYER_ID))).toBe(false);
		expect(isEraseTarget(object(undefined))).toBe(false);
		expect(isEraseTarget(object("l1", false))).toBe(false);
	});

	it("protects exactly what it does not erase", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base"), createLayer("l1", "Top")],
			"mutable",
		);
		setActiveLayerId("l1");

		// The live mask and the commit must never disagree — that split is what
		// made other layers vanish mid-stroke and reappear on release.
		for (const candidate of [
			object("l1"),
			object(BASE_LAYER_ID),
			object(undefined),
			object("l1", false),
		]) {
			expect(isEraseProtected(candidate)).toBe(!isEraseTarget(candidate));
		}
	});

	it("leaves a single-layer drawing unrestricted", () => {
		expect(isEraseTarget(object(undefined))).toBe(true);
		expect(isEraseTarget(object("anything"))).toBe(true);
		expect(isEraseProtected(object(undefined, false))).toBe(true);
	});
});
