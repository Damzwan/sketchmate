import type { FabricObject } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	BASE_LAYER_ID,
	createLayer,
	FIXED_ROOM_LAYERS,
} from "@/draw/layers/layer.types";
import {
	compareRenderOrder,
	hasHiddenLayers,
	isLayerHidden,
	isLayerLocked,
	isOnActiveLayer,
	isOnTopLayer,
	layerCount,
	layerOrderOf,
	resetLayerRegistry,
	setActiveLayerId,
	setLayerSet,
} from "@/draw/layers/layerRegistry";
import { createDrawingSpatialIndex } from "@/draw/objects/indexing/spatialIndex";
import { ExplicitZIndex } from "@/draw/objects/indexing/zIndex";

vi.mock("@/draw/rendering/bakery/tileBakeryClient", () => ({
	bakeryClipSet: () => {},
	bakeryMarkDirty: () => {},
	bakeryZOrder: () => {},
}));

function object(id: string, layerId: string, x = 0): FabricObject {
	const bounds = { left: x, top: 0, width: 10, height: 10 };
	return {
		id,
		layerId,
		getBoundingRect: () => bounds,
	} as unknown as FabricObject;
}

function indexFor(objects: FabricObject[]) {
	const objectMap = new Map(objects.map((o) => [o.id, o]));
	const zIndex = new ExplicitZIndex(() => objects, objectMap);
	zIndex.seed(objects);
	const index = createDrawingSpatialIndex(objectMap, zIndex);
	for (const o of objects) index.addToQuadTree(o);
	return index;
}

const WORLD = { x: -100, y: -100, w: 400, h: 400 };

describe("layer registry", () => {
	beforeEach(() => resetLayerRegistry());

	it("folds unknown and legacy ids into the bottom layer", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		expect(layerOrderOf(BASE_LAYER_ID)).toBe(0);
		expect(layerOrderOf("l1")).toBe(1);
		expect(layerOrderOf(undefined)).toBe(0);
		expect(layerOrderOf("deleted-layer")).toBe(0);
	});

	it("ranks by layer first and explicit z second", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		// A LOW z on a HIGH layer still wins: layer rank dominates.
		const low = { __lo: 1, __z: 0 };
		const high = { __lo: 0, __z: 999 };
		expect(compareRenderOrder(high, low)).toBeLessThan(0);
		expect(
			compareRenderOrder({ __lo: 0, __z: 2 }, { __lo: 0, __z: 5 }),
		).toBeLessThan(0);
	});

	it("knows what can still be painted over an object", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		expect(layerCount()).toBe(2);
		expect(isOnTopLayer("l1")).toBe(true);
		expect(isOnTopLayer(BASE_LAYER_ID)).toBe(false);
		// Legacy objects (no layerId) sit at the bottom, so something can.
		expect(isOnTopLayer(undefined)).toBe(false);
	});

	it("scopes edits to the layer being worked on", () => {
		// What the eraser's `erasableFilter` and `querySelectable` both rest on.
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		setActiveLayerId("l1");
		expect(isOnActiveLayer("l1")).toBe(true);
		expect(isOnActiveLayer(BASE_LAYER_ID)).toBe(false);
		expect(isOnActiveLayer(undefined)).toBe(false);

		// A single-layer drawing has no "other layer", so nothing is restricted.
		setLayerSet([createLayer(BASE_LAYER_ID, "Base", 0)], "mutable");
		expect(isOnActiveLayer(undefined)).toBe(true);
		expect(isOnActiveLayer("whatever")).toBe(true);
	});

	it("costs nothing to check visibility while every layer is visible", () => {
		setLayerSet(FIXED_ROOM_LAYERS, "fixed");
		expect(hasHiddenLayers()).toBe(false);
		expect(isLayerHidden("l2")).toBe(false);

		setLayerSet(
			FIXED_ROOM_LAYERS.map((l) =>
				l.id === "l2" ? { ...l, visible: false, locked: true } : l,
			),
			"fixed",
		);
		expect(hasHiddenLayers()).toBe(true);
		expect(isLayerHidden("l2")).toBe(true);
		expect(isLayerLocked("l2")).toBe(true);
		expect(isLayerHidden("l1")).toBe(false);
	});
});

