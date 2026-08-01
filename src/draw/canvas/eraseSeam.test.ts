import { describe, expect, it, vi } from "vitest";
import { createFabricEventBridge } from "@/draw/canvas/fabricEventBridge";

vi.mock("@/draw/rendering/bakery/tileBakeryClient", () => ({
	bakeryClipSet: () => {},
	bakeryMarkDirty: () => {},
}));
vi.mock("@/draw/transform/transformController", () => ({
	invalidateCache: () => {},
	invalidateVacatedCache: () => {},
	ownsTarget: () => false,
}));

function bridgeFor(engine: any) {
	const events = createFabricEventBridge({
		getEngine: () => engine,
		isLoading: () => false,
		isBatching: () => false,
		noteRegion: () => false,
		objectBounds: () => ({ x: 0, y: 0, w: 1, h: 1 }),
		unionRect: (a: any) => a,
		updateSpatialIndex: () => {},
		zIndex: { invalidate: () => {} } as any,
		onObjectAdded: () => {},
		onObjectRemoved: () => {},
		onObjectModified: () => {},
		onStyleChanged: () => {},
	} as any);
	const seam = events.find((event) => event.on === "erasing:end");
	if (!seam) throw new Error("erasing:end seam missing");
	return seam.handler as (event: any) => void;
}

const RECT = { x: 0, y: 0, w: 50, h: 50 };

describe("erase seam", () => {
	it("invalidates nothing when the stroke clipped no objects", () => {
		// Empty space, or content the lobby/claim rules protect. No pixels
		// changed, so marking the footprint dirty would drop it to the overview
		// for no reason — the blur after erasing over nothing.
		const engine = {
			onErase: vi.fn(),
			markDirty: vi.fn(),
			requestFrame: vi.fn(),
		};
		bridgeFor(engine)({
			detail: { path: { id: "p" }, dirtyRect: RECT, targets: [] },
		});

		expect(engine.onErase).not.toHaveBeenCalled();
		expect(engine.markDirty).not.toHaveBeenCalled();
		// One repaint still restores the lower context the brush punched live.
		expect(engine.requestFrame).toHaveBeenCalledOnce();
	});

	it("still commits an erase that clipped something", () => {
		const engine = {
			onErase: vi.fn(),
			markDirty: vi.fn(),
			requestFrame: vi.fn(),
		};
		bridgeFor(engine)({
			detail: {
				path: { id: "p", globalCompositeOperation: "destination-out" },
				dirtyRect: RECT,
				targets: [{ id: "a" }],
			},
		});

		expect(engine.onErase).toHaveBeenCalledWith(expect.anything(), RECT, true);
	});
});
