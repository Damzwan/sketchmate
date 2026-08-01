import { beforeEach, describe, expect, it, vi } from "vitest";

let serializedLayers: any;

vi.mock("@/draw/layers/layers.store", () => ({
	useLayersStore: () => ({ serialize: () => serializedLayers }),
}));

import { createRoomCanvasSnapshot } from "./roomSnapshot";

describe("room snapshot layer bootstrap", () => {
	beforeEach(() => {
		serializedLayers = undefined;
	});

	it("includes an existing mutable layer document beside Fabric objects", () => {
		serializedLayers = [
			{ id: "l0", name: "Ink", order: 0, visible: true, locked: false },
			{ id: "details", name: "Details", order: 1, visible: true, locked: false },
		];
		const fabricJSON = { version: "7", objects: [{ id: "stroke" }] };
		const canvas = { toJSON: vi.fn(() => ({ ...fabricJSON })) } as any;

		expect(createRoomCanvasSnapshot(canvas)).toEqual({
			...fabricJSON,
			layers: serializedLayers,
		});
		expect(canvas.toJSON).toHaveBeenCalledOnce();
	});

	it("keeps fixed public-room snapshots free of redundant layer metadata", () => {
		const canvas = {
			toJSON: () => ({ version: "7", objects: [] }),
		} as any;

		expect(createRoomCanvasSnapshot(canvas)).toEqual({
			version: "7",
			objects: [],
		});
	});
});