describe("spatial index with layers", () => {
	beforeEach(() => resetLayerRegistry());

	it("sorts render queries by layer, not by insertion order", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		// `top` was added FIRST, so its explicit z is lower than `base`'s.
		const top = object("top", "l1");
		const base = object("base", BASE_LAYER_ID);
		const index = indexFor([top, base]);

		expect(index.spatialIndex.query(WORLD).map((o) => o.id)).toEqual([
			"base",
			"top",
		]);
	});

	it("hides a hidden layer from every render query", () => {
		const visible = object("visible", BASE_LAYER_ID);
		const hidden = object("hidden", "l1");
		const index = indexFor([visible, hidden]);
		setLayerSet(
			[
				createLayer(BASE_LAYER_ID, "Base", 0),
				{ ...createLayer("l1", "Top", 1), visible: false },
			],
			"mutable",
		);

		expect(index.spatialIndex.query(WORLD).map((o) => o.id)).toEqual([
			"visible",
		]);
		expect(index.spatialIndex.queryBounds(WORLD).map((e) => e.obj.id)).toEqual([
			"visible",
		]);
		expect(index.queryObjects(WORLD).map((o) => o.id)).toEqual(["visible"]);
		// Bookkeeping callers (erase-undo repair, claim enforcement) still see it.
		expect(
			index
				.queryObjectsRaw(WORLD)
				.map((o) => o.id)
				.sort(),
		).toEqual(["hidden", "visible"]);
	});

	it("excludes locked layers from hit-testing only", () => {
		const free = object("free", BASE_LAYER_ID);
		const locked = object("locked", "l1");
		const index = indexFor([free, locked]);
		setLayerSet(
			[
				createLayer(BASE_LAYER_ID, "Base", 0),
				{ ...createLayer("l1", "Top", 1), locked: true },
			],
			"mutable",
		);

		expect(index.queryInteractiveObjects(WORLD).map((o) => o.id)).toEqual([
			"free",
		]);
		// Locked content must still RENDER — it is only untouchable.
		expect(index.spatialIndex.query(WORLD).map((o) => o.id)).toEqual([
			"free",
			"locked",
		]);
	});

	it("offers only the active layer as a selection target", () => {
		const below = object("below", BASE_LAYER_ID);
		const above = object("above", "l1");
		const index = indexFor([below, above]);
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);

		setActiveLayerId(BASE_LAYER_ID);
		expect(index.querySelectableObjects(WORLD).map((o) => o.id)).toEqual([
			"below",
		]);
		setActiveLayerId("l1");
		expect(index.querySelectableObjects(WORLD).map((o) => o.id)).toEqual([
			"above",
		]);
		// Erasing and other interactions still reach every unlocked layer.
		expect(index.queryInteractiveObjects(WORLD)).toHaveLength(2);
	});

	it("does not scope selection in a single-layer drawing", () => {
		const index = indexFor([
			object("a", BASE_LAYER_ID),
			object("b", BASE_LAYER_ID),
		]);
		expect(index.querySelectableObjects(WORLD)).toHaveLength(2);
	});

	it("bounds a layer's footprint to its own objects", () => {
		setLayerSet(
			[createLayer(BASE_LAYER_ID, "Base", 0), createLayer("l1", "Top", 1)],
			"mutable",
		);
		const index = indexFor([
			object("a", BASE_LAYER_ID, 0),
			object("b", "l1", 200),
		]);

		expect(index.layerContentBounds("l1")).toEqual({
			x: 200,
			y: 0,
			w: 10,
			h: 10,
		});
		expect(index.objectIdsOnLayer("l1")).toEqual(["b"]);
		expect(index.layerContentBounds("empty-layer")).toBeNull();
	});
});
